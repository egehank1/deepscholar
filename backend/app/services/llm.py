"""LLM completion service — grounded answers via GPT-4o-mini.

Design notes
------------
* The OpenAI client is created lazily and cached (same pattern as embeddings.py).
* The model is instructed to answer *only* from the supplied context passages and
  to emit a JSON object with ``answer`` and ``citations`` keys.
* ``response_format={"type": "json_object"}`` is used so the model is guaranteed
  to return valid JSON; the prompt includes the exact schema.
* If none of the retrieved chunks are relevant enough, the model is instructed to
  say so rather than invent an answer.

Citation grounding rules (v2)
------------------------------
* Every factual sentence in the answer MUST carry at least one [N] marker.
* Markers must correspond to actual passage numbers supplied in the context.
* Any sentence without a marker is stripped by ``validate_citation_coverage``
  before the response is returned, preventing uncited claims from leaking out.
* The model is explicitly forbidden from using its parametric knowledge or
  making inferences beyond what the passages state.
* Temperature is fixed at 0 for maximal determinism.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import settings
from app.services.vector_store import SearchResult

# Import openai at module level — see embeddings.py for the full rationale.
try:
    import openai as _openai_module
except ModuleNotFoundError:
    _openai_module = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

class Citation:
    """Represents a single source passage used in the answer."""

    def __init__(self, text: str, source: str) -> None:
        self.text = text
        self.source = source

    def to_dict(self) -> dict[str, str]:
        return {"text": self.text, "source": self.source}


class GroundedAnswer:
    """Container for the LLM's grounded response."""

    def __init__(self, answer: str, citations: list[Citation]) -> None:
        self.answer = answer
        self.citations = citations

    def to_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "citations": [c.to_dict() for c in self.citations],
        }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_client: Any = None  # openai.OpenAI — typed as Any to avoid hard import

_MODEL = "gpt-4o-mini"

_SYSTEM_PROMPT = """\
You are a strict research assistant whose ONLY task is to answer the user's \
question using the numbered context passages below. You must obey every rule \
without exception.

═══ HARD RULES ═══

RULE 1 — CONTEXT ONLY
  Use ONLY information explicitly stated in the provided passages.
  Never draw on your training knowledge, make inferences, or speculate.

RULE 2 — CITE EVERY CLAIM
  Every sentence that makes a factual claim MUST end with at least one
  inline citation marker in the form [N] or [N, M] where N and M are the
  passage numbers you used. A sentence without a citation marker is
  forbidden if it contains a factual claim.

RULE 3 — NO UNCITED SYNTHESIS
  Do not combine or extrapolate across passages in a way that produces a
  conclusion not explicitly stated in any single passage.

RULE 4 — REFUSE GRACEFULLY
  If the passages do not contain sufficient information to answer the
  question, respond ONLY with the refusal JSON shown below. Do not
  attempt a partial or speculative answer.

RULE 5 — CITATION FIDELITY
  In the "citations" array include only passages you actually cited in
  the answer. The "text" field must be a verbatim or near-verbatim
  excerpt from that passage — never paraphrased or invented.

RULE 6 — JSON ENVELOPE, MARKDOWN BODY
  The outer response MUST be a single raw JSON object — no markdown fences or
  prose outside the JSON braces.
  Inside the "answer" string value, use Markdown to format your response:
  - Use **bold** for paper titles and key terms.
  - Use a blank line (\\n\\n) between separate paragraphs or papers.
  - For multi-paper summaries, write each paper as its own paragraph that
    starts with the bold title followed by the summary sentences with [N] markers.
  - Never use bare numbered lists like "1. … 2. …" — prefer structured paragraphs.

RULE 7 — MULTI-DOCUMENT COVERAGE
  When the context block groups passages under one or more
  `=== Paper N: <source> ===` section headers, your answer MUST contain a
  separate paragraph for EVERY such section in the SAME order they appear.
  Each paragraph MUST:
    • Open with the paper name in **bold** on its own line, formed by
      taking the source filename and dropping any ".pdf" extension.
      End the bold label with a period.
    • Follow the label with 1–3 sentences summarising that paper.
    • Every factual sentence MUST end with a [N] marker that points to a
      passage belonging to THAT paper (the `source:` of the cited
      passage must equal the paper named in the bold label).
    • Never cite a passage from another paper inside a paper's paragraph.
  Do not merge multiple papers into one paragraph and do not skip any
  section.

  Worked example (formatting only — replace with the actual papers):
    **Paper Title One.**

    The authors introduce X and evaluate it on Y [3]. They report a
    significant gain over the prior state of the art [4].

    **Paper Title Two.**

    This work proposes Z, an alternative formulation [7]. Z is shown to
    be more efficient than competing methods [8].

═══ OUTPUT SCHEMA ═══

Normal answer:
{
  "answer": "<Markdown-formatted answer with inline [N] markers on every factual sentence>",
  "citations": [
    {"text": "<verbatim excerpt>", "source": "<source filename or id>"}
  ]
}

Refusal (when passages are insufficient):
{
  "answer": "The provided documents do not contain sufficient information to answer this question.",
  "citations": []
}
"""


