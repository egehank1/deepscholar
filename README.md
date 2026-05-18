# DeepScholar

> A research copilot for academic literature. Upload PDFs, get structured metadata, ask questions across your library, and explore the connections between papers as a knowledge graph. Every answer is grounded in the source text with inline citations.

<p align="center">
  <img src="docs/screenshots/landing.png" alt="DeepScholar landing page" width="900" />
</p>
<!-- Put a screenshot of `/` (the Workspace landing page) here. A 1600x900 PNG works best. -->

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#the-rag-pipeline">RAG Pipeline</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#api-reference">API</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/pgvector-Supabase-3ECF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-gpt--4o--mini-412991?logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-blue" />
</p>

---

## What it does

DeepScholar turns a folder of PDFs into a searchable, queryable, visualisable research workspace.

1. **Upload** one or many academic PDFs.
2. The backend extracts text, chunks it, embeds every chunk with `text-embedding-3-large`, and writes it to a pgvector store on Supabase.
3. In parallel, GPT-4o-mini reads the paper and pulls out structured fields: title, authors, abstract, methodology, methods, datasets, metrics, tasks, prior work this paper improves on, and limitations.
4. Ask questions in natural language. A hybrid retriever (vector + keyword, fused with Reciprocal Rank Fusion, reranked with BM25) selects the relevant passages and GPT-4o-mini writes a grounded answer where every factual sentence carries an inline `[N]` citation marker.
5. Open the knowledge graph to see how your papers connect through shared methods, datasets, and tasks.
6. Open analytics to inspect the quality of every answer the system has ever produced (retrieval precision, citation correctness, answer faithfulness).

> The whole stack is engineered around one rule: the model is not allowed to say anything that is not in the retrieved passages, and if it tries to, the post-processor strips the sentence before the user sees it.

---

## Features

### Document ingestion
* Multi-file PDF upload with magic-byte validation.
* PyMuPDF text extraction.
* Sentence-aware overlapping chunking (1 000-token windows, 150-token overlap, with chunk boundaries snapped to sentence ends).
* Per-paper structured extraction via GPT-4o-mini with JSON mode (zero hallucinated fields, missing data returns `null` / `[]`).
* Re-uploading the same PDF replaces the old vectors instead of duplicating them.

<p align="center">
  <img src="docs/screenshots/upload.png" alt="Upload screen with extraction results" width="900" />
</p>
<!-- Put a screenshot of `/upload` here, ideally one that shows the extraction panel populated with title/authors/methodology after an upload completes. -->

### Retrieval-augmented chat
* Hybrid search: cosine over OpenAI embeddings plus PostgreSQL `to_tsvector` keyword search, fused with parameter-free Reciprocal Rank Fusion (`k=60`).
* BM25 reranker (Okapi, `k1=1.5`, `b=0.75`) combined with normalised vector scores to balance lexical precision and semantic relevance.
* Intent-aware retrieval. Queries like *"summarise each paper"* or *"compare the contributions"* automatically switch to a per-source retrieval path that fetches the top-k from every paper independently.
* Source coverage guarantee. Before the LLM call, the pipeline checks that every indexed paper has at least one chunk in the final context and back-fills any missing source.
* Grounded answers with per-sentence `[N]` citation markers. Any uncited factual sentence is stripped by a post-processing pass.
* Citation reconciliation. If the model emits markers that do not match its citations array (a common failure mode), the parser rebuilds the citation list directly from the markers actually used in the answer.

<p align="center">
  <img src="docs/screenshots/chat.png" alt="Chat interface with citations" width="900" />
</p>
<!-- Put a screenshot of `/chat` here. Best result: a multi-paper question with an answer that has multiple bold paper titles and a citation panel expanded below. -->

### Paper comparison
Side-by-side comparison of structured fields across any subset of your uploaded papers. Methodology, datasets, metrics, and limitations rendered in one synchronised view.

<p align="center">
  <img src="docs/screenshots/compare.png" alt="Paper comparison view" width="900" />
</p>
<!-- Put a screenshot of `/compare` here. Two or three papers selected at once shows the value best. -->

