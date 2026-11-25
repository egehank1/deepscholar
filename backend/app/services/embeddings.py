"""Embedding generation through any OpenAI-compatible API (OpenAI or Ollama).

Design notes
------------
* The public surface is a single function, ``embed_chunks``, keeping the
  module easy to swap out (e.g. for a local model) without touching callers.
* Chunks are sent in batches so a document with many chunks only needs
  ceil(n / batch_size) API round-trips.
* The client lives in ``ai_client.py`` and is created on first use, so the
  app can start before a key or a local model is configured.
* All metadata from the incoming Chunk TypedDict (chunk_id, start_index,
  end_index) is forwarded verbatim into the EmbeddedChunk metadata field.
"""

from __future__ import annotations

from typing import Any, TypedDict

from app.core.config import settings
from app.services.ai_client import get_client
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


def _embed_batch(texts: list[str]) -> list[list[float]]:
    """Call the embeddings endpoint (OpenAI or Ollama) for one batch of texts."""
    client = get_client()
    kwargs: dict[str, Any] = {
        "model": settings.EMBEDDING_MODEL,
        "input": texts,
        "encoding_format": "float",
    }
    # text-embedding-3-* can shorten its output, which lets you pick a size
    # pgvector can index (<= 2000 dims). Other models just return their size.
    if settings.LLM_PROVIDER == "openai" and settings.EMBEDDING_MODEL.startswith("text-embedding-3"):
        kwargs["dimensions"] = settings.VECTOR_DIMENSIONS

    response = client.embeddings.create(**kwargs)
    vectors = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]

    if vectors and len(vectors[0]) != settings.VECTOR_DIMENSIONS:
        raise RuntimeError(
            f"{settings.EMBEDDING_MODEL} returned {len(vectors[0])}-dim vectors but "
            f"VECTOR_DIMENSIONS is {settings.VECTOR_DIMENSIONS}. Set VECTOR_DIMENSIONS="
            f"{len(vectors[0])} in backend/.env (and recreate the documents table)."
        )
    return vectors


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# It takes user input (text) and converts it into a vector of numbers that represents the semantic meaning of that text.

def embed_query(text: str) -> list[float]:
    """
    Embed a single query string and return its float vector.

    Uses the same model as ``embed_chunks`` so similarity scores are comparable.

    Parameters
    ----------
    text:
        The user's query string.

    Returns
    -------
    list[float]
        Float vector with ``settings.VECTOR_DIMENSIONS`` dimensions.
    """
    if not text or not text.strip():
        raise ValueError("Query text must not be empty.")
    return _embed_batch([text])[0]


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

    batch_size = settings.EMBEDDING_BATCH_SIZE
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
                        "model": settings.EMBEDDING_MODEL,
                    },
                )
            )

    return results
