import json

from app.services.chunking import chunk_text
from app.services.llm import _parse_response, validate_citation_coverage
from app.services.reranker import rerank_chunks
from app.services.vector_store import SearchResult


def chunk(i, text, source="a.pdf", score=0.5):
    return SearchResult(id=str(i), text=text, metadata={"source": source}, score=score)


def test_chunking_covers_the_text():
    text = " ".join(f"Sentence number {i} talks about retrieval." for i in range(800))
    chunks = chunk_text(text)
    assert len(chunks) > 1
    assert chunks[0]["start_index"] == 0
    # consecutive chunks overlap
    assert chunks[1]["start_index"] < chunks[0]["end_index"]


def test_bm25_prefers_the_chunk_with_the_rare_term():
    pool = [
        chunk(1, "We evaluate on ImageNet and CIFAR-10.", score=0.5),
        chunk(2, "The model is trained with a standard optimiser.", score=0.5),
    ]
    ranked = rerank_chunks("results on CIFAR-10", pool)
    assert ranked[0]["id"] == "1"


def test_markers_are_renumbered_from_what_the_answer_uses():
    chunks = [chunk(i, f"passage {i} says something specific") for i in range(1, 4)]
    raw = json.dumps({
        "answer": "The first claim is supported [3]. The second one too [1].",
        "citations": [{"text": "unrelated", "source": "a.pdf"}],
    })
    out = _parse_response(raw, chunks)
    assert "[1]" in out.answer and "[2]" in out.answer and "[3]" not in out.answer
    assert len(out.citations) == 2


def test_uncited_factual_sentence_is_dropped():
    answer = "The model reaches 92% accuracy on the benchmark [1]. It also beats every baseline by 10 points."
    cleaned = validate_citation_coverage(answer)
    assert "[1]" in cleaned
    assert "beats every baseline" not in cleaned
