-- Website scan results. Additive only: one new enum, one new table and one new nullable column on import_jobs.
-- Requires 20261119000000_import_sources.
CREATE TYPE "ImportRecordStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IMPORTED');

ALTER TABLE "import_jobs" ADD COLUMN "state" JSONB;

CREATE TABLE "import_records" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "original" JSONB NOT NULL,
    "sourceUrl" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "warnings" JSONB,
    "status" "ImportRecordStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_records_jobId_idx" ON "import_records"("jobId");

CREATE INDEX "import_records_workspaceId_status_idx" ON "import_records"("workspaceId", "status");

ALTER TABLE "import_records" ADD CONSTRAINT "import_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_records" ADD CONSTRAINT "import_records_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
