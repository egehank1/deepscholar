import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(tags=["upload"])

_ALLOWED_CONTENT_TYPES = frozenset(
    {
        "application/pdf",
        "application/x-pdf",
        "binary/octet-stream",
        "application/octet-stream",
    }
)


class UploadResponse(BaseModel):
    filenames: list[str] = Field(description="Basenames as stored on disk")
    count: int


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


async def _save_one(upload: UploadFile, dest_dir: Path) -> str:
    try:
        _validate_pdf_metadata(upload)

        head = await upload.read(4)
        if len(head) < 4 or not head.startswith(b"%PDF"):
            _reject_not_pdf(upload, "file does not start with PDF magic bytes")

        dest = _unique_destination(dest_dir, upload.filename or "document.pdf")

        await upload.seek(0)
        with dest.open("wb") as out:
            shutil.copyfileobj(upload.file, out)

        return dest.name
    finally:
        await upload.close()


@router.post("/upload", response_model=UploadResponse)
async def upload_pdfs(
    files: Annotated[
        list[UploadFile],
        File(description="One or more PDF files (form field name: files)"),
    ],
) -> UploadResponse:
    """
    Accept multiple PDF uploads (multipart form field `files`, repeated).
    """
    dest_dir = _ensure_upload_dir()
    saved: list[str] = []
    for f in files:
        name = await _save_one(f, dest_dir)
        saved.append(name)

    return UploadResponse(filenames=saved, count=len(saved))
