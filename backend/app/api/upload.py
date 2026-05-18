"""POST /upload — PDF ingest endpoint.

Full pipeline per file
----------------------
1. Validate & save the PDF to disk.
2. Extract plain text with PyMuPDF.
3. Run LLM-assisted structured extraction (title, authors, abstract, …).
4. Split into overlapping sentence-aware chunks.
5. Embed every chunk via OpenAI (text-embedding-3-large).
6. Persist chunks + embeddings to pgvector (Supabase).

After a successful upload every chunk is immediately searchable by POST /chat.
The response includes a structured ``extraction`` field per file.
"""

import asyncio
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.chunking import chunk_text
from app.services.embeddings import embed_chunks
from app.services.extraction import PaperExtraction, extract_paper_fields
from app.services.pdf_parser import PDFParseResult, extract_text
from app.services.vector_store import delete_by_source, store_chunks, store_extraction


router = APIRouter(tags=["upload"])

_ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "application/x-pdf",
        "binary/octet-stream",
        "application/octet-stream",
    }
)

_PREVIEW_CHARS = 1000


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class FileResult(BaseModel):
    filename: str = Field(description="Basename as stored on disk")
    pages: int
    preview: str = Field(description="First 1 000 characters of extracted text")
    chunks_stored: int = Field(
        description="Number of chunks embedded and saved to the vector store"
    )
    extraction: PaperExtraction = Field(
        description="Structured metadata extracted from the paper via LLM"
    )


class UploadResponse(BaseModel):
    files: list[FileResult]
    count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_upload_dir() -> Path:
    root = Path(settings.UPLOAD_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _reject_not_pdf(upload: UploadFile, reason: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Only PDF files allowed ({reason}): {upload.filename!r}",
    )


def _validate_pdf_metadata(upload: UploadFile) -> None:
    name = (upload.filename or "").strip()
    if not name.lower().endswith(".pdf"):
        _reject_not_pdf(upload, "filename must end with .pdf")

    ct = (upload.content_type or "").strip().lower()
    if ct and ct not in _ALLOWED_CONTENT_TYPES:
        _reject_not_pdf(upload, f"unsupported content-type {upload.content_type!r}")


def _unique_destination(dest_dir: Path, original_name: str) -> Path:
    safe = Path(original_name).name
    if not safe.lower().endswith(".pdf"):
        safe = f"{safe}.pdf"
    candidate = dest_dir / safe
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    n = 1
    while True:
        alt = dest_dir / f"{stem}_{n}.pdf"
        if not alt.exists():
            return alt
        n += 1


async def _save_one(upload: UploadFile, dest_dir: Path) -> tuple[Path, str]:
    """Save a validated PDF and return (absolute path, stored basename)."""
    try:
        _validate_pdf_metadata(upload)

        head = await upload.read(4)
        if len(head) < 4 or not head.startswith(b"%PDF"):
            _reject_not_pdf(upload, "file does not start with PDF magic bytes")

        dest = _unique_destination(dest_dir, upload.filename or "document.pdf")

        await upload.seek(0)
        with dest.open("wb") as out:
            shutil.copyfileobj(upload.file, out)

        return dest, dest.name
    finally:
        await upload.close()


def _parse_or_warn(dest: Path) -> PDFParseResult:
    """Extract text, returning empty result on failure (never crash the upload)."""
    try:
        return extract_text(dest)
    except Exception:
        return PDFParseResult(text="", pages=0)


def _run_ingest_pipeline(text: str, source_name: str) -> int:
    """
    Synchronous RAG ingest: delete-old → chunk → embed → store.

    *source_name* is always the **original** filename supplied by the user (not
    any renamed disk copy).  Deleting by source first means re-uploading the
    same PDF replaces its old data instead of creating a duplicate.

    Returns the number of chunks persisted.
    Raises RuntimeError / openai.OpenAIError / psycopg2.Error on failure.
    """
    # Remove any previously ingested chunks for this source so re-uploads
    # don't accumulate duplicate data in the vector store.
    delete_by_source(source_name)

    chunks = chunk_text(text)
    if not chunks:
        return 0

    embedded = embed_chunks(chunks)

    # Tag every chunk with the original source name so citations are human-readable.
    for ec in embedded:
        ec["metadata"]["source"] = source_name

    ids = store_chunks(embedded)
    return len(ids)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=UploadResponse)
async def upload_pdfs(
    files: Annotated[
        list[UploadFile],
        File(description="One or more PDF files (form field name: files)"),
    ],
) -> UploadResponse:
    """
    Accept one or more PDF uploads, extract text, embed every chunk with
    ``text-embedding-3-large``, and persist them to the pgvector store.

    Structured metadata is extracted from each paper via GPT-4o-mini and
    returned in the ``extraction`` field of each result.

    After a successful call the uploaded content is immediately searchable
    via **POST /chat**.

    Each entry in the response includes:
    - ``filename``       – name as stored on disk
    - ``pages``          – total page count
    - ``preview``        – first 1 000 characters of extracted text
    - ``chunks_stored``  – number of chunks saved to the vector store
    - ``extraction``     – structured fields: title, authors, abstract,
                           methodology, datasets, metrics, limitations
    """
    dest_dir = _ensure_upload_dir()
    results: list[FileResult] = []

    for f in files:
        # Preserve the original filename as the canonical source key.
        original_name = Path(f.filename or "document.pdf").name
        if not original_name.lower().endswith(".pdf"):
            original_name = f"{original_name}.pdf"

        # 1. Save PDF to disk (may be renamed to avoid collisions, e.g. messi_1.pdf)
        dest, _disk_name = await _save_one(f, dest_dir)

        # 2. Extract text
        parsed = _parse_or_warn(dest)

        text = parsed["text"]

        # 3-5. Run structured extraction and RAG ingest concurrently.
        #      Both are blocking (network/DB) so they run in the thread pool.
        extraction = PaperExtraction()
        chunks_stored = 0

        if text.strip():
            try:
                # Run sequentially to prevent concurrent lazy-imports of the
                # openai package from deadlocking Python 3.14's _ModuleLock.
                extraction = await asyncio.to_thread(extract_paper_fields, text)
                chunks_stored = await asyncio.to_thread(
                    _run_ingest_pipeline, text, original_name
                )
                await asyncio.to_thread(store_extraction, original_name, extraction)
            except RuntimeError as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=str(exc),
                ) from exc
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Pipeline failed for {original_name!r}: {exc}",
                ) from exc

        results.append(
            FileResult(
                filename=original_name,
                pages=parsed["pages"],
                preview=text[:_PREVIEW_CHARS],
                chunks_stored=chunks_stored,
                extraction=extraction,
            )
        )

    return UploadResponse(files=results, count=len(results))
