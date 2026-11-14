-- Per-workspace integration settings (Meta Pixel). Additive.

CREATE TABLE "workspace_integrations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_integrations_workspaceId_key_key" ON "workspace_integrations"("workspaceId", "key");

ALTER TABLE "workspace_integrations"
    ADD CONSTRAINT "workspace_integrations_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
