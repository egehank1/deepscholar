from app.core.config import Settings


def make(**env):
    return Settings(_env_file=None, **env)


def test_ollama_defaults():
    s = make(LLM_PROVIDER="ollama")
    assert s.CHAT_MODEL == "qwen2.5:7b"
    assert s.EMBEDDING_MODEL == "nomic-embed-text"
    assert s.VECTOR_DIMENSIONS == 768


def test_openai_defaults_match_the_old_setup():
    s = make(LLM_PROVIDER="openai")
    assert s.CHAT_MODEL == "gpt-4o-mini"
    assert s.EMBEDDING_MODEL == "text-embedding-3-large"
    assert s.VECTOR_DIMENSIONS == 3072


def test_old_env_names_still_work():
    s = make(SUPABASE_DB_URL="postgresql://x", OPENAI_EMBEDDING_MODEL="text-embedding-3-small")
    assert s.DATABASE_URL == "postgresql://x"
    assert s.EMBEDDING_MODEL == "text-embedding-3-small"
    assert s.VECTOR_DIMENSIONS == 1536


def test_explicit_values_win():
    s = make(LLM_PROVIDER="ollama", CHAT_MODEL="llama3.1:8b", EMBEDDING_MODEL="mxbai-embed-large")
    assert s.CHAT_MODEL == "llama3.1:8b"
    assert s.VECTOR_DIMENSIONS == 1024
