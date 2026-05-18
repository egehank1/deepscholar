# I Built a Research Assistant That Actually Cites Its Sources. Here's Every Decision I Made.

Literature review is one of those problems that seems manageable until it isn't. Fifteen papers in, tracking methodologies across tabs and copy-pasted notes, I realized I was spending more time managing information than actually thinking about it.

I was trying to synthesize findings across a pile of academic papers — comparing methodologies, figuring out which datasets kept showing up, tracking where studies contradicted each other. All of it manual. Ctrl+F through PDFs. Reading the same abstract twice because I'd forgotten what I read an hour earlier. Cross-referencing footnotes like some kind of pre-digital archivist.

At some point I stopped and thought: this is an information retrieval problem. I know how to build systems that solve information retrieval problems.

So I closed everything, opened a terminal, and started building DeepScholar.


## First thing I did: figure out what was actually broken

The easy version of this project would have been upload PDFs, chunk them, embed them, similarity search, return answers. That's a weekend tutorial. I've read that tutorial. I wanted something I would actually go back and use.

So before touching any code I wrote down the real failure modes — not the obvious ones, the ones that make a tool feel untrustworthy after a few days of actual use.

Hallucinated citations are the worst offender. General-purpose LLMs will confidently cite papers that don't exist, with realistic-sounding titles and authors. In any other context that's annoying. In academic work it's a hard disqualifier.

Then there's chunk boundary blindness. If a methodology spans two pages, a naive chunker splits it and both halves become semantically weaker in isolation. You retrieve half a thought and the model tries to build an answer from it.

And there's no memory across papers. Every query starts from scratch. The system learns nothing from the previous ten questions. There's no accumulation.

I didn't solve all of this in v1. But I designed the architecture so that none of it would be structurally impossible to fix later. That constraint ended up shaping almost every decision.


## The backend: ingestion as a real pipeline, not a script

I picked FastAPI. Async-first mattered because I didn't want the API blocking during a 30-second ingestion job when multiple uploads were happening concurrently. That's a basic requirement that a lot of hobby projects ignore until it's a problem.

The first thing that happens when a file hits the upload endpoint is magic-byte validation. I don't trust the Content-Type header — I read the first four bytes of the file and verify the PDF signature before anything else runs. If it fails, it gets rejected before PyMuPDF ever sees it. At scale you really don't want malformed files reaching your text extraction layer.

Text extraction runs through PyMuPDF page by page, preserving page boundaries as metadata because I need them later for both chunking decisions and citations. Academic PDFs are genuinely messy — two-column layouts, tables mid-paragraph, footnotes that break across lines. I wrote post-processing to normalize whitespace, strip repeating headers and footers, and reassemble hyphenated words split across line breaks. None of that is glamorous work. All of it matters downstream.

Chunking is where most RAG tutorials cut corners and where retrieval quality quietly falls apart. My chunker doesn't split on token count. It splits on sentence boundaries using spaCy's sentence boundary detection, with configurable overlap between adjacent chunks. The overlap exists so that context straddling a chunk boundary doesn't disappear on both sides. Each chunk gets stored with its source filename, page range, chunk index, and character offsets. That metadata is what makes real citations possible later — not just a filename, but a specific passage at a specific location in a specific document.

Embeddings go through OpenAI's text-embedding-3-small and land in PostgreSQL via pgvector on Supabase. The schema was designed for multi-document workspaces from the start. Each vector row carries the chunk text, the embedding, the source document ID, page range, chunk index, and a SHA-256 fingerprint of the chunk content. That fingerprint handles re-uploads — if someone uploads the same paper again, the pipeline hashes each chunk, finds the existing match, and skips insertion. No duplicate vectors, no retrieval noise.

I put an IVFFlat index on the vector column. At small corpus sizes it barely matters. At ten thousand chunks it keeps P99 similarity search under 100ms.


## The extraction layer — this is the part I'm actually proud of

After chunking and embedding are done, most RAG systems stop. I added a fourth stage that I think is the most consequential architectural decision in the project.

For every uploaded paper, after text extraction and before the chunk vectors get committed, I run a separate LLM call that extracts a typed JSON schema: title, authors, abstract, methodology, datasets, metrics, limitations.

