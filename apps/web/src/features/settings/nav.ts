import type { Permission } from '@torio/types';
import {
  Bell,
  Building2,
  FileClock,
  Lock,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface SettingsItem {
  key: string;
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  group: 'Personal' | 'Workspace' | 'Privacy' | 'Administration';
  /** Hidden from the nav and search unless the member has this permission. */
  needs?: Permission;
  /** The page exists but the capability behind it doesn't: it is shown, labelled, and kept out of search. */
  unavailable?: boolean;
  keywords: string[];
}

export const SETTINGS: SettingsItem[] = [
  {
    key: 'profile',
    href: '/settings/profile',
    title: 'My profile',
    description: 'Your name, phone number and job title.',
    icon: UserRound,
    group: 'Personal',
    keywords: ['name', 'phone', 'job title', 'email', 'avatar', 'account'],
  },
  {
    key: 'preferences',
    href: '/settings/preferences',
    title: 'Preferences',
    description: 'Time zone and the page Torio opens after you sign in.',
    icon: SlidersHorizontal,
    group: 'Personal',
    keywords: ['time zone', 'timezone', 'landing page', 'start page', 'default page', 'home'],
  },
  {
    key: 'security',
    href: '/settings/security',
    title: 'Security',
    description: 'Change your password and manage signed-in devices.',
    icon: Lock,
    group: 'Personal',
    keywords: ['password', 'sessions', 'devices', 'sign out', 'two-factor', '2fa', 'login'],
  },
  {
    key: 'notifications',
    href: '/settings/notifications',
    title: 'Notifications',
    description: 'Email and in-app alerts. Delivery isn’t built yet.',
    icon: Bell,
    group: 'Personal',
    unavailable: true,
    keywords: ['alerts', 'email', 'push'],
  },
  {
    key: 'workspace',
    href: '/settings/workspace',
    title: 'Workspace',
    description: 'Workspace name, description, default currency and contact email.',
    icon: Building2,
    group: 'Workspace',
    keywords: ['workspace name', 'company', 'currency', 'contact email', 'description', 'slug'],
  },
  {
    key: 'members',
    href: '/settings/members',
    title: 'Members & access',
    description: 'People, invitations, teams, roles and permissions.',
    icon: Users,
    group: 'Workspace',
    keywords: ['invite', 'roles', 'permissions', 'teams', 'members', 'owner', 'admin', 'agent'],
  },
  {
    key: 'channels',
    href: '/settings/channels',
    title: 'Channels & integrations',
    description: 'WhatsApp, Instagram and Messenger connections.',
    icon: Plug,
    group: 'Workspace',
    keywords: ['whatsapp', 'instagram', 'messenger', 'facebook', 'connect', 'integration'],
  },
  {
    key: 'privacy',
    href: '/settings/privacy',
    title: 'Data & privacy',
    description: 'Download a copy of your own account data.',
    icon: ShieldCheck,
    group: 'Privacy',
    keywords: ['export', 'download', 'data', 'delete account', 'retention', 'gdpr'],
  },
  {
    key: 'audit',
    href: '/settings/audit',
    title: 'Audit log',
    description: 'Who changed what in this workspace.',
    icon: FileClock,
    group: 'Administration',
    needs: 'audit:read',
    keywords: ['history', 'activity', 'changes', 'log', 'audit'],
  },
];

export const GROUPS = ['Personal', 'Workspace', 'Privacy', 'Administration'] as const;

/** Capabilities with no backing implementation. Listed for transparency; never searchable or togglable. */
export const NOT_AVAILABLE = [
  { title: 'Two-factor authentication', note: 'Sign-in uses a password only.' },
  { title: 'Sign-in history', note: 'Failed and successful logins aren’t recorded for display.' },
  { title: 'Workspace logo and avatars', note: 'There is no file storage yet.' },
  { title: 'Billing & subscription', note: 'Torio has no billing system.' },
  { title: 'Conversation preferences', note: 'No workspace-level Inbox rules exist yet.' },
  { title: 'Account deletion', note: 'Not implemented.' },
];
