import { PERMISSIONS, ROLE_PERMISSIONS, type Permission, type WorkspaceRole } from '@torio/types';
import { Check, Minus } from 'lucide-react';
import { ROLE_INFO } from '../types';

const LABEL: Record<Permission, string> = {
  'workspace:read': 'View workspace',
  'workspace:update': 'Edit workspace settings',
  'workspace:delete': 'Delete workspace',
  'members:read': 'View members',
  'members:manage': 'Invite and manage members',
  'conversations:read': 'Read conversations',
  'conversations:reply': 'Reply to customers',
  'conversations:manage': 'Assign, snooze, resolve',
  'customers:read': 'View customers',
  'customers:update': 'Edit customers',
  'customers:delete': 'Delete customers',
  'savedreplies:manage': 'Manage saved replies',
  'leads:read': 'View leads',
  'leads:write': 'Create and edit leads',
  'leads:delete': 'Delete leads',
  'brain:read': 'View Brain',
  'brain:write': 'Edit Brain',
  'channels:read': 'View channels',
  'channels:manage': 'Manage channels',
  'orders:read': 'View orders',
  'orders:write': 'Create and update orders',
  'orders:payments': 'Record order payments',
  'automation:read': 'View automations and runs',
  'automation:write': 'Create, edit and test automations',
  'automation:activate': 'Activate, delete and retry automations',
  'audit:read': 'View audit history',
};
const ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN', 'AGENT'];

/** Read-only: roles are fixed in Torio, so this shows them as they are enforced by the API rather than a misleading editor. */
export function RolesTab() {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-muted">
        Torio uses three fixed workspace roles. Permissions are enforced by the server on every
        request. Custom roles aren&apos;t supported yet.
      </p>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[460px] border-collapse text-[13px]">
          <caption className="sr-only">Role permissions</caption>
          <thead className="border-b border-line-subtle bg-[#FBFBFC]">
            <tr>
              <th
                scope="col"
                className="px-4 py-2.5 text-left text-[11.5px] font-medium text-faint"
              >
                Capability
              </th>
              {ROLES.map((r) => (
                <th
                  key={r}
                  scope="col"
                  className="px-3 py-2.5 text-center text-[11.5px] font-medium text-faint"
                  title={ROLE_INFO[r].description}
                >
                  {ROLE_INFO[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  {LABEL[p]}
                </th>
                {ROLES.map((r) => (
                  <td key={r} className="px-3 py-2 text-center">
                    {ROLE_PERMISSIONS[r].has(p) ? (
                      <span className="inline-flex" title="Allowed">
                        <Check size={15} className="text-success" aria-label="Allowed" />
                      </span>
                    ) : (
                      <span className="inline-flex" title="Not allowed">
                        <Minus size={15} className="text-faint" aria-label="Not allowed" />
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] text-muted">
        {ROLES.map((r) => (
          <li key={r}>
            <b className="text-ink">{ROLE_INFO[r].label}:</b> {ROLE_INFO[r].description}
          </li>
        ))}
      </ul>
    </div>
  );
}
