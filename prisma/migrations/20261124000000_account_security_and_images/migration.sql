-- Sign-in methods and pictures. Additive: new nullable columns, one new enum value, one new table; nothing existing is rewritten
-- except the two backfills below, which only fill the new columns.
-- AlterEnum
ALTER TYPE "EmailTokenType" ADD VALUE 'PASSWORD_SET_CODE';
-- AlterTable
ALTER TABLE "email_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
-- AlterTable
ALTER TABLE "users" ADD COLUMN "passwordSetAt" TIMESTAMP(3),
ADD COLUMN "providerImage" TEXT;
-- Backfill: accounts with no social sign-in were created with a password. For accounts with one, a real password is only known
-- when the person changed it through Torio; the others show "Password not set", which is the safe answer, and can set one.
UPDATE "users" u SET "passwordSetAt" = u."createdAt"
WHERE NOT EXISTS (SELECT 1 FROM "user_identities" i WHERE i."userId" = u."id");
UPDATE "users" u SET "passwordSetAt" = a."firstAt"
FROM (SELECT "actorId", MIN("createdAt") AS "firstAt" FROM "audit_logs" WHERE "action" IN ('user.password_change', 'auth.password_reset') GROUP BY "actorId") a
WHERE u."passwordSetAt" IS NULL AND a."actorId" = u."id";
-- Backfill: until now `image` held the provider's picture unless the person chose their own.
UPDATE "users" SET "providerImage" = "image" WHERE "image" IS NOT NULL AND "imageSource" IS DISTINCT FROM 'CUSTOM';
-- CreateTable
CREATE TABLE "stored_images" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stored_images_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "stored_images_kind_ownerId_key" ON "stored_images"("kind", "ownerId");
