"""RAG quality evaluation service.

Three metrics are computed synchronously after every chat response:

Retrieval Precision
    For single-source queries: fraction of retrieved chunks that were
    actually cited in the answer.  A low value means the retriever is
    returning noise.
    For multi-source queries: the better of chunk-level precision and
    *source-level* coverage (fraction of distinct retrieved papers cited
    at least once).  Multi-paper summary queries deliberately fetch a few
    candidates per paper to guarantee coverage, so penalising the system
    for sending uncited chunks would punish the very mechanism that
    prevents skipping documents.

Citation Correctness
    For each citation the model emitted, do its content tokens appear
    inside one of the retrieved chunks?  Measured as *coverage* of the
    citation's tokens by the best-matching chunk (NOT Jaccard against the
    full chunk — that would penalise short, accurate excerpts).
    A low value means the model is confabulating or mis-attributing
    sources.
    Formula: verified_citations / total_citations

Answer Faithfulness
    What fraction of factual sentences in the answer are annotated with at
    least one [N] citation marker?  Sentences the model left uncited are
    treated as potential hallucinations.  (The LLM prompt already enforces
    citations, so this catches any leakage.)
    Formula: cited_sentences / factual_sentences

Overall Score
    Unweighted arithmetic mean of the three metrics above.

All three metrics are bounded in [0.0, 1.0] and stored as floats.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.vector_store import SearchResult


# ---------------------------------------------------------------------------
# Regex helpers (mirrors the patterns in llm.py for consistency)
# ---------------------------------------------------------------------------

_CITATION_MARKER_RE = re.compile(r"\[(\d+)(?:,\s*\d+)*\]")
_ALL_MARKERS_RE = re.compile(r"\[(\d+)(?:,\s*\d+)*\]")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_BOLD_LABEL_RE = re.compile(r"^\*\*[^*]+\*\*[.:!?]?\s*$")

_NON_FACTUAL_OPENERS = (
    "in summary",
    "to summarize",
    "the answer",
    "note that",
    "please note",
    "as mentioned",
    "based on the",
    "according to the",
)


def _extract_cited_indices(answer: str) -> set[int]:
    """Return the set of 1-based passage indices mentioned anywhere in answer."""
    indices: set[int] = set()
    for m in _ALL_MARKERS_RE.finditer(answer):
        # Each match may contain multiple comma-separated numbers, e.g. [1, 3]
        for num_str in re.findall(r"\d+", m.group()):
            indices.add(int(num_str))
    return indices


def _is_factual_sentence(sentence: str) -> bool:
    """Mirror of llm._looks_like_factual so the two pipelines agree.

    Sentences that are just Markdown labels (paper-title headings) or
    Markdown headings are structural, not factual, and therefore do not
    need to carry a citation marker for faithfulness scoring.
    """
    stripped = sentence.strip()
    if len(stripped.split()) <= 6:
        return False
    if _BOLD_LABEL_RE.match(stripped):
        return False
    if stripped.startswith("#"):
        return False
    lower = stripped.lower()
    return not any(lower.startswith(op) for op in _NON_FACTUAL_OPENERS)


def _has_citation_marker(sentence: str) -> bool:
    return bool(_CITATION_MARKER_RE.search(sentence))


# ---------------------------------------------------------------------------
# Public result type
# ---------------------------------------------------------------------------

@dataclass
class EvaluationResult:
    retrieval_precision: float
    citation_correctness: float
    answer_faithfulness: float
    overall_score: float


# ---------------------------------------------------------------------------
# Metric calculators
# ---------------------------------------------------------------------------

def _retrieval_precision(
    answer: str,
    retrieved_chunks: list[SearchResult],
) -> float:
    """Retrieval utility score with multi-source-aware semantics.

    Single-source pools: classic chunk-level precision
        cited_chunks / retrieved_chunks.

    Multi-source pools: we take the better of chunk-level precision and
    source-level coverage (distinct cited papers / distinct retrieved
    papers).  Coverage rewards the system for hitting every paper in a
    multi-document summary even though some chunks per paper went unused;
    chunk precision still applies when it's higher (e.g. a focused query
    that happens to span two papers).
    """
    n = len(retrieved_chunks)
    if n == 0:
        return 1.0

    cited_indices = _extract_cited_indices(answer)
    cited_count = sum(1 for i in range(1, n + 1) if i in cited_indices)
    chunk_precision = cited_count / n

    sources_retrieved: set[str] = set()
    sources_cited: set[str] = set()
    for i, chunk in enumerate(retrieved_chunks, start=1):
        src = chunk.get("metadata", {}).get("source") or ""
        if not src:
            continue
        sources_retrieved.add(src)
        if i in cited_indices:
            sources_cited.add(src)

    if len(sources_retrieved) > 1:
        source_coverage = len(sources_cited) / len(sources_retrieved)
        return round(max(chunk_precision, source_coverage), 4)

    return round(chunk_precision, 4)


def _normalise(text: str) -> list[str]:
    """Lowercase and split into alphabetic tokens of length ≥ 2."""
    return re.findall(r"[a-z]{2,}", text.lower())


def _citation_coverage(
    citation_tokens: set[str],
    chunk_tokens: set[str],
) -> float:
    """Fraction of citation tokens that appear in the chunk.

    This is the right shape for "is the citation grounded in this chunk?".
    Jaccard would unfairly penalise short, accurate excerpts (4 tokens vs a
    100-token chunk gives Jaccard 0.04 even when the excerpt is fully
    contained in the chunk).
    """
    if not citation_tokens:
        return 0.0
    return len(citation_tokens & chunk_tokens) / len(citation_tokens)


def _citation_correctness(
    citations: list[dict],
    retrieved_chunks: list[SearchResult],
) -> float:
    """Fraction of emitted citations whose text is grounded in a retrieved chunk.

    A citation is accepted when its tokens are mostly present in some
    retrieved chunk's tokens — i.e. coverage(excerpt → chunk) ≥ 0.6.  This
    is robust to PDF whitespace artefacts and minor paraphrasing while
    still catching confabulated quotes.
    """
    if not citations:
        return 1.0

    _COVERAGE_THRESHOLD = 0.6

    chunk_token_sets = [set(_normalise(c.get("text", ""))) for c in retrieved_chunks]

    verified = 0
    scored = 0
    for citation in citations:
        cite_text = (citation.get("text") or "").strip()
        if not cite_text:
            continue
        cite_tokens = set(_normalise(cite_text))
        if not cite_tokens:
            continue
        scored += 1
        best = max(
            (_citation_coverage(cite_tokens, chunk_tokens) for chunk_tokens in chunk_token_sets),
            default=0.0,
        )
        if best >= _COVERAGE_THRESHOLD:
            verified += 1

    if scored == 0:
        return 1.0
    return round(verified / scored, 4)


def _answer_faithfulness(answer: str) -> float:
    """Fraction of factual sentences that carry at least one [N] marker."""
    sentences = _SENTENCE_SPLIT_RE.split(answer)
    factual_count = 0
    cited_count = 0

    for sentence in sentences:
        stripped = sentence.strip()
        if not stripped:
            continue
        if _is_factual_sentence(stripped):
            factual_count += 1
            if _has_citation_marker(stripped):
                cited_count += 1

    if factual_count == 0:
        return 1.0
    return round(cited_count / factual_count, 4)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_response(
    answer: str,
    citations: list[dict],
    retrieved_chunks: list[SearchResult],
) -> EvaluationResult:
    """
    Compute RAG quality metrics for a single query-response pair.

    Parameters
    ----------
    answer:
        The final answer string returned to the user (after citation filtering).
    citations:
        List of ``{"text": ..., "source": ...}`` dicts from the LLM response.
    retrieved_chunks:
        The chunks that were sent to the LLM (post-dedup, post-rerank).

    Returns
    -------
    EvaluationResult
        All three metric scores plus their arithmetic mean.
    """
    rp = _retrieval_precision(answer, retrieved_chunks)
    cc = _citation_correctness(citations, retrieved_chunks)
    af = _answer_faithfulness(answer)
    overall = round((rp + cc + af) / 3, 4)

    return EvaluationResult(
        retrieval_precision=rp,
        citation_correctness=cc,
        answer_faithfulness=af,
        overall_score=overall,
    )