def _get_client() -> Any:
    global _client
    if _client is not None:
        return _client

    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. "
            "Add it to your .env file or export it as an environment variable."
        )

    if _openai_module is None:
        raise RuntimeError(
            "The 'openai' package is not installed. Run: pip install openai>=1.30.0"
        )

    _client = _openai_module.OpenAI(api_key=api_key)
    return _client

def _chunk_source(chunk: SearchResult) -> str:
    """Return the canonical source label for a chunk (filename or id fallback)."""
    return chunk.get("metadata", {}).get("source") or chunk["id"]


def _order_chunks_for_prompt(chunks: list[SearchResult]) -> list[SearchResult]:
    """Group chunks by source (in order of first appearance) for the prompt.

    Reranking interleaves chunks from different papers by score.  Sending the
    interleaved order to the LLM forces it to mentally regroup before writing
    a per-paper summary, which we have observed causes mis-attributed
    citation markers.  Grouping the chunks by source produces a context
    block where each paper's passages are contiguous and the model can scan
    them sequentially.

    Source ordering preserves the highest-ranked source first (i.e. the
    source of the rerank-top chunk), so the most relevant paper still leads.
    Single-source inputs are returned unchanged.
    """
    if not chunks:
        return chunks
    distinct_sources: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        src = _chunk_source(chunk)
        if src not in seen:
            seen.add(src)
            distinct_sources.append(src)
    if len(distinct_sources) <= 1:
        return chunks
    by_source: dict[str, list[SearchResult]] = {s: [] for s in distinct_sources}
    for chunk in chunks:
        by_source[_chunk_source(chunk)].append(chunk)
    ordered: list[SearchResult] = []
    for source in distinct_sources:
        ordered.extend(by_source[source])
    return ordered


def _build_context_block(chunks: list[SearchResult]) -> str:
    """Format retrieved chunks into a numbered context block for the prompt.

    For multi-source inputs the chunks are pre-grouped by source via
    ``_order_chunks_for_prompt``, then rendered under one
    ``=== Paper N: <source> ===`` section per paper.  The grouped layout
    makes RULE 7 (one paragraph per paper) trivial for the model to satisfy
    because every paper's passages are contiguous and clearly labelled.
    """
    distinct_sources: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        src = _chunk_source(chunk)
        if src not in seen:
            seen.add(src)
            distinct_sources.append(src)

    lines: list[str] = []

    if len(distinct_sources) > 1:
        lines.append(
            "Distinct source documents in this context "
            "(your answer must address EACH if the question is collective):"
        )
        for s in distinct_sources:
            lines.append(f"  - {s}")
        lines.append("")
        # Grouped rendering: one section per source, passages numbered globally.
        passage_idx = 0
        for paper_idx, source in enumerate(distinct_sources, start=1):
            lines.append(f"=== Paper {paper_idx}: {source} ===")
            for chunk in chunks:
                if _chunk_source(chunk) != source:
                    continue
                passage_idx += 1
                lines.append(
                    f"\n[{passage_idx}] (source: {source})\n{chunk['text'].strip()}"
                )
            lines.append("")
        return "\n".join(lines).rstrip()

    # Single-source path: keep the original flat rendering.
    lines.append("Context passages:")
    for i, chunk in enumerate(chunks, start=1):
        source = _chunk_source(chunk)
        lines.append(f"\n[{i}] (source: {source})\n{chunk['text'].strip()}")
    return "\n".join(lines)

