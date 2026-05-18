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

Hybrid search notes
-------------------
* ``keyword_search`` uses PostgreSQL's built-in full-text search
  (``to_tsvector`` / ``plainto_tsquery`` / ``ts_rank_cd``).  No extra
  extension is required — it works on the existing ``text`` column.
  Adding a GIN index speeds it up significantly for large collections:
    CREATE INDEX ON documents USING gin(to_tsvector('english', text));
* ``hybrid_search`` merges the vector and keyword ranked lists using
  Reciprocal Rank Fusion (RRF) with the standard k=60 constant.  RRF
  is parameter-free, does not require score normalisation, and
  consistently outperforms linear score combination in practice.
"""

from __future__ import annotations

import json
from typing import Any

import psycopg2
import psycopg2.extras
from pgvector.psycopg2 import register_vector

from app.core.config import settings
from app.services.embeddings import EmbeddedChunk

# Avoid a circular import: PaperExtraction is imported lazily inside functions
# that need it, so this module can still be imported before extraction.py loads.


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


def delete_by_source(source: str) -> int:
    """
    Delete all chunks whose ``metadata->>'source'`` matches *source*.

    Returns the number of rows deleted.  Call this before re-ingesting a file
    so that uploading the same PDF twice replaces rather than duplicates data.

    Raises
    ------
    RuntimeError
        If ``SUPABASE_DB_URL`` is not configured.
    psycopg2.Error
        Propagated on any database error; the transaction is rolled back.
    """
    conn = _get_conn()
    try:
        with _cursor() as cur:
            cur.execute(
                "DELETE FROM documents WHERE metadata->>'source' = %s",
                (source,),
            )
            deleted = cur.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return deleted


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


def keyword_search(
    query: str,
    top_k: int = 20,
    metadata_filter: dict[str, Any] | None = None,
) -> list[SearchResult]:
    """
    Full-text keyword search using PostgreSQL's built-in text-search engine.

    Uses ``plainto_tsquery`` (safe for user input — no special syntax
    required) and ``ts_rank_cd`` for position-weighted scoring.

    Parameters
    ----------
    query:
        The user's natural-language question / keywords.
    top_k:
        Maximum number of results to return.
    metadata_filter:
        Optional ``JSONB @>`` filter (same semantics as ``search_similar``).

    Returns
    -------
    list[SearchResult]
        Ordered by descending keyword-relevance score.  ``score`` is the
        raw ``ts_rank_cd`` value (not normalised to 0–1).

    Raises
    ------
    RuntimeError
        If ``SUPABASE_DB_URL`` is not configured.
    psycopg2.Error
        Propagated on any database error.
    """
    filter_clause = ""
    params: list[Any] = [query, query]

    if metadata_filter:
        filter_clause = "AND metadata @> %s::jsonb"
        params.append(json.dumps(metadata_filter))

    params.append(top_k)

    sql = f"""
        SELECT
            id::text,
            text,
            metadata,
            ts_rank_cd(
                to_tsvector('english', text),
                plainto_tsquery('english', %s)
            ) AS score
        FROM documents
        WHERE to_tsvector('english', text) @@ plainto_tsquery('english', %s)
        {filter_clause}
        ORDER BY score DESC
        LIMIT %s
    """

    with _cursor() as cur:
        cur.execute(sql, params)
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


def ensure_tables() -> None:
    """Create application tables if they do not yet exist.

    Safe to call on every startup — uses ``CREATE TABLE IF NOT EXISTS``.
    """
    conn = _get_conn()
    ddl = """
        CREATE TABLE IF NOT EXISTS paper_extractions (
            id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
            source      TEXT        NOT NULL,
            title       TEXT,
            authors     JSONB       NOT NULL DEFAULT '[]'::jsonb,
            abstract    TEXT,
            methodology TEXT,
            methods     JSONB       NOT NULL DEFAULT '[]'::jsonb,
            datasets    JSONB       NOT NULL DEFAULT '[]'::jsonb,
            metrics     JSONB       NOT NULL DEFAULT '[]'::jsonb,
            tasks       JSONB       NOT NULL DEFAULT '[]'::jsonb,
            improves_on JSONB       NOT NULL DEFAULT '[]'::jsonb,
            limitations TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT paper_extractions_source_key UNIQUE (source)
        );
        CREATE INDEX IF NOT EXISTS paper_extractions_source_idx
            ON paper_extractions (source);

        CREATE TABLE IF NOT EXISTS query_evaluations (
            id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
            question             TEXT        NOT NULL,
            answer               TEXT        NOT NULL,
            citations            JSONB       NOT NULL DEFAULT '[]'::jsonb,
            retrieval_stats      JSONB       NOT NULL DEFAULT '{}'::jsonb,
            retrieval_precision  FLOAT,
            citation_correctness FLOAT,
            answer_faithfulness  FLOAT,
            overall_score        FLOAT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS query_evaluations_created_idx
            ON query_evaluations (created_at DESC);
    """
    try:
        with _cursor() as cur:
            cur.execute(ddl)
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def store_extraction(source: str, extraction: "Any") -> None:
    """Upsert a ``PaperExtraction`` for *source* into ``paper_extractions``.

    Parameters
    ----------
    source:
        Original filename used as the canonical document identifier.
    extraction:
        A ``PaperExtraction`` Pydantic model instance.
    """
    conn = _get_conn()
    sql = """
        INSERT INTO paper_extractions
            (source, title, authors, abstract, methodology, methods,
             datasets, metrics, tasks, improves_on, limitations)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (source) DO UPDATE SET
            title       = EXCLUDED.title,
            authors     = EXCLUDED.authors,
            abstract    = EXCLUDED.abstract,
            methodology = EXCLUDED.methodology,
            methods     = EXCLUDED.methods,
            datasets    = EXCLUDED.datasets,
            metrics     = EXCLUDED.metrics,
            tasks       = EXCLUDED.tasks,
            improves_on = EXCLUDED.improves_on,
            limitations = EXCLUDED.limitations,
            created_at  = NOW()
    """
    try:
        with _cursor() as cur:
            cur.execute(sql, (
                source,
                extraction.title,
                json.dumps(extraction.authors),
                extraction.abstract,
                extraction.methodology,
                json.dumps(extraction.methods),
                json.dumps(extraction.datasets),
                json.dumps(extraction.metrics),
                json.dumps(extraction.tasks),
                json.dumps(extraction.improves_on),
                extraction.limitations,
            ))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def get_all_extractions() -> list[dict[str, Any]]:
    """Return all rows from ``paper_extractions`` as plain dicts.

    Returns
    -------
    list[dict]
        Each dict has keys: source, title, authors, abstract, methodology,
        methods, datasets, metrics, tasks, improves_on, limitations, created_at.
    """
    with _cursor() as cur:
        cur.execute(
            "SELECT source, title, authors, abstract, methodology, methods, "
            "datasets, metrics, tasks, improves_on, limitations "
            "FROM paper_extractions ORDER BY created_at"
        )
        rows = cur.fetchall()

    result = []
    for row in rows:
        d = dict(row)
        for field in ("authors", "methods", "datasets", "metrics", "tasks", "improves_on"):
            if isinstance(d[field], str):
                try:
                    d[field] = json.loads(d[field])
                except json.JSONDecodeError:
                    d[field] = []
            elif d[field] is None:
                d[field] = []
        result.append(d)
    return result


def get_distinct_sources() -> list[str]:
    """Return every distinct ``metadata->>'source'`` value in the documents table.

    Used by the chat pipeline to detect which papers are indexed so the
    retrieval layer can guarantee coverage of every document on broad queries.
    """
    with _cursor() as cur:
        cur.execute(
            "SELECT DISTINCT metadata->>'source' AS source "
            "FROM documents "
            "WHERE metadata->>'source' IS NOT NULL "
            "ORDER BY source"
        )
        rows = cur.fetchall()
    return [row["source"] for row in rows]


def search_similar_for_source(
    source: str,
    query_embedding: list[float],
    top_k: int = 2,
) -> list[SearchResult]:
    """Return the top-*top_k* chunks for a specific source document.

    This is used as a coverage guarantee: when a broad query (e.g. "summarise
    all papers") fails to surface any chunk from a particular document via
    hybrid search, this function fetches the best-matching chunk(s) for that
    document directly so every indexed paper is represented in the context.
    """
    return search_similar(
        query_embedding,
        top_k=top_k,
        metadata_filter={"source": source},
    )


def hybrid_search_filtered_sources(
    query: str,
    query_embedding: list[float],
    sources: list[str],
    top_k: int = 5,
    fetch_k: int = 20,
    rrf_k: int = 60,
) -> list[SearchResult]:
    """Hybrid search restricted to a specific set of source documents.

    Equivalent to ``hybrid_search`` but filters both the vector and keyword
    legs to rows whose ``metadata->>'source'`` is in *sources*.  This prevents
    stale or unrelated papers in the database from appearing in results.

    Parameters
    ----------
    sources:
        Whitelist of source filenames to search within.  If empty, returns [].
    """
    if not sources:
        return []

    # Build an ANY(...) clause for the source list.
    placeholders = ",".join(["%s"] * len(sources))

    # -- Vector leg --
    vec_params: list[Any] = [query_embedding, *sources, query_embedding, fetch_k]
    vec_sql = f"""
        SELECT
            id::text,
            text,
            metadata,
            1 - (embedding <=> %s::vector) AS score
        FROM documents
        WHERE metadata->>'source' = ANY(ARRAY[{placeholders}])
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """
    with _cursor() as cur:
        cur.execute(vec_sql, vec_params)
        vec_rows = cur.fetchall()

    vector_results = [
        SearchResult(
            id=row["id"],
            text=row["text"],
            metadata=dict(row["metadata"]) if row["metadata"] else {},
            score=float(row["score"]),
        )
        for row in vec_rows
    ]

    # -- Keyword leg --
    kw_params: list[Any] = [query, query, *sources, fetch_k]
    kw_sql = f"""
        SELECT
            id::text,
            text,
            metadata,
            ts_rank_cd(
                to_tsvector('english', text),
                plainto_tsquery('english', %s)
            ) AS score
        FROM documents
        WHERE to_tsvector('english', text) @@ plainto_tsquery('english', %s)
          AND metadata->>'source' = ANY(ARRAY[{placeholders}])
        ORDER BY score DESC
        LIMIT %s
    """
    with _cursor() as cur:
        cur.execute(kw_sql, kw_params)
        kw_rows = cur.fetchall()

    keyword_results = [
        SearchResult(
            id=row["id"],
            text=row["text"],
            metadata=dict(row["metadata"]) if row["metadata"] else {},
            score=float(row["score"]),
        )
        for row in kw_rows
    ]

    # -- RRF fusion --
    rrf_scores: dict[str, float] = {}
    result_map: dict[str, SearchResult] = {}

    for rank, chunk in enumerate(vector_results, start=1):
        cid = chunk["id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (rrf_k + rank)
        result_map[cid] = chunk

    for rank, chunk in enumerate(keyword_results, start=1):
        cid = chunk["id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (rrf_k + rank)
        if cid not in result_map:
            result_map[cid] = chunk

    sorted_ids = sorted(rrf_scores, key=lambda x: rrf_scores[x], reverse=True)[:top_k]

    return [
        SearchResult(
            id=cid,
            text=result_map[cid]["text"],
            metadata=result_map[cid]["metadata"],
            score=rrf_scores[cid],
        )
        for cid in sorted_ids
    ]


def delete_all_documents() -> int:
    """Delete every row from the ``documents`` table.

    Returns the total number of rows deleted.
    """
    conn = _get_conn()
    try:
        with _cursor() as cur:
            cur.execute("DELETE FROM documents")
            deleted = cur.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return deleted


def hybrid_search(
    query: str,
    query_embedding: list[float],
    top_k: int = 5,
    fetch_k: int = 20,
    metadata_filter: dict[str, Any] | None = None,
    rrf_k: int = 60,
) -> list[SearchResult]:
    """
    Hybrid retrieval: cosine-vector search + keyword search merged via RRF.

    Reciprocal Rank Fusion formula (Cormack et al., 2009):
        RRF(d) = Σ  1 / (k + rank_i(d))
    where the sum runs over each ranked list i that contains document d,
    and k=60 is the standard dampening constant.

    Parameters
    ----------
    query:
        Raw query string (used for keyword search and RRF tie-breaking).
    query_embedding:
        Pre-computed float vector for the query (used for vector search).
    top_k:
        Number of results to return after fusion.
    fetch_k:
        Number of candidates to pull from each individual search before
        merging.  Should be ≥ top_k; larger values improve recall.
    metadata_filter:
        Optional ``JSONB @>`` filter applied to both search legs.
    rrf_k:
        RRF dampening constant (default 60 follows the original paper).

    Returns
    -------
    list[SearchResult]
        Up to *top_k* results ordered by descending RRF score.  The
        ``score`` field holds the RRF score (not a similarity percentage).

    Raises
    ------
    RuntimeError
        If ``SUPABASE_DB_URL`` is not configured.
    psycopg2.Error
        Propagated on any database error.
    """
    vector_results = search_similar(query_embedding, fetch_k, metadata_filter)
    keyword_results = keyword_search(query, fetch_k, metadata_filter)

    rrf_scores: dict[str, float] = {}
    result_map: dict[str, SearchResult] = {}

    for rank, chunk in enumerate(vector_results, start=1):
        cid = chunk["id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (rrf_k + rank)
        result_map[cid] = chunk

    for rank, chunk in enumerate(keyword_results, start=1):
        cid = chunk["id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (rrf_k + rank)
        if cid not in result_map:
            result_map[cid] = chunk

    sorted_ids = sorted(rrf_scores, key=lambda x: rrf_scores[x], reverse=True)[:top_k]

    return [
        SearchResult(
            id=cid,
            text=result_map[cid]["text"],
            metadata=result_map[cid]["metadata"],
            score=rrf_scores[cid],
        )
        for cid in sorted_ids
    ]


# ---------------------------------------------------------------------------
# Evaluation log
# ---------------------------------------------------------------------------

def store_evaluation(
    question: str,
    answer: str,
    citations: list[dict],
    retrieval_stats: dict,
    retrieval_precision: float,
    citation_correctness: float,
    answer_faithfulness: float,
    overall_score: float,
) -> str:
    """Insert a query evaluation record and return its UUID."""
    conn = _get_conn()
    sql = """
        INSERT INTO query_evaluations
            (question, answer, citations, retrieval_stats,
             retrieval_precision, citation_correctness,
             answer_faithfulness, overall_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id::text
    """
    try:
        with _cursor() as cur:
            cur.execute(sql, (
                question,
                answer,
                json.dumps(citations),
                json.dumps(retrieval_stats),
                retrieval_precision,
                citation_correctness,
                answer_faithfulness,
                overall_score,
            ))
            row = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return str(row["id"])


def delete_all_evaluations() -> int:
    """Delete every row from ``query_evaluations``. Returns rows deleted."""
    conn = _get_conn()
    try:
        with _cursor() as cur:
            cur.execute("DELETE FROM query_evaluations")
            deleted = cur.rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return deleted


def get_evaluation_logs(limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    """Return paginated evaluation records ordered newest-first."""
    sql = """
        SELECT id::text, question, answer, citations, retrieval_stats,
               retrieval_precision, citation_correctness,
               answer_faithfulness, overall_score,
               created_at::text
        FROM query_evaluations
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    with _cursor() as cur:
        cur.execute(sql, (limit, offset))
        rows = cur.fetchall()

    result = []
    for row in rows:
        d = dict(row)
        for field in ("citations", "retrieval_stats"):
            if isinstance(d[field], str):
                try:
                    d[field] = json.loads(d[field])
                except json.JSONDecodeError:
                    d[field] = {} if field == "retrieval_stats" else []
        result.append(d)
    return result


def get_evaluation_analytics() -> dict[str, Any]:
    """Return aggregate statistics across all evaluation records."""
    sql = """
        SELECT
            COUNT(*)                              AS total_queries,
            ROUND(AVG(retrieval_precision)::numeric, 4)  AS avg_retrieval_precision,
            ROUND(AVG(citation_correctness)::numeric, 4) AS avg_citation_correctness,
            ROUND(AVG(answer_faithfulness)::numeric, 4)  AS avg_answer_faithfulness,
            ROUND(AVG(overall_score)::numeric, 4)        AS avg_overall_score,
            MIN(created_at)::text                 AS first_query_at,
            MAX(created_at)::text                 AS last_query_at
        FROM query_evaluations
    """
    daily_sql = """
        SELECT
            DATE(created_at)::text                           AS date,
            COUNT(*)                                         AS queries,
            ROUND(AVG(overall_score)::numeric, 4)            AS avg_score
        FROM query_evaluations
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
    """
    with _cursor() as cur:
        cur.execute(sql)
        summary = dict(cur.fetchone() or {})
        cur.execute(daily_sql)
        daily = [dict(r) for r in cur.fetchall()]

    for key in (
        "avg_retrieval_precision",
        "avg_citation_correctness",
        "avg_answer_faithfulness",
        "avg_overall_score",
    ):
        if summary.get(key) is not None:
            summary[key] = float(summary[key])

    summary["total_queries"] = int(summary.get("total_queries") or 0)
    summary["daily_trend"] = daily
    return summary
