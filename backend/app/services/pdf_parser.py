"""PDF text extraction using PyMuPDF (fitz)."""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import fitz  # PyMuPDF


class PDFParseResult(TypedDict):
    text: str
    pages: int


def extract_text(file_path: str | Path) -> PDFParseResult:
    """
    Extract all text from a PDF file.

    Parameters
    ----------
    file_path:
        Absolute or relative path to a PDF file on disk.

    Returns
    -------
    PDFParseResult
        ``text``  – full concatenated text (pages separated by two newlines)
        ``pages`` – total page count in the document

    Raises
    ------
    FileNotFoundError
        If *file_path* does not exist.
    ValueError
        If the file cannot be opened as a PDF.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    try:
        doc: fitz.Document = fitz.open(str(path))
    except Exception as exc:
        raise ValueError(f"Cannot open file as PDF: {path}") from exc

    with doc:
        pages: int = doc.page_count
        parts: list[str] = []
        for page in doc:
            page_text = page.get_text()
            if page_text.strip():
                parts.append(page_text)
    # "\n\n".join(parts) — joins all the page texts into one big string, 
    # with two newlines between each page (a blank line separator). 
    return PDFParseResult(
        text="\n\n".join(parts),
        pages=pages,
    )
