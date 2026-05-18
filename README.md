# DeepScholar

AI-powered research assistant that ingests academic PDFs and turns them into a grounded, citable knowledge base. Ask questions, get answers backed by exact source passages, and compare methodologies across papers without hallucinated citations.

## What it does

Most RAG systems retrieve chunks and hope for the best. DeepScholar enforces a citation contract at the prompt level, extracts a structured schema from every paper at ingestion time, and keeps a persistent document store across the entire frontend.

- Upload PDFs and get a fully indexed, queryable knowledge base
- Ask questions and receive answers with inline, verifiable citations
- Every citation traces back to a specific chunk, page, and passage
- Compare methodology, datasets, metrics, and limitations across papers side by side
- Persistent document library that survives navigation and page refreshes

## Architecture

### Ingestion pipeline

Each uploaded PDF goes through four sequential stages before a single vector is committed.

**1. Validation**
Magic-byte check on the first four bytes of every file. Rejects non-PDF payloads before PyMuPDF is ever invoked.

**2. Text extraction**
PyMuPDF extracts raw text page by page with page boundaries preserved as metadata. Post-processing normalizes whitespace, strips repeating headers and footers, and reassembles hyphenated words split across line breaks.

**3. Sentence-aware chunking**
spaCy sentence boundary detection splits content with configurable overlap between adjacent chunks. Each chunk is stored with source filename, page range, chunk index, and character offsets.

**4. Structured extraction**
A separate LLM call runs after text extraction and before chunk vectors are committed. Extracts a validated JSON schema per document:

```json
{
  "title": "...",
  "authors": [...],
  "abstract": "...",
  "methodology": "...",
  "datasets": [...],
  "metrics": {...},
  "limitations": "..."
}
```

Schema is enforced at the service boundary. Malformed responses trigger a retry with a narrowed context window. Field-level failure is independent, so one missing field does not invalidate the rest of the extraction.

### Vector storage

Embeddings generated via OpenAI `text-embedding-3-small` stored in PostgreSQL with pgvector on Supabase. IVFFlat index on the vector column keeps P99 cosine similarity search under 100ms at scale. SHA-256 fingerprinting per chunk prevents duplicate vector entries on re-upload.

### Query pipeline

1. Embed the user query with the same model used for document chunks
2. Cosine similarity search returns top-k chunks
3. Prompt construction with a strict citation contract: the model must cite retrieved passages for every claim or explicitly decline
4. Structured JSON response: answer text and citation array with `source_filename`, `chunk_id`, and verbatim passage
5. Every citation is verifiable against the stored chunk by ID

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python |
| PDF Processing | PyMuPDF, spaCy |
| Embeddings | OpenAI text-embedding-3-small |
| Vector Store | PostgreSQL, pgvector, Supabase |
| LLM | OpenAI GPT-4 |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| State | React Context API, localStorage |

## Frontend

**Global document store**
React Context backed by localStorage rehydration. `FileResult[]` persists across route changes and hard refreshes. `addDocuments` deduplicates by filename. `removeDocument` and `clearDocuments` provide full store control. A thin `"use client"` Providers wrapper bridges the server component boundary in `layout.tsx`.

**Upload page**
Per-file progress via XHR `onprogress` events tracked per filename in a `useReducer` map. Persistent Indexed Library table driven by global context state, not last-batch response. Parsing status badges derived from `FileResult` status enum: `pending`, `extracting`, `chunking`, `indexed`, `failed`. `chunks_stored` and `pages_extracted` rendered as secondary metadata per document card.

**Research Insights Panel**
Expandable cards per extraction field, mounted inline in upload results and on a dedicated document detail page. Collapsed by default, expand state tracked per card per document. Missing fields render a degraded state cell rather than an empty gap.

**Comparison workspace (`/compare`)**
Multi-select over the global document store. Side-by-side column layout, one column per document, rows fixed to methodology, datasets, metrics, limitations. Data pulled directly from stored extraction payload, no LLM call at render time, no new backend endpoints.

## Getting Started

**Prerequisites**
- Python 3.10+
- Node.js 18+
- Supabase account with pgvector enabled
- OpenAI API key

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file:

```
OPENAI_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
```

```bash
uvicorn main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Create a `.env.local` file:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Roadmap

- Hybrid search: BM25 keyword index in parallel with dense retrieval, merged via reciprocal rank fusion
- Reranking model re-scoring the merged candidate set before context window construction
- Citation grounding enforcement at the output layer
- Research Memory Layer: structured facts persisted as a knowledge graph for cross-paper reasoning
- Query Intelligence Layer: rewrite step that decomposes abstract queries into concrete entity terms before hitting the index
- Paper Graph: methods, datasets, and tasks as typed nodes with edges defined by co-occurrence
- Evaluation system: recall@k, citation correctness, and LLM-judge faithfulness scoring

## License

MIT
