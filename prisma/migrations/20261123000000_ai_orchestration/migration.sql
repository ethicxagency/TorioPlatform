-- Central AI infrastructure: providers (encrypted keys), their models, and a request/call log for usage and cost. Additive: four new
-- tables; nothing existing is changed.
-- CreateTable
CREATE TABLE "ai_providers" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keyCiphertext" TEXT,
    "keyLast4" TEXT,
    "keyUpdatedAt" TIMESTAMP(3),
    "defaultModel" TEXT,
    "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "maxOutputTokens" INTEGER,
    "temperature" DOUBLE PRECISION,
    "supportsTemperature" BOOLEAN NOT NULL DEFAULT true,
    "inputPriceMicros" INTEGER,
    "outputPriceMicros" INTEGER,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "conversationId" UUID,
    "requestId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "phase" TEXT NOT NULL DEFAULT 'understanding',
    "strategy" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER,
    "durationMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorCategory" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ai_calls" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "modelRefId" UUID,
    "role" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCategory" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_key_key" ON "ai_providers"("key");
-- CreateIndex
CREATE UNIQUE INDEX "ai_models_providerId_modelId_key" ON "ai_models"("providerId", "modelId");
-- CreateIndex
CREATE UNIQUE INDEX "ai_requests_workspaceId_requestId_key" ON "ai_requests"("workspaceId", "requestId");
-- CreateIndex
CREATE INDEX "ai_requests_workspaceId_createdAt_idx" ON "ai_requests"("workspaceId", "createdAt" DESC);
-- CreateIndex
CREATE INDEX "ai_requests_createdAt_idx" ON "ai_requests"("createdAt" DESC);
-- CreateIndex
CREATE INDEX "ai_requests_status_idx" ON "ai_requests"("status");
-- CreateIndex
CREATE INDEX "ai_calls_requestId_idx" ON "ai_calls"("requestId");
-- CreateIndex
CREATE INDEX "ai_calls_provider_model_createdAt_idx" ON "ai_calls"("provider", "model", "createdAt" DESC);
-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_modelRefId_fkey" FOREIGN KEY ("modelRefId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
