"""POST /chat — retrieval-augmented question answering.

Retrieval pipeline (v3)
-----------------------
The pipeline is now **intent-aware**.  Queries that ask about every uploaded
document collectively ("summarise each paper", "compare the contributions",
"main contribution of each") run through a *per-source* retrieval path that
guarantees fair coverage; everything else still uses the global hybrid path.

Per-source path (multi-document queries)
    1.  For each indexed source, run hybrid search restricted to that source
        and keep its top-``_PER_SOURCE_K`` chunks.
    2.  Concatenate the per-source pools.
    3.  Dedup (no truncation), then rerank with a generous ``top_k`` so every
        paper has room in the final context window.

Global path (single-topic queries)
    1.  Hybrid search (vector + keyword → RRF) across the full whitelist.
    2.  Dedup, then BM25 rerank.

Coverage guarantee (both paths)
    Immediately before the LLM call we verify every indexed source has at
    least one chunk in the final context.  Any missing source is back-filled
    with its single best hybrid-search match so broad questions can never
    silently skip a document.

All blocking I/O (embedding, DB query, LLM call) runs in the thread-pool via
``asyncio.to_thread`` to keep the event loop free.
"""

from __future__ import annotations

import asyncio
import re

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services.embeddings import embed_query
from app.services.evaluation import evaluate_response
from app.services.llm import answer_with_context
from app.services.reranker import rerank_chunks
from app.services.vector_store import (
    SearchResult,
    get_distinct_sources,
    hybrid_search,
    hybrid_search_filtered_sources,
    search_similar_for_source,
    store_evaluation,
)

router = APIRouter(tags=["chat"])

# ---------------------------------------------------------------------------
# Pipeline constants
# ---------------------------------------------------------------------------

# Candidates fetched from each search leg (vector + keyword) before fusion.
# Larger = better recall; smaller = faster DB round-trips.
_FETCH_K = 25

# Final passages sent to the LLM after dedup + rerank (single-topic path).
_TOP_K = 6

# Per-source quota for multi-document queries.  Three chunks per paper gives
# the LLM enough material to produce a 1–2 sentence summary while keeping
# total context modest (e.g. 4 papers × 3 = 12 passages).
_PER_SOURCE_K = 3

# Hard upper bound on context passages even for very large libraries.
_MAX_CONTEXT_PASSAGES = 16

# Weight for the pre-existing vector/RRF score during BM25 reranking.
# 0.4 means BM25 contributes 60 % — slightly favours lexical precision.
_VECTOR_WEIGHT = 0.4

# Phrases that strongly indicate the user wants every paper addressed.
# Detection is intentionally permissive: a single match flips us into the
# per-source retrieval path.
_MULTI_DOC_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\beach (?:paper|document|study|article|one)\b",
        r"\bevery (?:paper|document|study|article)\b",
        r"\ball (?:the )?(?:papers|documents|studies|articles)\b",
        r"\bacross (?:the )?papers\b",
        r"\bfor each\b",
        r"\bcompare\b",
        r"\bcomparison\b",
        r"\bcontrast\b",
        r"\bdifferences? between\b",
        r"\bsummari[sz]e (?:the |all |each |every )?",
        r"\bsummary of (?:each|every|all|the)\b",
        r"\bmain contribution",
        r"\bkey (?:contribution|idea|finding|takeaway)s?\b",
        r"\blist (?:the )?(?:papers|contributions|methods|findings)\b",
        r"\boverview of (?:the )?papers\b",
    )
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_multi_doc_query(question: str) -> bool:
    """Heuristic: does the question ask about every paper collectively?"""
    return any(pat.search(question) for pat in _MULTI_DOC_PATTERNS)


def _retrieve_per_source(
    question: str,
    query_embedding: list[float],
    sources: list[str],
    per_source_k: int = _PER_SOURCE_K,
) -> list[SearchResult]:
    """Run hybrid search separately for each source and concatenate.

    This guarantees every paper contributes its own most relevant passages to
    the candidate pool, which is essential for queries like "summarise each
    paper" where a single global search would over-represent the papers whose
    vocabulary best matches the query.
    """
    pool: list[SearchResult] = []
    for source in sources:
        try:
            chunks = hybrid_search_filtered_sources(
                question,
                query_embedding,
                [source],
                top_k=per_source_k,
                fetch_k=per_source_k * 4,
            )
        except Exception:
            # Fall back to plain vector search for this source on hybrid errors.
            try:
                chunks = search_similar_for_source(
                    source, query_embedding, top_k=per_source_k
                )
            except Exception:
                chunks = []
        pool.extend(chunks)
    return pool


