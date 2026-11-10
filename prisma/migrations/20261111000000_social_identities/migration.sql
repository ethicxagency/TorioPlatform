-- Google / Facebook sign-in for customers. Additive only: no existing table or column is changed.
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_identities_provider_providerUserId_key" ON "user_identities"("provider", "providerUserId");
CREATE INDEX "user_identities_userId_idx" ON "user_identities"("userId");
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pending_social_signups" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_social_signups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_social_signups_tokenHash_key" ON "pending_social_signups"("tokenHash");
CREATE INDEX "pending_social_signups_provider_providerUserId_idx" ON "pending_social_signups"("provider", "providerUserId");
