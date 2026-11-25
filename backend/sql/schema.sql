-- DeepScholar — pgvector schema
--
-- You don't need to run this by hand anymore: the backend creates all tables
-- on startup, sized to VECTOR_DIMENSIONS. It's kept here as a reference and
-- for people who prefer managing schema themselves.
--
-- The vector(3072) below matches text-embedding-3-large. The local default
-- (nomic-embed-text via Ollama) is 768 dims, so change it if you run this.
--
-- Prerequisites (already enabled on Supabase by default):
--   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--   CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 2. documents table
--    One row per text chunk.  The embedding column uses pgvector's `vector`
--    type; the dimension (3072) matches text-embedding-3-large output.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    text       TEXT        NOT NULL,
    embedding  vector(3072) NOT NULL,
    metadata   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. ANN index
--    pgvector can't index more than 2000 dims, so with 3072-dim vectors there
--    is no index and search is an exact scan (fast enough for a few thousand
--    chunks). For <= 2000 dims, use:
--      CREATE INDEX documents_embedding_hnsw_idx
--          ON documents USING hnsw (embedding vector_cosine_ops);
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. Helper index on metadata fields used in search_similar filters
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_metadata_idx
    ON documents USING gin (metadata);
