-- Multi-store: a store is a workspace. Purely additive; existing rows keep working and no data is moved.
ALTER TABLE "users" ADD COLUMN "image" TEXT, ADD COLUMN "imageSource" TEXT;

ALTER TABLE "workspaces"
  ADD COLUMN "logo" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "addressLine" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postalCode" TEXT;

CREATE TABLE "user_preferences" (
  "userId" UUID NOT NULL,
  "lastActiveWorkspaceId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_lastActiveWorkspaceId_fkey"
  FOREIGN KEY ("lastActiveWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "user_preferences_lastActiveWorkspaceId_idx" ON "user_preferences"("lastActiveWorkspaceId");

ALTER TABLE "pending_social_signups" ADD COLUMN "image" TEXT;
