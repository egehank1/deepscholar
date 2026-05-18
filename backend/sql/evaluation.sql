-- RAG Quality Evaluation Log
-- Run this in Supabase SQL editor or via psql before starting the backend.
-- The backend also calls ensure_evaluation_table() on startup via ensure_tables().

CREATE TABLE IF NOT EXISTS query_evaluations (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    question             TEXT        NOT NULL,
    answer               TEXT        NOT NULL,
    citations            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    retrieval_stats      JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Retrieval precision: fraction of retrieved chunks actually cited in answer
    retrieval_precision  FLOAT,

    -- Citation correctness: fraction of citations whose text is grounded in retrieved chunks
    citation_correctness FLOAT,

    -- Answer faithfulness: fraction of factual sentences that carry a citation marker
    answer_faithfulness  FLOAT,

    -- Composite score: unweighted mean of the three metrics above
    overall_score        FLOAT,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS query_evaluations_created_idx
    ON query_evaluations (created_at DESC);
