-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "externalAccountId" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "lastInboundAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "messagingOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "errorMessage" TEXT;

-- CreateTable
CREATE TABLE "channel_credentials" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" UUID NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "workspaceId" UUID,
    "channelId" UUID,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_credentials_channelId_key" ON "channel_credentials"("channelId");

-- CreateIndex
CREATE INDEX "channel_credentials_workspaceId_idx" ON "channel_credentials"("workspaceId");

-- CreateIndex
CREATE INDEX "provider_webhook_events_status_receivedAt_idx" ON "provider_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_eventKey_key" ON "provider_webhook_events"("provider", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "channels_provider_externalAccountId_key" ON "channels"("provider", "externalAccountId");

-- AddForeignKey
ALTER TABLE "channel_credentials" ADD CONSTRAINT "channel_credentials_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: the customer service window runs from the newest inbound message.
UPDATE "conversations" c SET "lastInboundAt" = m.last
FROM (SELECT "conversationId", MAX("createdAt") AS last FROM "messages" WHERE "kind" = 'INBOUND' GROUP BY "conversationId") m
WHERE m."conversationId" = c.id;
