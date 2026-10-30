-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateTable
CREATE TABLE "automations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER,
    "publishedRevision" INTEGER,
    "createdById" UUID,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_versions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "publishedById" UUID,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "resumeAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automations_workspaceId_status_idx" ON "automations"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "automations_workspaceId_triggerType_status_idx" ON "automations"("workspaceId", "triggerType", "status");

-- CreateIndex
CREATE INDEX "automations_workspaceId_updatedAt_idx" ON "automations"("workspaceId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "automation_versions_automationId_version_key" ON "automation_versions"("automationId", "version");

-- CreateIndex
CREATE INDEX "automation_executions_workspaceId_createdAt_idx" ON "automation_executions"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "automation_executions_automationId_createdAt_idx" ON "automation_executions"("automationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "automation_executions_status_resumeAt_idx" ON "automation_executions"("status", "resumeAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_automationId_eventKey_key" ON "automation_executions"("automationId", "eventKey");

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

