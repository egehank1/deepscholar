import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.chat import router as chat_router
from app.api.documents import router as documents_router
from app.api.evaluation import router as evaluation_router
from app.api.health import router as health_router
from app.api.knowledge_graph import router as knowledge_graph_router
from app.api.upload import router as upload_router
from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create tables on startup. Optionally wipe everything (RESET_ON_STARTUP)."""
    from app.services.vector_store import (
        _cursor,
        _get_conn,
        delete_all_documents,
        delete_all_evaluations,
        ensure_tables,
    )

    try:
        ensure_tables()
    except RuntimeError as exc:
        # Config problems (missing DATABASE_URL, wrong vector size): say so clearly.
        logger.error("%s", exc)
    except Exception as exc:  # DB not up yet, etc. Don't block startup.
        logger.warning("Could not prepare the database: %s", exc)

    if settings.RESET_ON_STARTUP:
        try:
            delete_all_documents()
            delete_all_evaluations()
            conn = _get_conn()
            with _cursor() as cur:
                cur.execute("DELETE FROM paper_extractions")
            conn.commit()
            logger.info("RESET_ON_STARTUP=true, cleared documents, extractions and eval logs")
        except Exception as exc:
            logger.warning("Reset on startup failed: %s", exc)

    logger.info(
        "provider=%s chat=%s embeddings=%s (%d dims)",
        settings.LLM_PROVIDER, settings.CHAT_MODEL, settings.EMBEDDING_MODEL, settings.VECTOR_DIMENSIONS,
    )
    yield


def _cors_middleware_kwargs() -> dict:
    origins = settings.cors_origins_list
    kwargs: dict = {
        "allow_origins": origins,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    # Wildcard origin is incompatible with credentials per CORS spec.
    kwargs["allow_credentials"] = False if origins == ["*"] else True
    return kwargs


def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )
    application.add_middleware(CORSMiddleware, **_cors_middleware_kwargs())
    application.include_router(health_router)
    application.include_router(upload_router)
    application.include_router(chat_router)
    application.include_router(documents_router)
    application.include_router(knowledge_graph_router)
    application.include_router(evaluation_router)
    application.include_router(api_router, prefix="/api")
    return application


app = create_application()
