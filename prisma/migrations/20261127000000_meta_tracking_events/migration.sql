-- Conversions API event log with idempotency per (owner, event id). Additive.

CREATE TABLE "meta_tracking_events" (
    "id" UUID NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "nextTryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_tracking_events_ownerKey_eventId_key" ON "meta_tracking_events"("ownerKey", "eventId");
CREATE INDEX "meta_tracking_events_ownerKey_createdAt_idx" ON "meta_tracking_events"("ownerKey", "createdAt" DESC);
CREATE INDEX "meta_tracking_events_ownerKey_status_idx" ON "meta_tracking_events"("ownerKey", "status");
