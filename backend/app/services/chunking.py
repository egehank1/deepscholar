"""Sentence-aware text chunking for a RAG pipeline.

No external dependencies — pure Python.

Token estimation
----------------
One "token" ≈ 4 characters (a reasonable English-text approximation used by
most tokeniser docs).  We work entirely in characters so the maths stays
simple and deterministic.

Target window  : 1 000 tokens  →  4 000 chars
Overlap        :   150 tokens  →    600 chars
Hard minimum   :   100 tokens  →    400 chars  (drop tiny tail chunks)
"""

from __future__ import annotations

import re
import uuid
from typing import TypedDict

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------
''' 
Full document text (e.g. 50,000 characters)
          │
          ▼
Find all sentence boundaries → [0, 42, 89, 134, ...]
          │
          ▼
Loop:
  Take ~4000 chars from current position
  Snap end to nearest sentence boundary
  Save as a chunk with unique ID
  Step back 600 chars (overlap)
  Snap start to nearest sentence boundary
  Repeat until end of document
          │
          ▼
[chunk1, chunk2, chunk3, ...chunk60]
  each with: chunk_id, text, start_index, end_index
'''
CHARS_PER_TOKEN = 4

TARGET_TOKENS = 1_000
OVERLAP_TOKENS = 150
MIN_TOKENS = 100

TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN    # 4 000
OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN  # 600
MIN_CHARS = MIN_TOKENS * CHARS_PER_TOKEN           # 400


class Chunk(TypedDict):
    chunk_id: str
    text: str
    start_index: int
    end_index: int


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Sentence boundary: ends with  .  !  ?  followed by whitespace or end of str.
# Also treat a blank line (paragraph break) as a boundary.
_BOUNDARY = re.compile(r"(?<=[.!?])\s+|\n{2,}")


def _sentence_boundaries(text: str) -> list[int]:
    """Return a sorted list of character positions where a new sentence starts."""
    positions: list[int] = [0]
    for m in _BOUNDARY.finditer(text):
        pos = m.end()
        if pos < len(text):
            positions.append(pos)
    return positions


def _nearest_boundary_after(boundaries: list[int], target: int) -> int:
    """
    Return the boundary position that is closest to *target* (but >= 0).

    We prefer splitting at a natural sentence boundary rather than cutting
    mid-word, so we find the boundary that overshoots *target* by the least.
    If no boundary exists beyond *target* we just use *target* directly.
    """
    for pos in boundaries:
        if pos >= target:
            return pos
    return target


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def chunk_text(text: str) -> list[Chunk]:
    """
    Split *text* into overlapping chunks suitable for embedding / retrieval.

    Parameters
    ----------
    text:
        Plain text string (e.g. the output of ``extract_text``).

    Returns
    -------
    list[Chunk]
        Each chunk has:

        ``chunk_id``    – globally unique identifier (UUID4 hex)
        ``text``        – the chunk's text content
        ``start_index`` – inclusive start offset in the original *text*
        ``end_index``   – exclusive end offset in the original *text*
    """
    text = text.strip()
    if not text:
        return []

    boundaries = _sentence_boundaries(text)
    total = len(text)
    chunks: list[Chunk] = []

    start = 0
    while start < total:
        # Ideal end: start + target window
        ideal_end = start + TARGET_CHARS
        if ideal_end >= total:
            # Last (possibly shorter) chunk — include everything that remains.
            end = total
        else:
            # Snap to the nearest sentence boundary at or after the ideal cut.
            end = _nearest_boundary_after(boundaries, ideal_end)
            # Safety cap: never exceed 1 200 tokens (4 800 chars) per chunk.
            end = min(end, start + 1_200 * CHARS_PER_TOKEN)

        chunk_text_content = text[start:end].strip()

        if len(chunk_text_content) >= MIN_CHARS or not chunks:
            # Always emit the very first chunk even if it's tiny.
            chunks.append(
                Chunk(
                    chunk_id=uuid.uuid4().hex,
                    text=chunk_text_content,
                    start_index=start,
                    end_index=end,
                )
            )

        if end >= total:
            break

        # Next chunk starts OVERLAP_CHARS before the current end so that
        # context from the boundary region appears in both chunks.
        next_start = end - OVERLAP_CHARS
        # Snap backward to the nearest sentence boundary to avoid starting
        # a chunk mid-sentence.
        boundary_before = 0
        for pos in reversed(boundaries):
            if pos <= next_start:
                boundary_before = pos
                break
        start = boundary_before if boundary_before > start else next_start

    return chunks
