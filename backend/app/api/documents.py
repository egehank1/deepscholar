"""GET /documents — list indexed sources.
DELETE /documents/{source} — remove a paper from the vector store.

These endpoints let users inspect what is currently indexed and clean up
stale or unwanted papers without re-uploading everything.
"""

from __future__ import annotations

import urllib.parse

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services.vector_store import delete_by_source, get_distinct_sources

router = APIRouter(tags=["documents"])


class DocumentsResponse(BaseModel):
    sources: list[str] = Field(
        description="Distinct source filenames currently in the vector store."
    )
    count: int


class DeleteResponse(BaseModel):
    source: str
    chunks_deleted: int


@router.get(
    "/documents",
    response_model=DocumentsResponse,
    summary="List all indexed document sources",
)
async def list_documents() -> DocumentsResponse:
    """Return the distinct ``source`` values stored in the vector store.

    Each entry corresponds to one uploaded PDF that has been embedded and
    persisted.  Use **DELETE /documents/{source}** to remove any entry.
    """
    try:
        sources = get_distinct_sources()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Vector store unavailable: {exc}",
        ) from exc
    return DocumentsResponse(sources=sources, count=len(sources))


@router.delete(
    "/documents/{source:path}",
    response_model=DeleteResponse,
    summary="Remove an indexed document from the vector store",
)
async def delete_document(source: str) -> DeleteResponse:
    """Delete all vector-store chunks whose ``source`` matches *source*.

    *source* is the filename as returned by **GET /documents** (URL-encoded
    when it contains spaces or special characters).  For example:

    ```
    DELETE /documents/Attention%20Is%20All%20You%20Need_5.pdf
    ```

    This permanently removes the document from the search index.  The
    original PDF on disk is **not** deleted — only the embeddings are removed.
    To re-index the file, upload it again via **POST /upload**.
    """
    decoded = urllib.parse.unquote(source)
    try:
        deleted = delete_by_source(decoded)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Vector store unavailable: {exc}",
        ) from exc

    if deleted == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No indexed chunks found for source {decoded!r}.",
        )

    return DeleteResponse(source=decoded, chunks_deleted=deleted)
