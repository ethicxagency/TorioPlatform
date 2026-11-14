-- Workspace-scoped custom roles. Purely additive: no existing row changes, so every current member keeps exactly the
-- permissions of their Owner/Admin/Agent role until someone is deliberately given a custom role.

CREATE TABLE "workspace_roles" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" TEXT,
    "templateKey" TEXT,
    "permissions" TEXT[],
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_roles_workspaceId_nameKey_key" ON "workspace_roles"("workspaceId", "nameKey");
CREATE INDEX "workspace_roles_workspaceId_idx" ON "workspace_roles"("workspaceId");

ALTER TABLE "workspace_roles"
    ADD CONSTRAINT "workspace_roles_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_memberships" ADD COLUMN "customRoleId" UUID;
CREATE INDEX "workspace_memberships_customRoleId_idx" ON "workspace_memberships"("customRoleId");
ALTER TABLE "workspace_memberships"
    ADD CONSTRAINT "workspace_memberships_customRoleId_fkey"
    FOREIGN KEY ("customRoleId") REFERENCES "workspace_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