def _enforce_source_coverage(
    chunks: list[SearchResult],
    all_sources: list[str],
    question: str,
    query_embedding: list[float],
) -> list[SearchResult]:
    """Guarantee every indexed source has at least one chunk in *chunks*.

    Runs **after** dedup + rerank so the surviving high-quality passages are
    untouched.  For any source missing from the final pool we fetch its single
    best hybrid-search match and append it.
    """
    if not all_sources:
        return chunks

    covered = {c.get("metadata", {}).get("source") for c in chunks}
    missing = [s for s in all_sources if s and s not in covered]
    if not missing:
        return chunks

    extras: list[SearchResult] = []
    for source in missing:
        backfill: list[SearchResult] = []
        try:
            backfill = hybrid_search_filtered_sources(
                question, query_embedding, [source], top_k=1, fetch_k=8
            )
        except Exception:
            backfill = []
        if not backfill:
            try:
                backfill = search_similar_for_source(
                    source, query_embedding, top_k=1
                )
            except Exception:
                backfill = []
        extras.extend(backfill)

    return chunks + extras


def _deduplicate_chunks(
    chunks: list[SearchResult],
    max_results: int | None = None,
) -> list[SearchResult]:
    """Return chunks with unique normalised text content.

    When multiple PDFs contain the same passage the merged search returns all
    copies.  Keeping only the first (highest-scoring) copy ensures the LLM
    sees each unique piece of information exactly once, preventing inflated
    citation counts.

    Passing *max_results=None* (the default) disables truncation so coverage
    chunks appended downstream are not silently lost.
    """
    seen: set[str] = set()
    unique: list[SearchResult] = []
    for chunk in chunks:
        normalised = re.sub(r"\s+", " ", chunk.get("text", "")).strip().lower()
        if not normalised or normalised in seen:
            continue
        seen.add(normalised)
        unique.append(chunk)
        if max_results is not None and len(unique) >= max_results:
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
    sources: list[str] = Field(
        default_factory=list,
        description=(
            "Optional whitelist of source filenames to restrict retrieval to. "
            "When provided, only chunks from these documents are searched. "
            "When empty, all indexed documents are searched."
        ),
    )


class CitationOut(BaseModel):
    text: str = Field(description="Verbatim or near-verbatim passage excerpt.")
    source: str = Field(description="Document identifier (UUID or filename).")