### Knowledge graph
Force-directed graph rendered with `react-force-graph-2d`. Nodes are papers, methods, datasets, and tasks. Edges are typed: `uses`, `evaluates_on`, `addresses`, and `improves`. Filter by node type or edge type, click a node for its metadata, drag to rearrange.

<p align="center">
  <img src="docs/screenshots/graph.png" alt="Knowledge graph of uploaded papers" width="900" />
</p>
<!-- Put a screenshot of `/graph` here. Ideally with at least 4-5 papers uploaded so you see the cross-paper edges. -->

### Quality analytics
Every chat response is scored on three independent metrics and logged. The dashboard shows aggregate averages, a 30-day daily trend, and a paginated log of every query the system has answered.

* **Retrieval Precision**: fraction of retrieved chunks that ended up cited (with a source-coverage variant for multi-paper queries).
* **Citation Correctness**: fraction of model-emitted citations whose tokens are actually present in the retrieved chunk they were attributed to.
* **Answer Faithfulness**: fraction of factual sentences in the answer that carry at least one `[N]` marker.

<p align="center">
  <img src="docs/screenshots/analytics.png" alt="RAG quality analytics dashboard" width="900" />
</p>
<!-- Put a screenshot of `/analytics` here, ideally after running ~20 queries so the trend chart has shape. -->

---

## Architecture

```
                              ┌──────────────────────────────────────┐
                              │           Next.js 14 frontend        │
                              │   /upload  /chat  /compare  /graph   │
                              │            /analytics                │
                              └──────────────────────────────────────┘
                                              │  REST
                                              ▼
                              ┌──────────────────────────────────────┐
                              │            FastAPI backend           │
                              │                                      │
   POST /upload  ─────────►   │  PDF → text → chunk → embed → store  │
                              │  parallel: GPT-4o-mini structured    │
                              │             field extraction         │
                              │                                      │
   POST /chat    ─────────►   │  embed query → hybrid search         │
                              │  → RRF fusion → BM25 rerank          │
                              │  → coverage guarantee                │
                              │  → grounded LLM answer               │
                              │  → citation validation               │
                              │  → quality evaluation + log          │
                              │                                      │
   GET  /api/knowledge-graph  │  paper_extractions → typed graph     │
   GET  /api/evaluation/*     │  per-query RAG metrics               │
                              └──────────────────────────────────────┘
                                              │
                                              ▼
                              ┌──────────────────────────────────────┐
                              │      Supabase Postgres + pgvector    │
                              │  documents          (chunks + vecs)  │
                              │  paper_extractions  (structured md)  │
                              │  query_evaluations  (RAG quality log)│
                              └──────────────────────────────────────┘
                                              │
                                              ▼
                              ┌──────────────────────────────────────┐
                              │            OpenAI API                │
                              │  text-embedding-3-large (3072 dims)  │
                              │  gpt-4o-mini (JSON mode)             │
                              └──────────────────────────────────────┘
```

---

## The RAG pipeline

This is the part recruiters usually want to read closely. Every step exists for a specific failure mode I hit during development.

### 1. Hybrid retrieval
Pure vector search misses queries that hinge on rare terms (e.g. a specific dataset name). Pure keyword search misses paraphrased questions. So both run in parallel and are fused with Reciprocal Rank Fusion:

```
RRF(d) = Σ  1 / (k + rank_i(d))
```

with `k = 60` (the original Cormack et al. constant). RRF is parameter-free, requires no score normalisation, and consistently beats linear score combinations in practice. See `backend/app/services/vector_store.py::hybrid_search`.

### 2. Intent-aware retrieval
A global hybrid search will over-represent whichever paper happens to share vocabulary with the query. For multi-paper questions ("compare the contributions", "summarise each paper") that silently drops documents. A regex-based intent classifier flips the pipeline into a per-source path that fetches the top-K chunks from every indexed paper independently. See `backend/app/api/chat.py::_is_multi_doc_query` and `_retrieve_per_source`.

### 3. BM25 reranking
After dedup, the candidate pool is rescored with Okapi BM25 and combined with the normalised vector score:

```
final = 0.4 × norm_vector + 0.6 × norm_bm25
```

The 60/40 split slightly favours lexical precision because grounded Q&A rewards chunks that literally contain the query terms. Pure Python, no extra deps. See `backend/app/services/reranker.py`.