This isn't best-effort. The schema gets validated at the service boundary. If the model returns a malformed response — missing required fields, wrong types, empty strings where real content should be — extraction fails and retries with a narrowed context window focused on the relevant section of the paper. And field-level failure is independent. If a paper doesn't discuss limitations explicitly and that field comes back empty, the other six fields are still stored and usable. One missing field doesn't invalidate the whole extraction.

This schema lives separately from the chunk vectors. It's queryable on its own. It's what powers the research insights panel and the comparison workspace on the frontend.

The reason this matters is that vector search and schema extraction answer different questions. Vector search tells you what is semantically similar to your query. Schema extraction tells you what a document actually *is* — what methodology it uses, what datasets it touches, where it acknowledges its own limits. You need both, and they're not substitutes for each other.


## The query pipeline

At query time: embed the user's question, run cosine similarity search over the indexed chunk vectors, pull the top-k results, construct a prompt.

The prompt has a hard contract written into it. The model must answer only from the provided context. For every claim it makes, it must emit a citation. If the retrieved context doesn't support an answer, it says so — it doesn't fill the gap with something it thinks it knows.

Citations come back as structured JSON: source filename, chunk_id, and the verbatim passage. Every citation is verifiable against the stored chunk by ID. The frontend can surface the actual text, not just a filename. That's the difference between a citation and a reference — one you can check, one you have to trust.

This doesn't solve every hallucination vector. It doesn't prevent the model from citing a chunk that doesn't quite support the claim it's attached to. But it eliminates the failure mode where the model invents a paper wholesale, which is the one that makes the whole system untrustworthy.


## Frontend: where the interesting engineering happened

Next.js 14, TypeScript, Tailwind. The state layer is where things got interesting.

Early on I ran into a predictable problem: navigating away from the upload page destroyed all upload data. Each page had its own isolated useState. When the component unmounted, the document list was gone.

The fix was a React Context wrapping the entire application, mounted in layout.tsx via a thin "use client" Providers wrapper — necessary because layout.tsx is a server component and can't directly render context providers. The context holds a FileResult[] array, rehydrates from localStorage on mount so documents survive hard refreshes, and exposes three operations: addDocuments with filename-based deduplication, removeDocument, and clearDocuments. Every page reads from the same store. No page owns the document list. The state outlives the component tree.

For upload progress I replaced fetch with XMLHttpRequest specifically to get access to onprogress events. Progress is tracked in a useReducer map keyed by filename — not a single scalar. If you're uploading five papers simultaneously, each one has its own progress indicator reflecting its actual state, not an average that hides one file stalling at 40%.

Once a paper is ingested, the extraction schema surfaces immediately in an expandable card interface — methodology, datasets, metrics, limitations, each collapsed by default to avoid layout saturation on dense extractions. Expand state is tracked per card per document. Opening methodology on one paper doesn't touch anything else. Fields that failed extraction render a degraded state variant rather than disappearing — the user knows the data isn't there, which is different from not knowing why the layout looks thin.

The comparison workspace at /compare was the feature that made the most sense to build once the extraction pipeline existed. Users select multiple documents from the global store. A fixed-row, variable-column table renders one column per document, with rows for methodology, datasets, metrics, and limitations. Data comes directly from the stored extraction payload — there's no LLM call happening at render time, no new backend endpoints. The extraction did the work during ingestion. /compare just shows the diff. Beyond three documents the table scrolls horizontally rather than collapsing columns, because a layout that breaks at four papers is not a layout.


## What I'd build next

The retrieval layer is still the biggest open problem. Dense vector search degrades on exact-match queries — a BM25 keyword index running in parallel, with results merged via reciprocal rank fusion, would improve recall on queries that contain specific dataset names or methodology terms that are semantically common but lexically distinctive.

A reranking model between retrieval and generation would sharpen what actually makes it into the context window, which matters more than people think — the difference between the 20th and 5th most relevant chunk can be the difference between a good answer and a hedged non-answer.

The memory problem is solvable with a knowledge graph that persists structured facts across papers. Instead of starting from zero on every query, the system accumulates what it's learned. That's when it stops feeling like a search tool and starts feeling like something that understands the corpus.

None of these are speculative. The ingestion schema was designed with them in mind. That was the point of spending the time on the architecture before writing a single route handler.

The thing I kept coming back to while building this was trust. A research tool that might be wrong is worse than no tool at all, because you'd use it anyway. Every decision in this system — the citation contract, the schema validation, the magic-byte check, the deduplication fingerprinting — was made because I wanted to build something I'd actually stake a claim on.

That's still the bar.
