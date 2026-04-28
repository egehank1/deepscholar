"""pgvector-backed vector store using Supabase (PostgreSQL).

Design notes
------------
* A single persistent ``psycopg2`` connection is lazily created and cached.
  For a production deployment with multiple workers, swap this for a
  connection pool (e.g. ``psycopg2.pool.ThreadedConnectionPool``).
* The ``pgvector`` package's ``register_vector`` call teaches psycopg2 how to
  serialise/deserialise the custom ``vector`` type — without it, embeddings
  arrive as raw strings.
* Both public functions are synchronous; wrap them in
  ``asyncio.get_event_loop().run_in_executor`` if you need async callers.
* SUPABASE_DB_URL must be set in .env before either function is called.
  The module imports cleanly without it so the app can start normally.
"""

from __future__ import annotations

import json
from typing import Any

import psycopg2
import psycopg2.extras
from pgvector.psycopg2 import register_vector

from app.core.config import settings
from app.services.embeddings import EmbeddedChunk


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

class SearchResult(dict):
    """
    Plain dict subclass for a single similarity-search result.

    Keys
    ----
    id          : str   — UUID of the stored document row
    text        : str   — chunk text
    metadata    : dict  — whatever was stored alongside the chunk
    score       : float — cosine similarity (1.0 = identical, 0.0 = orthogonal)
    """


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------

_conn: Any = None   # psycopg2 connection — typed as Any to avoid stubs


def _get_conn() -> Any:
    """Return a cached, live psycopg2 connection to Supabase/PostgreSQL."""
    global _conn

    # Re-use existing connection if still open.
    if _conn is not None and not _conn.closed:
        return _conn

    db_url = settings.SUPABASE_DB_URL
    if not db_url:
        raise RuntimeError(
            "SUPABASE_DB_URL is not set. "
            "Add it to your .env file:\n"
            "  SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]"
            "@db.[REF].supabase.co:5432/postgres"
        )

    _conn = psycopg2.connect(db_url)
    _conn.autocommit = False

    # Register the pgvector type adapter so vectors are handled natively.
    register_vector(_conn)

    return _conn


def _cursor() -> Any:
    return _get_conn().cursor(cursor_factory=psycopg2.extras.RealDictCursor)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def store_chunks(chunks: list[EmbeddedChunk]) -> list[str]:
    """
    Persist a list of embedded chunks to the ``documents`` table.

    Parameters
    ----------
    chunks:
        Output of ``embeddings.embed_chunks`` — each item must have
        ``text``, ``embedding``, and ``metadata``.

    Returns
    -------
    list[str]
        The UUIDs assigned to each inserted row, in input order.

    Raises
    ------
    RuntimeError
        If ``SUPABASE_DB_URL`` is not configured.
    psycopg2.Error
        Propagated on any database error; the transaction is rolled back.
    """
    if not chunks:
        return []

    conn = _get_conn()
    ids: list[str] = []

    try:
        with _cursor() as cur:
            for chunk in chunks:
                cur.execute(
                    """
                    INSERT INTO documents (text, embedding, metadata)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (
                        chunk["text"],
                        chunk["embedding"],    # psycopg2 + pgvector handles list[float]
                        json.dumps(chunk["metadata"]),
                    ),
                )
                row = cur.fetchone()
                ids.append(str(row["id"]))
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return ids


def search_similar(
    query_embedding: list[float],
    top_k: int = 5,
    metadata_filter: dict[str, Any] | None = None,
) -> list[SearchResult]:
    """
    Find the *top_k* most similar chunks using cosine distance.

    Parameters
    ----------
    query_embedding:
        Float vector produced by ``embeddings.embed_chunks`` (or the same
        OpenAI model call) for the user's query text.
    top_k:
        Number of results to return (default 5).
    metadata_filter:
        Optional ``JSONB @>`` filter, e.g. ``{"source": "paper.pdf"}`` to
        restrict search to a specific document.

    Returns
    -------
    list[SearchResult]
        Ordered by descending similarity (best match first). Each entry has:
        ``id``, ``text``, ``metadata``, ``score`` (cosine similarity 0–1).

    Raises
    ------
    RuntimeError
        If ``SUPABASE_DB_URL`` is not configured.
    psycopg2.Error
        Propagated on any database error.
    """
    params: list[Any] = [query_embedding, top_k]

    filter_clause = ""
    if metadata_filter:
        filter_clause = "WHERE metadata @> %s::jsonb"
        params.insert(1, json.dumps(metadata_filter))   # bind before top_k

    query = f"""
        SELECT
            id::text,
            text,
            metadata,
            1 - (embedding <=> %s::vector) AS score
        FROM documents
        {filter_clause}
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """

    # The embedding appears twice: once for the score expression, once for ORDER BY.
    if metadata_filter:
        params = [query_embedding, json.dumps(metadata_filter), query_embedding, top_k]
    else:
        params = [query_embedding, query_embedding, top_k]

    with _cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [
        SearchResult(
            id=row["id"],
            text=row["text"],
            metadata=dict(row["metadata"]) if row["metadata"] else {},
            score=float(row["score"]),
        )
        for row in rows
    ]
