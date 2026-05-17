"""POST /chat — retrieval-augmented question answering.

Flow
----
1. Embed the user's question with the same OpenAI model used at ingest time.
2. Retrieve the top-5 most similar chunks from pgvector (cosine similarity).
3. Send the retrieved passages + question to GPT-4o-mini with a strict
   grounding prompt (no hallucination permitted).
4. Return a structured JSON response with ``answer`` and ``citations``.

Both the embedding call and the DB query are synchronous / blocking, so they
are executed in a thread-pool via ``asyncio.to_thread`` to avoid blocking the
event loop.
"""

from __future__ import annotations

import asyncio
import re

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services.embeddings import embed_query
from app.services.llm import answer_with_context
from app.services.vector_store import SearchResult, search_similar

router = APIRouter(tags=["chat"])

# Fetch more candidates so deduplication still yields enough unique passages.
_TOP_K = 5
_FETCH_K = 20


def _deduplicate_chunks(chunks: list[SearchResult], max_results: int = _TOP_K) -> list[SearchResult]:
    """Return at most *max_results* chunks with unique text content.

    When multiple PDFs contain the same passage, the vector search returns all
    of them.  Keeping only the first (highest-scoring) copy ensures the LLM
    sees each unique piece of information exactly once.
    """
    seen: set[str] = set()
    unique: list[SearchResult] = []
    for chunk in chunks:
        # Normalise whitespace so minor formatting differences are ignored.
        normalised = re.sub(r"\s+", " ", chunk.get("text", "")).strip().lower()
        if normalised not in seen:
            seen.add(normalised)
            unique.append(chunk)
            if len(unique) >= max_results:
                break
    return unique


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The user's natural-language question.",
        examples=["What are the main findings of the paper?"],
    )


class CitationOut(BaseModel):
    text: str = Field(description="Verbatim or near-verbatim passage excerpt.")
    source: str = Field(description="Document identifier (UUID or filename).")


class ChatResponse(BaseModel):
    answer: str = Field(
        description=(
            "Answer grounded exclusively in the retrieved passages. "
            "Inline citation markers like [1] reference the citations list."
        )
    )
    citations: list[CitationOut] = Field(
        description="Source passages used to construct the answer."
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Ask a question grounded in uploaded documents",
    response_description="Answer with citations from the vector store",
)
async def chat(body: ChatRequest) -> ChatResponse:
    """
    Retrieve relevant document chunks and return a GPT-4o-mini answer that is
    grounded **exclusively** in those chunks.

    - **question**: natural-language question (1–2 000 characters)
    - **answer**: model response with inline `[N]` citation markers
    - **citations**: list of `{text, source}` objects referenced in the answer
    """
    # 1. Embed the question (blocking I/O → thread pool)
    try:
        query_vector: list[float] = await asyncio.to_thread(
            embed_query, body.question
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Embedding service unavailable: {exc}",
        ) from exc

    # 2. Retrieve top-k similar chunks (blocking DB call → thread pool)
    try:
        raw_chunks = await asyncio.to_thread(search_similar, query_vector, _FETCH_K)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Vector store unavailable: {exc}",
        ) from exc

    # Deduplicate: identical text appearing in multiple PDFs should only be
    # cited once.  Keep the highest-scoring copy (chunks are already ordered
    # by descending similarity).
    chunks = _deduplicate_chunks(raw_chunks, max_results=_TOP_K)

    if not chunks:
        return ChatResponse(
            answer="No relevant documents were found for your question.",
            citations=[],
        )

    # 3. Generate a grounded answer (blocking network call → thread pool)
    try:
        grounded = await asyncio.to_thread(
            answer_with_context, body.question, chunks
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM service unavailable: {exc}",
        ) from exc

    # 4. Return structured response
    return ChatResponse(
        answer=grounded.answer,
        citations=[
            CitationOut(text=c.text, source=c.source)
            for c in grounded.citations
        ],
    )
