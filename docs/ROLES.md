# Roles and permissions

## How authorization works

Every API request that names a workspace goes through `AuthorizationService.assertPermission`, which loads the member's
membership and checks the permission key against the member's **effective permissions**:

- a member with no custom role has exactly the permissions of their system role (`OWNER`, `ADMIN`, `AGENT`, defined in
  `@torio/types`). Nothing changed for existing members: `workspace_memberships.customRoleId` is null for all of them;
- a member with a custom role has exactly that role's stored permission list (the system role is not added on top).

The web app reads the same list from `GET /workspaces` (`permissions`) only to hide controls; the API re-checks every request.

## Custom roles

A custom role is a row in `workspace_roles` (workspace-scoped, unique name per workspace ignoring case) holding stable permission keys
in `permissions`. A member holds one through `customRoleId`; their `role` column stays `AGENT`, so every rule written for system roles
(owner protection, who may manage whom) keeps applying to them.

Rules enforced on the server (`RolesService`, `TeamService.updateMember`):

- Only keys in `PERMISSIONS` are accepted; the Owner-only keys (`workspace:delete`, `roles:manage`) can never be in a role; `workspace:read`
  is always added.
- Creating, editing, duplicating and deleting roles needs `roles:manage`, which only the Owner holds and no role can carry.
- Nobody can put a permission in a role, or give a role to someone, that they do not hold themselves.
- The Owner cannot be given a role, nobody can change their own role, an Admin cannot manage another Admin, and a member holding a custom role
  (even with `members:manage`) cannot manage Admins or the Owner.
- A role from another workspace does not exist for you (404); non-members get 404 for the whole roles API.
- Deleting a role that has members requires `reassignTo` (ADMIN, AGENT or another custom role the actor may give).
- Changes take effect on the next request: the permission list is read from the database on every call.

Audit actions (entity type `role` or `membership`): `role.create`, `role.update` (with `added` / `removed`), `role.delete`,
`member.role_change` (from / to). No secrets are logged.

## Templates

`ROLE_TEMPLATES` in `@torio/types` are lists of the permission keys above (Workspace Administrator, Operations Manager, Customer Support,
Sales Manager, Sales Representative, Read Only, Custom Setup). They are starting points only: choosing one fills the builder, and what is
saved is the permission list. A test checks that every template uses real, grantable keys.

## What the spec asked for that the API does not enforce separately (so it is not offered)

The permission list shows only what the API really enforces. These requested capabilities do not have their own permission today:

| Requested                                        | Today                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Invite members vs manage members, manage teams   | one key, `members:manage`                                                                        |
| Snooze / resolve / assign / delete conversations | assign, snooze and resolve share `conversations:manage`; deleting conversations is not a feature |
| Create vs edit customers                         | `customers:update` covers both                                                                   |
| Create / update orders, manage fulfilment        | `orders:write` covers all three                                                                  |
| Connect vs disconnect vs configure channels      | one key, `channels:manage`                                                                       |
| Test automations                                 | part of `automation:write`                                                                       |
| Manage AI configuration, use AI Assist           | AI Assist uses `conversations:reply`; AI configuration is platform-level (Super Admin)           |
| View invoices, usage                             | part of `billing:read`                                                                           |
| Manage security settings                         | not a workspace permission                                                                       |
| "View assigned leads only", per-owner scoping    | not enforced: lead and customer visibility is workspace-wide                                     |

Splitting a key later is a deliberate, tested change (every guard using it must be updated).

## Migration

`20261125000000_custom_roles` is additive (new table, one nullable column with a foreign key). It changes no existing row. Apply it with
`pnpm db:migrate` locally and `pnpm db:deploy` for production, as for any migration.
