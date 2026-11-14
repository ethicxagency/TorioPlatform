-- Product feeds Torio publishes for sales channels. Additive: one enum pair and one table.

CREATE TYPE "CatalogFeedChannel" AS ENUM ('GOOGLE', 'META', 'TIKTOK', 'CUSTOM');
CREATE TYPE "CatalogFeedStatus" AS ENUM ('ACTIVE', 'PAUSED');

CREATE TABLE "catalog_feeds" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CatalogFeedChannel" NOT NULL,
    "status" "CatalogFeedStatus" NOT NULL DEFAULT 'ACTIVE',
    "inStockOnly" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "tokenCipher" TEXT NOT NULL,
    "lastServedAt" TIMESTAMP(3),
    "servedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_feeds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_feeds_tokenHash_key" ON "catalog_feeds"("tokenHash");
CREATE INDEX "catalog_feeds_workspaceId_idx" ON "catalog_feeds"("workspaceId");

ALTER TABLE "catalog_feeds"
    ADD CONSTRAINT "catalog_feeds_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
