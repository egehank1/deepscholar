"""LLM-assisted structured extraction for academic papers.

For each uploaded PDF this module extracts the following fields via a
single GPT-4o-mini call with JSON mode:

  title        – paper title
  authors      – ordered list of author names
  abstract     – full abstract
  methodology  – description of the approach / methods used
  datasets     – names of datasets used or evaluated on
  metrics      – evaluation metrics / benchmark results reported
  limitations  – stated limitations or future-work caveats

Design notes
------------
* The OpenAI client is shared with ``llm.py`` via a lazily-instantiated
  module-level singleton (same pattern, separate instance to avoid coupling).
* Only the first ``_TEXT_WINDOW`` characters of extracted text are sent to
  the LLM.  This covers the title, authors, abstract, and introduction (all
  near the top) while the tail window captures limitations / conclusion
  sections that appear at the end of most papers.
* ``response_format={"type": "json_object"}`` guarantees valid JSON output.
* Every field is *optional*: if the model cannot find the information it
  returns ``null`` / an empty list, never hallucinates.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import settings

# Import openai at module level — see embeddings.py for the full rationale.
try:
    import openai as _openai_module
except ModuleNotFoundError:
    _openai_module = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class PaperExtraction(BaseModel):
    """Structured fields extracted from a single research paper."""

    title: str | None = Field(
        None,
        description="Full title of the paper, exactly as it appears.",
    )
    authors: list[str] = Field(
        default_factory=list,
        description="Ordered list of author full names.",
    )
    abstract: str | None = Field(
        None,
        description="Complete abstract text.",
    )
    methodology: str | None = Field(
        None,
        description=(
            "Summary of the core approach, model architecture, algorithm, "
            "or experimental design described in the paper."
        ),
    )
    methods: list[str] = Field(
        default_factory=list,
        description=(
            "Short names of specific models, algorithms, or techniques proposed "
            "or primarily used (e.g. 'Transformer', 'BERT', 'ResNet-50', 'LoRA')."
        ),
    )
    datasets: list[str] = Field(
        default_factory=list,
        description="Names of datasets used for training, evaluation, or comparison.",
    )
    metrics: list[str] = Field(
        default_factory=list,
        description=(
            "Evaluation metrics or benchmark results reported "
            "(e.g. 'BLEU 42.3', 'Accuracy 91%', 'F1 0.87')."
        ),
    )
    tasks: list[str] = Field(
        default_factory=list,
        description=(
            "Research tasks or problems addressed by this paper "
            "(e.g. 'Machine Translation', 'Image Classification', 'Question Answering')."
        ),
    )
    improves_on: list[str] = Field(
        default_factory=list,
        description=(
            "Titles of prior works that this paper explicitly claims to improve upon, "
            "outperform, or extend. Use exact titles when mentioned."
        ),
    )
    limitations: str | None = Field(
        None,
        description=(
            "Explicitly stated limitations, failure modes, or future-work "
            "items mentioned by the authors."
        ),
    )


# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------

_client: Any = None

_MODEL = "gpt-4o-mini"

# Characters taken from the start of the paper (covers title → introduction).
_HEAD_CHARS = 10_000
# Characters taken from the tail (covers conclusion / limitations sections).
_TAIL_CHARS = 3_000

_SYSTEM_PROMPT = """\
You are an expert academic-paper parser. Given the raw text of a research paper, \
extract the following fields and return them as a JSON object.

Rules:
1. Return ONLY valid JSON — no markdown fences, no prose outside the object.
2. If a field is not present or cannot be determined, use null for string fields \
   and [] for list fields. Never invent information.
3. For "authors", return a list of full names in the order they appear.
4. For "datasets", list each dataset by its canonical name (e.g. "ImageNet", "SQuAD").
5. For "metrics", include both the metric name and the reported value when available \
   (e.g. "BLEU: 42.3", "Top-1 Accuracy: 76.1%").
6. For "methodology", write 2-5 concise sentences describing the core approach.
7. For "limitations", summarise what the authors themselves say; do not add your own.
8. For "methods", list short canonical names of specific models, algorithms, or \
   techniques that are the main contribution or primary tool (e.g. "Transformer", \
   "BERT", "Stable Diffusion", "LoRA"). List at most 5.
9. For "tasks", list the research tasks or problems this paper addresses \
   (e.g. "Machine Translation", "Image Classification", "Text Summarisation"). \
   Use short, canonical task names. List at most 5.
10. For "improves_on", list the exact titles of prior works this paper explicitly \
    claims to improve upon, outperform, or extend. Only include works mentioned \
    by title, not vague references.

Return a JSON object with exactly these keys:
{
  "title": "<string or null>",
  "authors": ["<name>", ...],
  "abstract": "<string or null>",
  "methodology": "<string or null>",
  "methods": ["<method name>", ...],
  "datasets": ["<name>", ...],
  "metrics": ["<metric: value>", ...],
  "tasks": ["<task name>", ...],
  "improves_on": ["<paper title>", ...],
  "limitations": "<string or null>"
}
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _build_text_window(full_text: str) -> str:
    """Return a representative slice of the paper for the extraction prompt.

    Takes the first ``_HEAD_CHARS`` characters (title, authors, abstract,
    introduction) and the last ``_TAIL_CHARS`` characters (conclusion,
    limitations) joined by a separator, keeping total tokens manageable.
    """
    if len(full_text) <= _HEAD_CHARS + _TAIL_CHARS:
        return full_text

    head = full_text[:_HEAD_CHARS]
    tail = full_text[-_TAIL_CHARS:]
    return f"{head}\n\n[... middle of paper omitted ...]\n\n{tail}"


def _parse_extraction(raw: str) -> PaperExtraction:
    """Parse the model's JSON into a validated ``PaperExtraction``.

    Falls back to an empty extraction rather than raising so that a bad LLM
    response never aborts the upload.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return PaperExtraction()

    # Coerce list fields: if the model returns a string, wrap it.
    for list_field in ("authors", "datasets", "metrics", "methods", "tasks", "improves_on"):
        val = data.get(list_field)
        if isinstance(val, str):
            data[list_field] = [val] if val else []
        elif not isinstance(val, list):
            data[list_field] = []

    # Coerce string fields: strip whitespace, convert empty strings to None.
    for str_field in ("title", "abstract", "methodology", "limitations"):
        val = data.get(str_field)
        if isinstance(val, str):
            data[str_field] = val.strip() or None
        elif val is not None:
            data[str_field] = None

    try:
        return PaperExtraction(**data)
    except Exception:
        return PaperExtraction()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_paper_fields(text: str) -> PaperExtraction:
    """Extract structured metadata from raw paper text using GPT-4o-mini.

    Parameters
    ----------
    text:
        Full plain-text content of the PDF as returned by ``pdf_parser``.

    Returns
    -------
    PaperExtraction
        Validated Pydantic model. Fields that could not be determined are
        ``None`` / ``[]`` rather than fabricated.

    Raises
    ------
    RuntimeError
        If ``OPENAI_API_KEY`` is missing or the ``openai`` package is absent.
    openai.OpenAIError
        Propagated directly so the caller can decide how to handle API errors.
    """
    if not text.strip():
        return PaperExtraction()

    client = _get_client()
    window = _build_text_window(text)

    response = client.chat.completions.create(
        model=_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Paper text:\n\n{window}"},
        ],
        temperature=0,
    )

    raw = response.choices[0].message.content or "{}"
    return _parse_extraction(raw)
