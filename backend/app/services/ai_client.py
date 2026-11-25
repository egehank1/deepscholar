"""One shared OpenAI-compatible client for chat, extraction and embeddings.

OpenAI and Ollama both speak the same /v1 API, so switching providers is just
a different base_url (and no real API key for Ollama).
"""

from __future__ import annotations

import threading
from typing import Any

from app.core.config import settings

# Imported at module level on purpose: lazy imports from worker threads caused
# _ModuleLock deadlocks on Python 3.14.
try:
    import openai as _openai_module
except ModuleNotFoundError:
    _openai_module = None  # type: ignore[assignment]

_client: Any = None
_lock = threading.Lock()


def get_client() -> Any:
    global _client
    if _client is not None:
        return _client

    with _lock:
        if _client is not None:
            return _client

        if _openai_module is None:
            raise RuntimeError("The 'openai' package is not installed. Run: pip install -r requirements.txt")

        if settings.LLM_PROVIDER == "ollama":
            # Ollama ignores the key, but the SDK insists on having one.
            _client = _openai_module.OpenAI(base_url=settings.OLLAMA_BASE_URL, api_key="ollama")
        else:
            if not settings.OPENAI_API_KEY:
                raise RuntimeError(
                    "OPENAI_API_KEY is not set. Add it to backend/.env, "
                    "or set LLM_PROVIDER=ollama to run everything locally."
                )
            kwargs: dict[str, Any] = {"api_key": settings.OPENAI_API_KEY}
            if settings.OPENAI_BASE_URL:
                kwargs["base_url"] = settings.OPENAI_BASE_URL
            _client = _openai_module.OpenAI(**kwargs)

    return _client
