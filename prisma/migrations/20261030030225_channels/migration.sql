-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChannelStatus" ADD VALUE 'NEEDS_ATTENTION';
ALTER TYPE "ChannelStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "accountMask" TEXT,
ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "connectedAt" TIMESTAMP(3),
ADD COLUMN     "defaultAssigneeId" UUID,
ADD COLUMN     "defaultTeamId" UUID,
ADD COLUMN     "disconnectedAt" TIMESTAMP(3),
ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastHealthCheckAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_defaultTeamId_fkey" FOREIGN KEY ("defaultTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
