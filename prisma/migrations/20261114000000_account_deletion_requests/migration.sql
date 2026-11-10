-- Account deletion requests. Additive. Rollback: DROP TABLE "account_deletion_requests"; DROP TYPE "DeletionStatus";
CREATE TYPE "DeletionStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'PROCESSING', 'COMPLETED', 'REJECTED');

CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DeletionStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "processedById" UUID,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_deletion_requests_reference_key" ON "account_deletion_requests"("reference");
CREATE UNIQUE INDEX "account_deletion_requests_tokenHash_key" ON "account_deletion_requests"("tokenHash");
CREATE INDEX "account_deletion_requests_userId_status_idx" ON "account_deletion_requests"("userId", "status");
CREATE INDEX "account_deletion_requests_status_createdAt_idx" ON "account_deletion_requests"("status", "createdAt");
-- One active request per customer, even under concurrent submissions.
CREATE UNIQUE INDEX "account_deletion_one_active_per_user" ON "account_deletion_requests"("userId")
  WHERE "userId" IS NOT NULL AND "status" IN ('PENDING_VERIFICATION', 'VERIFIED', 'PROCESSING');
