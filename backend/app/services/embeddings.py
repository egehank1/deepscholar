"""Embedding generation service using the OpenAI Embeddings API.

Design notes
------------
* The public surface is a single function, ``embed_chunks``, keeping the
  module easy to swap out (e.g. for a local model) without touching callers.
* Chunks are sent in batches so a document with many chunks only needs
  ceil(n / batch_size) API round-trips.
* The OpenAI client is constructed lazily and cached; it is *not* imported at
  module level so the rest of the application can start even when
  OPENAI_API_KEY is not yet configured.
* All metadata from the incoming Chunk TypedDict (chunk_id, start_index,
  end_index) is forwarded verbatim into the EmbeddedChunk metadata field.
"""

from __future__ import annotations

from typing import Any, TypedDict

from app.core.config import settings
from app.services.chunking import Chunk


'''
INPUT
──────────────────────────────────────────────
list of Chunks, each containing:
  • chunk_id     (which chunk number)
  • text         (the actual words)
  • start_index  (where it started in doc)
  • end_index    (where it ended in doc)

        │
        │  split into batches of N
        ▼

OPENAI API CALL (per batch)
──────────────────────────────────────────────
Send:    ["text one", "text two", ...]
Receive: [[0.02, -0.74, ...], [0.51, 0.03, ...], ...]
                 ↑                     ↑
           vector for              vector for
           "text one"              "text two"

        │
        │  zip original chunks with their vectors
        ▼

OUTPUT
──────────────────────────────────────────────
list of EmbeddedChunks, each containing:
  • text         (same text as input)
  • embedding    (the new number list from OpenAI)
  • metadata     (chunk_id, indexes, model name)
'''

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

class EmbeddedChunk(TypedDict):
    text: str
    embedding: list[float]
    metadata: dict[str, Any]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_client: Any = None  # openai.OpenAI — typed as Any to avoid hard import


def _get_client() -> Any:
    """Return a cached OpenAI client, creating it on first call."""
    global _client
    if _client is not None:
        return _client

    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. "
            "Add it to your .env file or export it as an environment variable."
        )

    try:
        import openai  # noqa: PLC0415 — intentional lazy import
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "The 'openai' package is not installed. Run: pip install openai>=1.30.0"
        ) from exc

    _client = openai.OpenAI(api_key=api_key)
    return _client


def _embed_batch(texts: list[str]) -> list[list[float]]:
    """Call the OpenAI embeddings endpoint for a single batch of texts."""
    client = _get_client()
    response = client.embeddings.create(
        model=settings.OPENAI_EMBEDDING_MODEL,
        input=texts,
        encoding_format="float",
    )
    # The API guarantees results in the same order as input.
    return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_chunks(chunks: list[Chunk]) -> list[EmbeddedChunk]:
    """
    Generate embeddings for a list of text chunks.

    Parameters
    ----------
    chunks:
        Output of ``chunking.chunk_text`` — each item must have at minimum
        the keys ``chunk_id``, ``text``, ``start_index``, ``end_index``.

    Returns
    -------
    list[EmbeddedChunk]
        One entry per input chunk, preserving order:

        ``text``      – the original chunk text
        ``embedding`` – float vector from ``text-embedding-3-large`` (3 072 dims)
        ``metadata``  – ``chunk_id``, ``start_index``, ``end_index`` forwarded
                        from the input chunk, plus the model name used

    Raises
    ------
    RuntimeError
        If ``OPENAI_API_KEY`` is missing or the ``openai`` package is absent.
    openai.OpenAIError
        Propagated directly so callers can handle rate-limit / auth errors.
    """
    if not chunks:
        return []

    batch_size = settings.OPENAI_EMBEDDING_BATCH_SIZE
    results: list[EmbeddedChunk] = []

    for batch_start in range(0, len(chunks), batch_size):
        batch = chunks[batch_start : batch_start + batch_size]
        texts = [c["text"] for c in batch]
        embeddings = _embed_batch(texts)

        for chunk, vector in zip(batch, embeddings):
            results.append(
                EmbeddedChunk(
                    text=chunk["text"],
                    embedding=vector,
                    metadata={
                        "chunk_id": chunk["chunk_id"],
                        "start_index": chunk["start_index"],
                        "end_index": chunk["end_index"],
                        "model": settings.OPENAI_EMBEDDING_MODEL,
                    },
                )
            )

    return results
