-- One-time pgvector setup for VectorRecord's real similarity search.
-- Run this once, AFTER `prisma db push` has created the base VectorRecord
-- table (including the Unsupported("vector(1024)") embeddingVec column
-- and the plain Float[] embedding column), as a Postgres superuser
-- (CREATE EXTENSION needs superuser).
--
-- Both embedding providers currently in use (jina, mistral) produce
-- 1024-dimension vectors. If a future provider uses a different
-- dimension, this whole approach needs rethinking (pgvector requires one
-- fixed dimension per indexed column) -- not handled here.
--
-- Where this came from: on Windows, pgvector has no official prebuilt
-- binary. It was compiled from the OFFICIAL github.com/pgvector/pgvector
-- source using Microsoft's own Visual Studio Build Tools (never use an
-- unofficial precompiled .dll from a third party -- that runs arbitrary
-- code inside your database server). On Linux (a real VPS), skip all of
-- that: `apt install postgresql-17-pgvector` (or your distro's
-- equivalent) already ships an official package -- there is nothing to
-- "transfer" from this Windows build, just install pgvector fresh on the
-- target machine and run this same SQL.

CREATE EXTENSION IF NOT EXISTS vector;

-- Backfill any existing rows (no-op on a fresh empty table).
UPDATE "VectorRecord" SET "embeddingVec" = embedding::vector WHERE "embeddingVec" IS NULL;

-- HNSW: good default for read-heavy similarity search: fast queries,
-- accepts slower writes/index-build than IVFFlat in exchange. Rebuilding
-- this on a large existing table takes real time (a ~62k-row table took
-- about a minute) -- expected, one-time cost.
CREATE INDEX IF NOT EXISTS vectorrecord_embeddingvec_hnsw_idx
  ON "VectorRecord" USING hnsw ("embeddingVec" vector_cosine_ops);

-- Keeps embeddingVec in sync automatically -- app code only ever writes
-- the plain `embedding` Float[] column (via Prisma), never embeddingVec
-- directly, so every future insert/update needs this to stay searchable.
CREATE OR REPLACE FUNCTION sync_embedding_vec() RETURNS trigger AS $$
BEGIN
  NEW."embeddingVec" := NEW.embedding::vector;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_embedding_vec ON "VectorRecord";

CREATE TRIGGER trg_sync_embedding_vec
  BEFORE INSERT OR UPDATE OF embedding ON "VectorRecord"
  FOR EACH ROW EXECUTE FUNCTION sync_embedding_vec();