'''
after the AI has read those passages and replied, this function takes the AI's raw reply and unpacks it into two clean things: 
the answer text, and the citations (which passages the AI actually used to form its answer).
'''
_CITATION_MARKER_RE = re.compile(r"\[\d+(?:,\s*\d+)*\]")

# Sentence boundary: end of a sentence followed by whitespace or end-of-string.
# We use a simple heuristic (period / ! / ?) rather than a full NLP tokeniser.
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

# A sentence that is entirely a Markdown bold label, optionally ending with
# punctuation — e.g. "**Attention Is All You Need.**".  These are structural
# headings used in multi-paper summaries, not factual claims, so they must
# not be required to carry a citation marker.
_BOLD_LABEL_RE = re.compile(r"^\*\*[^*]+\*\*[.:!?]?\s*$")


def _has_citation_marker(sentence: str) -> bool:
    """Return True if the sentence contains at least one [N] marker."""
    return bool(_CITATION_MARKER_RE.search(sentence))


def _looks_like_factual(sentence: str) -> bool:
    """
    Heuristic: does this sentence make a claim that needs a citation?

    Very short sentences, Markdown headings/labels, or pure structural phrases
    (e.g. "In summary,", "The answer is:") are treated as non-factual and
    allowed without a citation marker.
    """
    stripped = sentence.strip()
    # Skip very short sentences (≤ 6 words) — likely headings or transitions.
    if len(stripped.split()) <= 6:
        return False
    # Skip pure Markdown labels — paper-title headings used in multi-doc answers.
    if _BOLD_LABEL_RE.match(stripped):
        return False
    # Skip Markdown headings (#, ##, ###, …).
    if stripped.startswith("#"):
        return False
    # Skip sentences that start with common non-factual openers.
    non_factual_openers = (
        "in summary",
        "to summarize",
        "the answer",
        "note that",
        "please note",
        "as mentioned",
        "based on the",
        "according to the",
    )
    lower = stripped.lower()
    return not any(lower.startswith(op) for op in non_factual_openers)


def validate_citation_coverage(answer: str) -> str:
    """
    Remove any factual sentence that lacks a citation marker.

    This is a defence-in-depth safety net: if the model produces a
    sentence with a factual claim but forgets to add [N], we strip it
    rather than let an uncited claim reach the user.

    Paragraph breaks (blank lines) are preserved so Markdown formatting
    produced by the model survives the filtering step intact.

    Returns the cleaned answer string (may be shorter than the input).
    If *all* sentences are removed, returns an explicit notice.
    """
    # Split into paragraphs first so blank-line separators are preserved.
    paragraphs = re.split(r"\n{2,}", answer)
    kept_paragraphs: list[str] = []

    for para in paragraphs:
        sentences = _SENTENCE_SPLIT_RE.split(para)
        kept: list[str] = []
        for sentence in sentences:
            stripped = sentence.strip()
            if not stripped:
                continue
            if _looks_like_factual(stripped) and not _has_citation_marker(stripped):
                continue
            kept.append(stripped)
        if kept:
            kept_paragraphs.append(" ".join(kept))

    if not kept_paragraphs:
        return (
            "The model's response was filtered because it contained no "
            "properly cited claims."
        )
    return "\n\n".join(kept_paragraphs)


