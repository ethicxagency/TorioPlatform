-- Meta channel connections: token expiry, webhook health, per-channel contacts and short-lived OAuth sessions.
ALTER TABLE "channels"
  ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "webhookStatus" TEXT,
  ADD COLUMN "webhookError" TEXT,
  ADD COLUMN "lastEventAt" TIMESTAMP(3);

CREATE TABLE "channel_contacts" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "channelId" UUID NOT NULL,
  "externalId" TEXT NOT NULL,
  "customerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channel_contacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_contacts_channelId_externalId_key" ON "channel_contacts"("channelId", "externalId");
CREATE INDEX "channel_contacts_workspaceId_customerId_idx" ON "channel_contacts"("workspaceId", "customerId");
ALTER TABLE "channel_contacts" ADD CONSTRAINT "channel_contacts_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "channel_oauth_sessions" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "ChannelProvider" NOT NULL,
  "candidates" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channel_oauth_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "channel_oauth_sessions_workspaceId_userId_idx" ON "channel_oauth_sessions"("workspaceId", "userId");
CREATE INDEX "channel_oauth_sessions_expiresAt_idx" ON "channel_oauth_sessions"("expiresAt");
