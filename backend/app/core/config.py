from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict





class Settings(BaseSettings):

    model_config = SettingsConfigDict(

        env_file=".env",

        env_file_encoding="utf-8",

        case_sensitive=False,

        extra="ignore",

    )



    PROJECT_NAME: str = "AI Research Copilot API"

    # Comma-separated origins for production, e.g. "https://app.example.com,https://www.example.com"

    # Use "*" for local development (credentials disabled when wildcard).

    CORS_ORIGINS: str = "*"



    UPLOAD_DIR: Path = Path("/data/uploads")

    OPENAI_API_KEY: str = ""
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-large"
    OPENAI_EMBEDDING_BATCH_SIZE: int = 100  # max items per API call



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

