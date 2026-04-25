from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.health import router as health_router
from app.api.upload import router as upload_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Application lifespan: startup/shutdown hooks for future resources."""
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
    application.include_router(api_router, prefix="/api")
    return application


app = create_application()
