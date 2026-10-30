
-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "ownerId" UUID,
ADD COLUMN     "phoneKey" TEXT,
ADD COLUMN     "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_notes_customerId_createdAt_idx" ON "customer_notes"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customers_workspaceId_ownerId_idx" ON "customers"("workspaceId", "ownerId");

-- CreateIndex
CREATE INDEX "customers_workspaceId_createdAt_idx" ON "customers"("workspaceId", "createdAt" DESC);

-- Backfill: lower-case emails and derive the digits-only phone key. Where two existing customers in a workspace
-- would collide, only the oldest keeps the key (the rest stay NULL) so the unique indexes can be created safely.
UPDATE "customers" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL;
UPDATE "customers" c SET "email" = NULL
  WHERE "email" IS NOT NULL AND EXISTS (SELECT 1 FROM "customers" o WHERE o."workspaceId" = c."workspaceId" AND o."email" = c."email" AND (o."createdAt", o."id") < (c."createdAt", c."id"));
UPDATE "customers" SET "phoneKey" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '') WHERE "phone" IS NOT NULL;
UPDATE "customers" c SET "phoneKey" = NULL
  WHERE "phoneKey" IS NOT NULL AND EXISTS (SELECT 1 FROM "customers" o WHERE o."workspaceId" = c."workspaceId" AND o."phoneKey" = c."phoneKey" AND (o."createdAt", o."id") < (c."createdAt", c."id"));

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspaceId_email_key" ON "customers"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspaceId_phoneKey_key" ON "customers"("workspaceId", "phoneKey");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

