-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "reportingTimeZone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateIndex
CREATE INDEX "order_payments_workspaceId_paidAt_idx" ON "order_payments"("workspaceId", "paidAt");

