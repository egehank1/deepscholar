"""GET /api/evaluation/* — RAG quality log and analytics endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query, status

from app.services.vector_store import (
    delete_all_evaluations,
    get_evaluation_analytics,
    get_evaluation_logs,
)

router = APIRouter(prefix="/api/evaluation", tags=["evaluation"])


@router.get(
    "/logs",
    summary="Paginated query evaluation log",
    response_description="List of per-query RAG metric snapshots, newest first",
)
async def evaluation_logs(
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Records to skip (for pagination)"),
) -> dict:
    try:
        logs = await asyncio.to_thread(get_evaluation_logs, limit, offset)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {exc}",
        ) from exc
    return {"logs": logs, "limit": limit, "offset": offset}


@router.get(
    "/analytics",
    summary="Aggregate RAG quality analytics",
    response_description="Overall averages and a 30-day daily trend",
)
async def evaluation_analytics() -> dict:
    try:
        analytics = await asyncio.to_thread(get_evaluation_analytics)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {exc}",
        ) from exc
    return analytics


@router.delete(
    "/logs",
    summary="Clear all evaluation logs",
    response_description="Number of records deleted",
)
async def clear_evaluation_logs() -> dict:
    """Permanently delete every row from ``query_evaluations``."""
    try:
        deleted = await asyncio.to_thread(delete_all_evaluations)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {exc}",
        ) from exc
    return {"deleted": deleted}
