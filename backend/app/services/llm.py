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
"""

from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.services.vector_store import SearchResult

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
You are a precise research assistant. Your only job is to answer the user's \
question using the numbered context passages provided. Follow these rules strictly:

1. Use ONLY information that appears in the provided context passages.
2. Do NOT add any knowledge from outside the passages.
3. If the passages do not contain enough information, respond with:
   {"answer": "The provided documents do not contain enough information to answer this question.", "citations": []}
4. For every factual claim in your answer, reference the passage number(s) using \
   inline markers like [1] or [2, 3].
5. Only cite passages you actually reference in the answer text.
6. Respond with a JSON object that matches this schema exactly:
   {
     "answer": "<your answer with inline citation markers>",
     "citations": [
       {"text": "<verbatim or near-verbatim excerpt from the passage>", "source": "<passage source id>"}
     ]
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

    try:
        import openai  # noqa: PLC0415
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "The 'openai' package is not installed. Run: pip install openai>=1.30.0"
        ) from exc

    _client = openai.OpenAI(api_key=api_key)
    return _client

'''
Before the AI answers, a search runs and finds a few relevant text snippets from documents 
— those snippets are the context passages. They're just pieces of text pulled from somewhere
 (a PDF, a website, a database) that are relevant to your question.
A context block is simply all those passages bundled together into one formatted chunk of text,
 numbered and labelled, ready to be handed to the AI. Like:
'''
def _build_context_block(chunks: list[SearchResult]) -> str:
    """Format retrieved chunks into a numbered context block for the prompt."""
    lines: list[str] = ["Context passages:"]
    for i, chunk in enumerate(chunks, start=1):
        source = chunk.get("metadata", {}).get("source", chunk["id"])
        lines.append(f"\n[{i}] (source: {source})\n{chunk['text'].strip()}")
    return "\n".join(lines)

'''
after the AI has read those passages and replied, this function takes the AI's raw reply and unpacks it into two clean things: 
the answer text, and the citations (which passages the AI actually used to form its answer).
'''
def _parse_response(raw: str, chunks: list[SearchResult]) -> GroundedAnswer:
    """
    Parse the model's JSON response into a ``GroundedAnswer``.

    Falls back gracefully if the model omits optional fields.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"LLM returned non-JSON response: {raw!r}") from exc

    answer_text: str = data.get("answer", "")
    raw_citations: list[dict] = data.get("citations", [])

    citations: list[Citation] = []
    for c in raw_citations:
        text = c.get("text", "")
        source = c.get("source", "")

        # If the model echoed a passage index as source (e.g. "1"), resolve it.
        if source.isdigit():
            idx = int(source) - 1
            if 0 <= idx < len(chunks):
                chunk = chunks[idx]
                source = chunk.get("metadata", {}).get("source", chunk["id"])

        if text or source:
            citations.append(Citation(text=text, source=source))

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

    context_block = _build_context_block(chunks)
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
    return _parse_response(raw_content, chunks)
