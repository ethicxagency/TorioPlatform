-- Import sources and import jobs for the Brain Intelligence import hub. Purely additive: two new tables and three enums; no
-- existing table, column or row is touched. Nothing reads these tables unless they exist (the API tolerates their absence).
-- CreateEnum
CREATE TYPE "ImportSourceKind" AS ENUM ('WEBSITE', 'XML_FEED', 'META_CATALOG', 'GOOGLE_MERCHANT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportSourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "import_sources" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "ImportSourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "ImportSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sourceId" UUID,
    "kind" "ImportSourceKind" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "stats" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_sources_workspaceId_kind_idx" ON "import_sources"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "import_jobs_workspaceId_createdAt_idx" ON "import_jobs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "import_jobs_sourceId_idx" ON "import_jobs"("sourceId");

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "import_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

