-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Backfill: resolution time was not recorded before. updatedAt is the closest available stamp for conversations that
-- are resolved today; it is an approximation for historical rows only.
UPDATE "conversations" SET "resolvedAt" = "updatedAt" WHERE "status" = 'RESOLVED';

-- Supports the dashboard's waiting/resolved queries.
CREATE INDEX "conversations_workspaceId_resolvedAt_idx" ON "conversations"("workspaceId", "resolvedAt");
