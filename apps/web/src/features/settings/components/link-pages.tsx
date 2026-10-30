'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/workspace';
import { Notice, PageHeader, Section } from './bits';

function LinkRow({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 no-underline hover:bg-wash hover:no-underline"
    >
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
      <ArrowUpRight size={15} className="shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

/** Members, invitations, teams and roles live on the Team page; this page links there instead of duplicating them. */
export function MembersPage() {
  const { role, can } = useWorkspace();
  return (
    <div>
      <PageHeader
        title="Members & access"
        description="People, invitations, teams, roles and permissions."
      />
      <Section title="Manage access">
        <div className="grid gap-2.5">
          <LinkRow
            href="/team"
            title="Members & invitations"
            text="Invite people, change roles and suspend access."
          />
          <LinkRow href="/team" title="Teams" text="Group members and assign a team lead." />
          <LinkRow
            href="/team"
            title="Roles & permissions"
            text="See what Owner, Admin and Agent can do."
          />
        </div>
        <div className="mt-4">
          <Notice>
            You are {role?.toLowerCase() ?? 'a member'}.{' '}
            {can('members:manage')
              ? 'You can invite members and manage roles below your own.'
              : 'Only Owners and Admins can change who has access.'}{' '}
            The workspace Owner can never be removed or demoted, and nobody can change their own
            role.
          </Notice>
        </div>
      </Section>
    </div>
  );
}

export function ChannelsSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Channels & integrations"
        description="Messaging connections for this workspace."
      />
      <Section title="Channels">
        <LinkRow
          href="/channels"
          title="Open Channels"
          text="See each channel’s status, defaults and conversation counts."
        />
      </Section>
      <Section title="Integrations">
        <Notice>
          WhatsApp, Instagram and Messenger can’t be connected yet because the provider connection
          isn’t built. No other integrations exist, so no tokens or secrets are managed here.
        </Notice>
      </Section>
    </div>
  );
}