class ChatResponse(BaseModel):
    answer: str = Field(
        description=(
            "Answer grounded exclusively in the retrieved passages. "
            "Every factual sentence carries inline [N] citation markers. "
            "Sentences without citations are filtered out before delivery."
        )
    )
    citations: list[CitationOut] = Field(
        description="Source passages used to construct the answer."
    )
    retrieval_stats: dict = Field(
        default_factory=dict,
        description=(
            "Diagnostic metadata: number of candidates from each search leg "
            "and the final passage count sent to the LLM."
        ),
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Ask a question grounded in uploaded documents",
    response_description=(
        "Grounded answer with per-sentence [N] citations and supporting passages"
    ),
)
async def chat(body: ChatRequest) -> ChatResponse:
    """
    Retrieve relevant document chunks via **hybrid search** (vector + keyword),
    rerank them with **BM25**, and return a GPT-4o-mini answer grounded
    **exclusively** in those chunks.

    For multi-document queries (e.g. *"summarise each paper"*) the retriever
    automatically switches to a per-source path so every uploaded paper is
    represented in the LLM context — no document is silently skipped.
    """
    # ── 1. Embed the question ──────────────────────────────────────────────
    try:
        query_vector: list[float] = await asyncio.to_thread(
            embed_query, body.question
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Embedding service unavailable: {exc}",
        ) from exc

    # ── 2. Resolve the active source list ────────────────────────────────
    if body.sources:
        all_sources: list[str] = body.sources
    else:
        try:
            all_sources = await asyncio.to_thread(get_distinct_sources)
        except Exception:
            all_sources = []

    multi_doc = _is_multi_doc_query(body.question) and len(all_sources) > 1

    # ── 3. Retrieval — per-source path or global hybrid path ─────────────
    try:
        if multi_doc:
            raw_chunks: list[SearchResult] = await asyncio.to_thread(
                _retrieve_per_source,
                body.question,
                query_vector,
                all_sources,
                _PER_SOURCE_K,
            )
        elif all_sources:
            raw_chunks = await asyncio.to_thread(
                hybrid_search_filtered_sources,
                body.question,
                query_vector,
                all_sources,
                _FETCH_K,
                _FETCH_K,
            )
        else:
            raw_chunks = await asyncio.to_thread(
                hybrid_search,
                body.question,
                query_vector,
                _FETCH_K,
                _FETCH_K,
            )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Vector store unavailable: {exc}",
        ) from exc

    hybrid_count = len(raw_chunks)

    # ── 4. Deduplicate (no truncation — coverage chunks must survive) ────
    deduped = _deduplicate_chunks(raw_chunks)

    # ── 5. Rerank ────────────────────────────────────────────────────────
    # Multi-doc queries get a generous top_k so every paper has room.  We cap
    # at _MAX_CONTEXT_PASSAGES to keep prompts compact for very large libraries.
    if multi_doc:
        effective_top_k = min(
            max(_TOP_K, len(all_sources) * _PER_SOURCE_K),
            _MAX_CONTEXT_PASSAGES,
        )
    else:
        effective_top_k = _TOP_K

    reranked = await asyncio.to_thread(
        rerank_chunks,
        body.question,
        deduped,
        effective_top_k,
        _VECTOR_WEIGHT,
    )

    # ── 6. Coverage guarantee (runs AFTER rerank, never dropped) ────────
    if len(all_sources) > 1:
        try:
            reranked = await asyncio.to_thread(
                _enforce_source_coverage,
                reranked,
                all_sources,
                body.question,
                query_vector,
            )
        except Exception:
            pass

    if not reranked:
        return ChatResponse(
            answer="No relevant documents were found for your question.",
            citations=[],
            retrieval_stats={
                "hybrid_candidates": hybrid_count,
                "after_dedup": len(deduped),
                "sent_to_llm": 0,
                "multi_doc": multi_doc,
            },
        )

    # ── 7. Grounded LLM answer ────────────────────────────────────────────
    try:
        grounded = await asyncio.to_thread(
            answer_with_context, body.question, reranked
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM service unavailable: {exc}",
        ) from exc

    # ── 8. Evaluate and log ───────────────────────────────────────────────
    citations_out = [
        CitationOut(text=c.text, source=c.source)
        for c in grounded.citations
    ]
    retrieval_stats = {
        "hybrid_candidates": hybrid_count,
        "after_dedup": len(deduped),
        "sent_to_llm": len(reranked),
        "multi_doc": multi_doc,
        "sources_in_context": sorted({
            c.get("metadata", {}).get("source", "")
            for c in reranked
            if c.get("metadata", {}).get("source")
        }),
    }

    eval_result = evaluate_response(
        answer=grounded.answer,
        citations=[{"text": c.text, "source": c.source} for c in grounded.citations],
        retrieved_chunks=reranked,
    )

    try:
        await asyncio.to_thread(
            store_evaluation,
            body.question,
            grounded.answer,
            [{"text": c.text, "source": c.source} for c in grounded.citations],
            retrieval_stats,
            eval_result.retrieval_precision,
            eval_result.citation_correctness,
            eval_result.answer_faithfulness,
            eval_result.overall_score,
        )
    except Exception:
        # Evaluation logging is non-critical — never fail the user's request.
        pass

    # ── 9. Return structured response ────────────────────────────────────
    return ChatResponse(
        answer=grounded.answer,
        citations=citations_out,
        retrieval_stats={
            **retrieval_stats,
            "eval": {
                "retrieval_precision": eval_result.retrieval_precision,
                "citation_correctness": eval_result.citation_correctness,
                "answer_faithfulness": eval_result.answer_faithfulness,
                "overall_score": eval_result.overall_score,
            },
        },
    )
