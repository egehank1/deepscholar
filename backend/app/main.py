from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.health import router as health_router
from app.api.upload import router as upload_router
from app.core.config import settings

'''
(A hook is just a function that gets called automatically at a specific moment in time you don't call it yourself, the framework does.)
This is a startup/shutdown hook. Code before yield runs when the server starts, code after 
runs when it stops. Right now it's empty (just a yield), but it's a placeholder for things like connecting
 to a database on startup and disconnecting on shutdown.
'''
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Application lifespan: startup/shutdown hooks for future resources."""
    yield


'''
The _cors_middleware_kwargs function
CORS (Cross-Origin Resource Sharing) is a browser security rule that blocks websites 
from talking to your API unless you explicitly allow them. This function builds the permission rules:

allow_origins — which websites can call your API (e.g. https://myapp.com)
allow_methods: ["*"] — allow all HTTP methods (GET, POST, DELETE, etc.)
allow_headers: ["*"] — allow all request headers
allow_credentials — whether to allow cookies/auth headers. It's forced to False if 
you allow all origins ("*"), because browsers won't allow both at the same time (it's a security rule in the CORS spec).
'''
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


'''
The create_application function
This is the factory that builds your app:

Creates a FastAPI app with a title, docs pages (/docs, /redoc), and the lifespan hook
Adds CORS middleware using the rules from above
Registers routers — routers are groups of related API endpoints:

health_router — probably a /health endpoint to check if the server is alive
upload_router — handles file uploads
api_router — the main API, mounted under /api (so all its routes start with /api/...)
'''
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