### 4. Coverage guarantee
After reranking, the pipeline checks that every paper in scope has at least one passage in the final context. Any missing source is back-filled with its single best hybrid match. This runs *after* reranking so the surviving high-quality passages are never displaced.

### 5. Grounded generation
GPT-4o-mini is called with `response_format=json_object` and a system prompt with seven hard rules: context-only, cite every claim, no uncited synthesis, refuse gracefully, citation fidelity, JSON envelope with markdown body, and a strict multi-document layout (one paragraph per paper, bold title heading, citations restricted to that paper). Temperature is fixed at 0.

### 6. Citation reconciliation
Models occasionally emit `[N]` markers that disagree with their `citations` array. The parser ignores the model's citation list and rebuilds it from the markers actually present in the answer, then renumbers everything `[1], [2], [3], ...` so the inline markers and the citation panel can never disagree.

### 7. Defence-in-depth filtering
A final pass scans every sentence in the answer. If it makes a factual claim but has no `[N]` marker, it is stripped. This catches the rare case where the model forgets to cite mid-answer.

### 8. Quality evaluation
After every response, three metrics are computed synchronously and logged to Postgres. The dashboard at `/analytics` surfaces them so regressions are visible. See `backend/app/services/evaluation.py`.

---

## Tech stack

**Backend**
* Python 3.11+
* FastAPI for the HTTP layer with full OpenAPI docs at `/docs`
* psycopg2 + pgvector for the vector store
* PyMuPDF for PDF parsing
* OpenAI Python client for embeddings and chat completions
* Pure-Python BM25 implementation, no heavy ML deps

**Frontend**
* Next.js 14 (App Router)
* React 18 + TypeScript
* Tailwind CSS for the design system
* Zustand for client state
* react-markdown for rendering grounded answers with bold paper titles
* react-force-graph-2d for the knowledge graph

**Data**
* Supabase Postgres with the `pgvector` and `uuid-ossp` extensions
* IVFFlat index on cosine distance
* GIN index on the `to_tsvector('english', text)` keyword column

**LLM stack**
* `text-embedding-3-large` (3 072 dimensions) for embeddings
* `gpt-4o-mini` with JSON mode for structured extraction and grounded answers

---

## Installation

DeepScholar has two services: a FastAPI backend and a Next.js frontend. You will also need a Supabase project (or any Postgres 14+ with pgvector) and an OpenAI API key.

### Prerequisites
* Python 3.11 or newer
* Node.js 18 or newer
* A Supabase project (free tier is fine) or local Postgres with the `pgvector` extension
* An OpenAI API key with access to `text-embedding-3-large` and `gpt-4o-mini`

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/deepscholar.git
cd deepscholar
```

### 2. Set up the database

In the Supabase SQL editor (or with `psql`), run the schema file:

```bash
psql "$SUPABASE_DB_URL" -f backend/sql/schema.sql
```

This creates the `documents` table, the IVFFlat embedding index, the metadata GIN index, and enables `uuid-ossp` and `vector`. The `paper_extractions` and `query_evaluations` tables are created automatically on backend startup.

### 3. Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # or create it from scratch
```

`.env` template:

```dotenv
OPENAI_API_KEY=sk-...
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
CORS_ORIGINS=http://localhost:3000
UPLOAD_DIR=./data/uploads
```

Then start the API:

```bash
uvicorn app.main:app --reload
```

The interactive docs live at `http://localhost:8000/docs`.

### 4. Run the frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` and head to **Upload Literature** to drop in your first PDF.

### Production notes
* Swap the single cached psycopg2 connection in `vector_store.py` for `psycopg2.pool.ThreadedConnectionPool` before deploying with multiple workers.
* `CORS_ORIGINS` should be a comma-separated list of your production domains, never `*` when credentials are enabled.
* `lifespan` in `backend/app/main.py` wipes vectors on startup. That is deliberate for the demo workflow. Remove the `delete_all_documents()` / `delete_all_evaluations()` calls if you want persistence across restarts.

---

## API reference

Full OpenAPI spec lives at `/docs` when the backend is running. The headline endpoints:

