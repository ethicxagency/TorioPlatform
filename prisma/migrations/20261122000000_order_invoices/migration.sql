-- Customer invoice identity per order (number + issue date). Additive: one new table and one new column with a default; nothing
-- existing is changed or rewritten.
-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "invoiceSeq" INTEGER NOT NULL DEFAULT 0;
-- CreateTable
CREATE TABLE "order_invoices" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    CONSTRAINT "order_invoices_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "order_invoices_orderId_key" ON "order_invoices"("orderId");
-- CreateIndex
CREATE UNIQUE INDEX "order_invoices_workspaceId_number_key" ON "order_invoices"("workspaceId", "number");
-- CreateIndex
CREATE INDEX "order_invoices_workspaceId_issuedAt_idx" ON "order_invoices"("workspaceId", "issuedAt" DESC);
-- AddForeignKey
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