_MARKER_GROUP_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


def _normalise_for_overlap(text: str) -> set[str]:
    return set(re.findall(r"[a-z]{3,}", text.lower()))


def _excerpt_belongs_to_chunk(excerpt: str, chunk_text: str) -> bool:
    """Return True if ``excerpt`` is plausibly drawn from ``chunk_text``.

    The model occasionally misnumbers entries in its ``citations`` array — it
    may label an excerpt with the wrong passage index, which (left untouched)
    would surface a misattributed quote in the UI's citation panel.  We
    accept the model-supplied excerpt only when its content tokens are
    almost entirely present in the chunk it was attributed to, which is a
    reliable lexical proxy for "the excerpt came from this passage".
    """
    if not excerpt or not chunk_text:
        return False
    excerpt_tokens = _normalise_for_overlap(excerpt)
    if not excerpt_tokens:
        return False
    chunk_tokens = _normalise_for_overlap(chunk_text)
    if not chunk_tokens:
        return False
    coverage = len(excerpt_tokens & chunk_tokens) / len(excerpt_tokens)
    return coverage >= 0.6


def _truncate_chunk_text(text: str, max_chars: int = 320) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars].rsplit(' ', 1)[0]}…"


def _parse_response(raw: str, chunks: list[SearchResult]) -> GroundedAnswer:
    """Parse the model's JSON response and reconcile markers with citations.

    The model's prompt instructs it to emit two things:
      1. An ``answer`` string with inline ``[N]`` markers where ``N`` is the
         passage index from the context block.
      2. A ``citations`` array of verbatim excerpts.

    Empirically these two outputs are not always perfectly aligned — the
    model may cite passage 11 in the prose but only list 8 entries in the
    citations array, or its citations array may include passages it never
    actually referenced.  When the front-end re-numbers the citation panel
    by array position, the inline markers and the panel can disagree.

    To eliminate that class of bug entirely, this parser rebuilds the
    citation list **from the markers actually present in the answer** and
    then rewrites the markers so the numbering matches the new list
    (``[1]``, ``[2]``, ``[3]``, …, in order of first appearance).
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"LLM returned non-JSON response: {raw!r}") from exc

    answer_text: str = data.get("answer", "") or ""
    raw_citations: list[dict] = data.get("citations", []) or []

    # Build a lookup of model-supplied excerpts keyed by passage index.
    # The model normally puts the passage number into "source" or prefixes
    # the excerpt — we accept either.
    model_excerpt_by_idx: dict[int, str] = {}
    for c in raw_citations:
        if not isinstance(c, dict):
            continue
        text = (c.get("text") or "").strip()
        source = (c.get("source") or "").strip()
        idx: int | None = None
        if source.isdigit():
            idx = int(source)
        else:
            # Some models prefix the excerpt with "[N] …"; try to recover.
            m = re.match(r"^\[(\d+)\]\s*", text)
            if m:
                idx = int(m.group(1))
                text = text[m.end():].strip()
        if idx is not None and 0 < idx <= len(chunks) and text:
            model_excerpt_by_idx.setdefault(idx, text)

    # Extract markers in order of first appearance.  Numbers that exceed
    # the available chunk range are silently dropped (the model
    # hallucinated them).
    cited_order: list[int] = []
    seen: set[int] = set()
    for match in _MARKER_GROUP_RE.finditer(answer_text):
        for num_str in re.findall(r"\d+", match.group(1)):
            n = int(num_str)
            if 0 < n <= len(chunks) and n not in seen:
                seen.add(n)
                cited_order.append(n)

    # If the model emitted no usable markers, fall back to the raw answer
    # plus whatever citations the model listed (best-effort behaviour kept
    # so simple single-passage answers still render).
    if not cited_order:
        citations: list[Citation] = []
        seen_keys: set[tuple[str, str]] = set()
        for c in raw_citations:
            if not isinstance(c, dict):
                continue
            text = c.get("text", "") or ""
            source = c.get("source", "") or ""
            if source.isdigit():
                idx = int(source) - 1
                if 0 <= idx < len(chunks):
                    source = _chunk_source(chunks[idx])
            if not text and not source:
                continue
            key = (text.strip().lower(), source)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            citations.append(Citation(text=text, source=source))
        return GroundedAnswer(answer=answer_text, citations=citations)

    # Build the new citation list from the cited chunks, in order.  We
    # accept the model's verbatim excerpt only when it lexically matches the
    # chunk it was attributed to — otherwise the panel falls back to a
    # truncation of the chunk text so the user always sees something that
    # really came from the cited passage.
    old_to_new: dict[int, int] = {}
    citations = []
    for new_idx, old_idx in enumerate(cited_order, start=1):
        old_to_new[old_idx] = new_idx
        chunk = chunks[old_idx - 1]
        chunk_text = chunk.get("text", "")
        candidate = model_excerpt_by_idx.get(old_idx)
        if candidate and _excerpt_belongs_to_chunk(candidate, chunk_text):
            display_text = candidate.strip()
        else:
            display_text = _truncate_chunk_text(chunk_text)
        citations.append(
            Citation(text=display_text, source=_chunk_source(chunk))
        )

    # Rewrite every marker in the answer with its renumbered, valid form.
    def _replace_marker(match: re.Match[str]) -> str:
        renumbered: list[str] = []
        seen_local: set[int] = set()
        for num_str in re.findall(r"\d+", match.group(1)):
            old = int(num_str)
            new = old_to_new.get(old)
            if new is None or new in seen_local:
                continue
            seen_local.add(new)
            renumbered.append(str(new))
        if not renumbered:
            return ""
        return f"[{', '.join(renumbered)}]"

    answer_text = _MARKER_GROUP_RE.sub(_replace_marker, answer_text)
    # Tidy whitespace that may be left over when a marker is dropped.
    answer_text = re.sub(r"\s+([.,;:!?])", r"\1", answer_text)
    answer_text = re.sub(r"[ \t]{2,}", " ", answer_text)

    return GroundedAnswer(answer=answer_text, citations=citations)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def answer_with_context(question: str, chunks: list[SearchResult]) -> GroundedAnswer:
    """
    Generate a grounded answer to *question* using *chunks* as the only context.

    Parameters
    ----------
    question:
        The user's natural-language question.
    chunks:
        Top-k results from ``vector_store.search_similar``.

    Returns
    -------
    GroundedAnswer
        Contains the answer string and a list of ``Citation`` objects.

    Raises
    ------
    RuntimeError
        If ``OPENAI_API_KEY`` is missing or the ``openai`` package is absent.
    openai.OpenAIError
        Propagated directly so the caller can handle rate-limit / auth errors.
    """
    client = _get_client()

    # Group chunks by source for multi-paper prompts so the LLM can summarise
    # each paper from a contiguous block of passages.  The same ordering is
    # passed to `_parse_response` so passage indices in the model's markers
    # resolve to the correct chunk during marker → citation renumbering.
    ordered_chunks = _order_chunks_for_prompt(chunks)

    context_block = _build_context_block(ordered_chunks)
    user_message = f"{context_block}\n\nQuestion: {question}"

    response = client.chat.completions.create(
        model=_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0,  # deterministic — grounding requires no creativity
    )

    raw_content = response.choices[0].message.content or "{}"
    grounded = _parse_response(raw_content, ordered_chunks)

    # Defence-in-depth: strip any factual sentences that the model forgot
    # to cite.  This runs after JSON parsing so it only touches the answer
    # text, not the citations list.
    grounded.answer = validate_citation_coverage(grounded.answer)

    return grounded
