-- Email delivery records and processed provider webhook events. Purely additive: two new tables.

CREATE TABLE "email_delivery_logs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "kind" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "workspaceId" UUID,
    "userId" UUID,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastEvent" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_delivery_logs_createdAt_idx" ON "email_delivery_logs"("createdAt" DESC);
CREATE INDEX "email_delivery_logs_status_createdAt_idx" ON "email_delivery_logs"("status", "createdAt" DESC);
CREATE INDEX "email_delivery_logs_providerMessageId_idx" ON "email_delivery_logs"("providerMessageId");
CREATE INDEX "email_delivery_logs_workspaceId_createdAt_idx" ON "email_delivery_logs"("workspaceId", "createdAt" DESC);

CREATE TABLE "integration_webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_webhook_events_provider_eventId_key" ON "integration_webhook_events"("provider", "eventId");
CREATE INDEX "integration_webhook_events_receivedAt_idx" ON "integration_webhook_events"("receivedAt");