| Method | Path                        | Description                                                                |
|--------|-----------------------------|----------------------------------------------------------------------------|
| POST   | `/upload`                   | Upload one or more PDFs, extract metadata, embed and store chunks          |
| POST   | `/chat`                     | Ask a question against the indexed corpus, returns a grounded answer       |
| GET    | `/documents`                | List every indexed source filename                                         |
| DELETE | `/documents/{source}`       | Remove a paper's vectors from the index                                    |
| GET    | `/api/knowledge-graph`      | Return the full typed graph of papers, methods, datasets, tasks            |
| GET    | `/api/evaluation/logs`      | Paginated quality log of every chat query, newest first                    |
| GET    | `/api/evaluation/analytics` | Aggregate averages plus 30-day daily trend                                 |
| DELETE | `/api/evaluation/logs`      | Clear all quality logs                                                     |
| GET    | `/health`                   | Liveness probe                                                             |

### Example: ask a question

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Compare the methodologies of each paper.",
    "sources": []
  }'
```

Response shape:

```json
{
  "answer": "**Attention Is All You Need.**\n\nThe authors introduce the Transformer, an architecture based entirely on self-attention [1]...",
  "citations": [
    {"text": "We propose a new simple network architecture, the Transformer...", "source": "attention.pdf"}
  ],
  "retrieval_stats": {
    "hybrid_candidates": 25,
    "after_dedup": 21,
    "sent_to_llm": 9,
    "multi_doc": true,
    "sources_in_context": ["attention.pdf", "bert.pdf", "gpt3.pdf"],
    "eval": {
      "retrieval_precision": 1.0,
      "citation_correctness": 1.0,
      "answer_faithfulness": 1.0,
      "overall_score": 1.0
    }
  }
}
```

---

## Project layout

```
deepscholar/
├── backend/
│   ├── app/
│   │   ├── api/                # FastAPI routers (chat, upload, documents, graph, eval)
│   │   ├── core/               # Settings (pydantic-settings)
│   │   ├── services/
│   │   │   ├── chunking.py     # Sentence-aware overlapping chunker
│   │   │   ├── embeddings.py   # OpenAI embeddings client
│   │   │   ├── extraction.py   # GPT-4o-mini structured field extraction
│   │   │   ├── llm.py          # Grounded answer + citation reconciliation
│   │   │   ├── reranker.py     # Okapi BM25 reranker
│   │   │   ├── evaluation.py   # RAG quality metrics
│   │   │   ├── vector_store.py # pgvector + hybrid search + RRF fusion
│   │   │   └── pdf_parser.py   # PyMuPDF wrapper
│   │   └── main.py             # FastAPI app factory + lifespan hooks
│   ├── sql/                    # schema.sql, evaluation.sql, knowledge_graph.sql
│   └── requirements.txt
└── frontend/
    ├── app/                    # Next.js App Router pages
    │   ├── upload/             # PDF upload + extraction view
    │   ├── chat/               # Grounded Q&A with citations
    │   ├── compare/            # Side-by-side paper comparison
    │   ├── graph/              # Force-directed knowledge graph
    │   └── analytics/          # RAG quality dashboard
    ├── components/             # AppShell, Navbar, ExtractionPanel, Providers
    ├── store/useResearchStore.ts  # Zustand store for client state
    ├── lib/api.ts              # Typed REST client
    └── package.json
```

---

## What's next

A short list of things I want to add next, in roughly the order I plan to ship them:

* Connection pooling on the backend so the same instance scales past one worker without tripping over psycopg2.
* Streaming answers from `/chat` via Server-Sent Events. The frontend already shows a typing indicator, so the swap is mostly mechanical.
* A "follow-up question" mode that reuses the previous turn's retrieved chunks as a tie-breaker.
* Local-only mode using `sentence-transformers/all-MiniLM-L6-v2` for embeddings and a llama.cpp-served Mistral for generation, for users who can't send papers to OpenAI.
* Cross-encoder reranking as an optional second stage when latency budget allows.

---

## License

MIT. See `LICENSE`.

## Acknowledgements

* Reciprocal Rank Fusion, Cormack, Clarke and Buettcher, 2009.
* Okapi BM25 from Robertson and Zaragoza, *The Probabilistic Relevance Framework: BM25 and Beyond*, 2009.
* The pgvector project for making vector search feel like just another `ORDER BY`.
