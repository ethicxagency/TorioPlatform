import type { ApiSchemas } from '@torio/api-client';

export type Member = ApiSchemas['MemberListDto']['data'][number];
export type MemberDetail = ApiSchemas['MemberDetailDto'];
export type TeamSummary = ApiSchemas['TeamSummaryDto'];
export type Invitation = ApiSchemas['InvitationListDto']['data'][number];
export type InvitationCreated = ApiSchemas['InvitationCreatedDto'];
export type TeamItem = ApiSchemas['TeamListDto']['data'][number];
export type MemberActivity = ApiSchemas['MemberActivityDto']['data'][number];
export type Role = Member['role'];

export interface MemberFilters {
  q: string;
  role: '' | Role;
  status: '' | Member['status'];
  team: string;
}
export const EMPTY_MEMBER_FILTERS: MemberFilters = { q: '', role: '', status: '', team: '' };

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  OWNER: {
    label: 'Owner',
    description:
      'Full control of the workspace. The owner role is fixed and cannot be changed or removed.',
  },
  ADMIN: {
    label: 'Admin',
    description:
      'Manages members, invitations, teams, saved replies and audit logs. Cannot delete the workspace or manage other admins.',
  },
  AGENT: {
    label: 'Agent',
    description:
      'Works the Inbox, leads and customers. Cannot manage members or workspace settings.',
  },
};
