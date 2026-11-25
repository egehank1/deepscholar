from typing import Any

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, Any]:
    db = "ok"
    try:
        from app.services.vector_store import _get_conn

        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.rollback()  # don't leave the shared connection idle in a transaction
    except Exception as exc:
        db = f"error: {exc.__class__.__name__}"

    return {
        "status": "ok",
        "database": db,
        "provider": settings.LLM_PROVIDER,
        "chat_model": settings.CHAT_MODEL,
        "embedding_model": settings.EMBEDDING_MODEL,
    }
