from types import SimpleNamespace

import pytest

from app.services import embeddings


class FakeEmbeddings:
    def __init__(self, dims):
        self.dims = dims
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        data = [SimpleNamespace(index=i, embedding=[0.1] * self.dims) for i, _ in enumerate(kwargs["input"])]
        return SimpleNamespace(data=list(reversed(data)))


def use_fake(monkeypatch, dims, **settings):
    fake = FakeEmbeddings(dims)
    monkeypatch.setattr(embeddings, "get_client", lambda: SimpleNamespace(embeddings=fake))
    for k, v in settings.items():
        monkeypatch.setattr(embeddings.settings, k, v)
    return fake


def test_ollama_does_not_send_dimensions(monkeypatch):
    fake = use_fake(monkeypatch, 768, LLM_PROVIDER="ollama", EMBEDDING_MODEL="nomic-embed-text", VECTOR_DIMENSIONS=768)
    assert len(embeddings.embed_query("hello")) == 768
    assert "dimensions" not in fake.calls[0]
    assert fake.calls[0]["encoding_format"] == "float"


def test_openai_v3_models_get_dimensions(monkeypatch):
    fake = use_fake(monkeypatch, 1536, LLM_PROVIDER="openai", EMBEDDING_MODEL="text-embedding-3-large", VECTOR_DIMENSIONS=1536)
    embeddings.embed_query("hello")
    assert fake.calls[0]["dimensions"] == 1536


def test_wrong_size_gives_a_readable_error(monkeypatch):
    use_fake(monkeypatch, 1024, LLM_PROVIDER="ollama", EMBEDDING_MODEL="mxbai-embed-large", VECTOR_DIMENSIONS=768)
    with pytest.raises(RuntimeError, match="VECTOR_DIMENSIONS=1024"):
        embeddings.embed_query("hello")


def test_chunks_keep_order_and_metadata(monkeypatch):
    use_fake(monkeypatch, 4, LLM_PROVIDER="ollama", EMBEDDING_MODEL="m", VECTOR_DIMENSIONS=4, EMBEDDING_BATCH_SIZE=2)
    chunks = [{"chunk_id": i, "text": f"t{i}", "start_index": i, "end_index": i + 1} for i in range(5)]
    out = embeddings.embed_chunks(chunks)
    assert [c["text"] for c in out] == ["t0", "t1", "t2", "t3", "t4"]
    assert out[3]["metadata"]["chunk_id"] == 3
