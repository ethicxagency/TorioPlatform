-- AlterTable
ALTER TABLE "users" ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "landingPage" TEXT NOT NULL DEFAULT 'dashboard',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timeZone" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "defaultCurrency" VARCHAR(3),
ADD COLUMN     "description" TEXT;

