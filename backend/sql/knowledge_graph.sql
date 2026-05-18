-- DeepScholar — Knowledge Graph schema
-- Run this in your Supabase SQL editor after schema.sql.
--
-- Stores one row per uploaded paper with all structured fields needed
-- to build the interactive knowledge graph on the frontend.

CREATE TABLE IF NOT EXISTS paper_extractions (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    source     TEXT        NOT NULL,
    title      TEXT,
    authors    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    abstract   TEXT,
    methodology TEXT,
    methods    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    datasets   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    metrics    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    tasks      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    improves_on JSONB      NOT NULL DEFAULT '[]'::jsonb,
    limitations TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT paper_extractions_source_key UNIQUE (source)
);

CREATE INDEX IF NOT EXISTS paper_extractions_source_idx
    ON paper_extractions (source);
