from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Defaults per provider. Anything set explicitly in .env wins.
_PROVIDER_DEFAULTS = {
    "openai": {
        "CHAT_MODEL": "gpt-4o-mini",
        "EMBEDDING_MODEL": "text-embedding-3-large",
        "VECTOR_DIMENSIONS": 3072,
    },
    "ollama": {
        "CHAT_MODEL": "qwen2.5:7b",
        "EMBEDDING_MODEL": "nomic-embed-text",
        "VECTOR_DIMENSIONS": 768,
    },
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = "DeepScholar API"

    # Comma-separated origins, e.g. "https://app.example.com,https://www.example.com".
    # "*" is fine for local dev (credentials get disabled with a wildcard).
    CORS_ORIGINS: str = "*"

    UPLOAD_DIR: Path = Path("./data/uploads")

    # --- Model provider -----------------------------------------------------
    # "openai" talks to api.openai.com, "ollama" talks to a local Ollama server
    # through its OpenAI-compatible endpoint. Both go through the same client.
    LLM_PROVIDER: Literal["openai", "ollama"] = "openai"

    OPENAI_API_KEY: str = ""
    # Optional: point the OpenAI client at any compatible server
    # (LM Studio, vLLM, llama.cpp server, ...). Leave empty for api.openai.com.
    OPENAI_BASE_URL: str = ""

    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"

    # Empty means "use the provider default" (see _PROVIDER_DEFAULTS).
    CHAT_MODEL: str = ""
    EMBEDDING_MODEL: str = ""
    VECTOR_DIMENSIONS: int = 0
    EMBEDDING_BATCH_SIZE: int = 100

    # Kept so older .env files keep working.
    OPENAI_EMBEDDING_MODEL: str = ""

    # --- Database -------------------------------------------------------------
    # Any Postgres with pgvector. DATABASE_URL is the new name, SUPABASE_DB_URL
    # still works.
    DATABASE_URL: str = ""
    SUPABASE_DB_URL: str = ""

    # Wipe documents, extractions and eval logs every time the API starts.
    # Handy for demos, annoying for real use, so it's off by default.
    RESET_ON_STARTUP: bool = False

    @model_validator(mode="after")
    def _fill_provider_defaults(self) -> "Settings":
        defaults = _PROVIDER_DEFAULTS[self.LLM_PROVIDER]
        if not self.EMBEDDING_MODEL and self.OPENAI_EMBEDDING_MODEL:
            self.EMBEDDING_MODEL = self.OPENAI_EMBEDDING_MODEL
        if not self.CHAT_MODEL:
            self.CHAT_MODEL = defaults["CHAT_MODEL"]
        if not self.EMBEDDING_MODEL:
            self.EMBEDDING_MODEL = defaults["EMBEDDING_MODEL"]
        if not self.VECTOR_DIMENSIONS:
            known = {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072,
                     "nomic-embed-text": 768, "mxbai-embed-large": 1024}
            self.VECTOR_DIMENSIONS = known.get(self.EMBEDDING_MODEL, defaults["VECTOR_DIMENSIONS"])
        if not self.DATABASE_URL:
            self.DATABASE_URL = self.SUPABASE_DB_URL
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.CORS_ORIGINS.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
