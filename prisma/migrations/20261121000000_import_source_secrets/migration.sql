-- Encrypted credential for import sources that need one (the Meta catalog connection). Additive: one new table; nothing existing is
-- touched. Requires 20261119000000_import_sources.
-- CreateTable
CREATE TABLE "import_source_secrets" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_source_secrets_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "import_source_secrets_sourceId_key" ON "import_source_secrets"("sourceId");
-- CreateIndex
CREATE INDEX "import_source_secrets_workspaceId_idx" ON "import_source_secrets"("workspaceId");
-- AddForeignKey
ALTER TABLE "import_source_secrets" ADD CONSTRAINT "import_source_secrets_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "import_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
