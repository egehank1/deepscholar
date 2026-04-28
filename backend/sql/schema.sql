-- DeepScholar — pgvector schema
-- Run this once in your Supabase SQL editor (or via psql).
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
-- 3. IVFFlat index for fast approximate nearest-neighbour search
--    lists=100 is a sensible starting point for up to ~1 M rows.
--    Rebuild with a higher value as your dataset grows.
--    cosine distance matches OpenAI's recommended similarity metric.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_embedding_idx
    ON documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- 4. Helper index on metadata fields used in search_similar filters
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_metadata_idx
    ON documents USING gin (metadata);
