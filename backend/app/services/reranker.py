"""Okapi BM25 reranker for post-retrieval chunk rescoring.

Why BM25 after hybrid search?
------------------------------
Hybrid search (vector + keyword via RRF) maximises *recall* — it surfaces
candidates that are similar in meaning *or* share keywords with the query.
BM25 reranking then improves *precision* by rescoring those candidates
purely on lexical relevance: how often query terms appear, how rare those
terms are across the corpus, and document length normalisation.

Combining both signals (normalised BM25 + normalised vector cosine) gives
a final ranking that rewards chunks that are semantically close *and*
literally contain the query terms — the sweet spot for grounded Q&A.

No external dependencies — pure Python math, standard library only.

Reference: Robertson & Zaragoza (2009), "The Probabilistic Relevance
Framework: BM25 and Beyond".
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Sequence

from app.services.vector_store import SearchResult


# ---------------------------------------------------------------------------
# Tokenisation
# ---------------------------------------------------------------------------

# Keep only alphabetic tokens of length ≥ 2 to avoid noise from numbers /
# punctuation.  Lower-casing keeps term matching case-insensitive.
_TOKEN_RE = re.compile(r"\b[a-z]{2,}\b")

# Very common English words that carry no discriminative weight.  Removing
# them improves BM25 scores on academic text (full stop-word lists are
# overkill for this use-case — these cover the majority of noise).
_STOP_WORDS: frozenset[str] = frozenset(
    {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
        "for", "of", "with", "by", "from", "as", "is", "was", "are",
        "were", "be", "been", "being", "have", "has", "had", "do", "does",
        "did", "will", "would", "could", "should", "may", "might", "this",
        "that", "these", "those", "it", "its", "we", "our", "they", "their",
        "he", "she", "his", "her", "you", "your", "not", "no", "so", "if",
        "than", "then", "also", "such", "which", "who", "what", "how",
        "when", "where", "all", "each", "both", "more", "most", "into",
        "can", "about", "up", "out", "there",
    }
)


def _tokenize(text: str) -> list[str]:
    """Lowercase, extract alphabetic tokens, remove stop-words."""
    return [
        tok
        for tok in _TOKEN_RE.findall(text.lower())
        if tok not in _STOP_WORDS
    ]


# ---------------------------------------------------------------------------
# BM25 reranker
# ---------------------------------------------------------------------------

class BM25Reranker:
    """Okapi BM25 scorer over a fixed list of retrieved chunks.

    Parameters
    ----------
    chunks:
        The candidate pool to rerank (typically the output of
        ``hybrid_search`` or ``search_similar``).
    k1:
        Term-frequency saturation parameter (1.2–2.0; default 1.5).
    b:
        Length normalisation parameter (0–1; default 0.75).
    """

    def __init__(
        self,
        chunks: Sequence[SearchResult],
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        self.k1 = k1
        self.b = b
        self._chunks: list[SearchResult] = list(chunks)
        self._corpus: list[list[str]] = [_tokenize(c["text"]) for c in self._chunks]

        n = len(self._corpus)
        self._avgdl: float = (
            sum(len(d) for d in self._corpus) / n if n else 1.0
        )

        # Document frequency: df[term] = number of docs containing the term.
        self._df: dict[str, int] = {}
        for doc in self._corpus:
            for term in set(doc):
                self._df[term] = self._df.get(term, 0) + 1

        self._n = n

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def _bm25_score(self, query_terms: list[str], doc_idx: int) -> float:
        """Compute BM25 score for one document against pre-tokenised query."""
        doc = self._corpus[doc_idx]
        dl = len(doc)
        tf_map = Counter(doc)
        k1, b = self.k1, self.b
        n = self._n

        score = 0.0
        for term in query_terms:
            tf = tf_map.get(term, 0)
            if tf == 0:
                continue
            df = self._df.get(term, 0)
            # IDF with smoothing (Robertson / Sparck Jones variant)
            idf = math.log((n - df + 0.5) / (df + 0.5) + 1.0)
            tf_norm = (tf * (k1 + 1.0)) / (
                tf + k1 * (1.0 - b + b * dl / self._avgdl)
            )
            score += idf * tf_norm
        return score

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def rerank(
        self,
        query: str,
        top_k: int | None = None,
        vector_weight: float = 0.4,
    ) -> list[SearchResult]:
        """
        Rerank the chunk pool using a BM25 + vector-score combination.

        The final score is a weighted sum of normalised BM25 and normalised
        cosine-similarity (the ``score`` field already present on each chunk):

            final = vector_weight × norm_vector + (1 − vector_weight) × norm_bm25

        This balances semantic relevance (vector) with lexical precision
        (BM25).

        Parameters
        ----------
        query:
            The user's original question.
        top_k:
            Return at most this many chunks.  ``None`` returns all.
        vector_weight:
            Weight given to the pre-existing vector/RRF score (0–1).
            Default 0.4 slightly favours BM25 to boost citation precision.

        Returns
        -------
        list[SearchResult]
            Chunks reordered by descending combined score.  The ``score``
            field is updated to the combined score so downstream code can
            inspect it.
        """
        if not self._chunks:
            return []

        query_terms = _tokenize(query)

        # Raw BM25 scores
        bm25_raw = [self._bm25_score(query_terms, i) for i in range(self._n)]

        # Normalise BM25 to [0, 1]
        max_bm25 = max(bm25_raw) or 1.0
        bm25_norm = [s / max_bm25 for s in bm25_raw]

        # Normalise existing vector / RRF scores to [0, 1]
        vec_raw = [c.get("score", 0.0) for c in self._chunks]
        max_vec = max(vec_raw) or 1.0
        vec_norm = [s / max_vec for s in vec_raw]

        combined: list[tuple[int, float]] = []
        for i in range(self._n):
            final = vector_weight * vec_norm[i] + (1.0 - vector_weight) * bm25_norm[i]
            combined.append((i, final))

        combined.sort(key=lambda x: x[1], reverse=True)
        if top_k is not None:
            combined = combined[: top_k]

        # Return reordered chunks with updated scores
        return [
            SearchResult(
                id=self._chunks[i]["id"],
                text=self._chunks[i]["text"],
                metadata=self._chunks[i]["metadata"],
                score=round(score, 6),
            )
            for i, score in combined
        ]


# ---------------------------------------------------------------------------
# Convenience wrapper
# ---------------------------------------------------------------------------

def rerank_chunks(
    query: str,
    chunks: list[SearchResult],
    top_k: int | None = None,
    vector_weight: float = 0.4,
) -> list[SearchResult]:
    """
    Rerank *chunks* against *query* using BM25 + vector-score combination.

    Parameters
    ----------
    query:
        The user's original question.
    chunks:
        Candidate pool (from hybrid or vector search).
    top_k:
        Maximum results to return.  ``None`` returns all reranked chunks.
    vector_weight:
        Weight for the pre-existing ``score`` field (0 = BM25 only,
        1 = original ranking unchanged).

    Returns
    -------
    list[SearchResult]
        Reranked, with ``score`` updated to the combined value.
    """
    return BM25Reranker(chunks, k1=1.5, b=0.75).rerank(
        query, top_k=top_k, vector_weight=vector_weight
    )
