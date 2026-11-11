import type { Permission } from '@torio/types';
import {
  Bell,
  CreditCard,
  Receipt,
  Database,
  Plug,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
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
    key: 'general',
    href: '/settings/general',
    title: 'General',
    description: 'Your profile, workspace details and preferences, in one place.',
    icon: SlidersHorizontal,
    group: 'Personal',
    keywords: [
      'profile',
      'name',
      'phone',
      'job title',
      'email',
      'avatar',
      'account',
      'preferences',
      'time zone',
      'timezone',
      'landing page',
      'start page',
      'workspace',
      'workspace name',
      'company',
      'currency',
      'contact email',
      'description',
      'slug',
    ],
  },
  {
    key: 'security',
    href: '/settings/security',
    title: 'Security',
    description: 'Change your password and manage sign-in security.',
    icon: ShieldCheck,
    group: 'Personal',
    keywords: ['password', 'sessions', 'devices', 'sign out', 'two-factor', '2fa', 'login'],
  },
  {
    key: 'notifications',
    href: '/settings/notifications',
    title: 'Notifications',
    description: 'Manage your email and in-app notification preferences.',
    icon: Bell,
    group: 'Personal',
    unavailable: true,
    keywords: ['alerts', 'email', 'push'],
  },
  {
    key: 'teams',
    href: '/team',
    title: 'Teams',
    description: 'Manage people, invitations, teams, roles and permissions.',
    icon: Users,
    group: 'Workspace',
    keywords: ['invite', 'roles', 'permissions', 'teams', 'members', 'owner', 'admin', 'agent'],
  },
  {
    key: 'channels',
    href: '/channels',
    title: 'Channels',
    description: 'Manage WhatsApp, Instagram and Messenger connections.',
    icon: Plug,
    group: 'Workspace',
    keywords: ['whatsapp', 'instagram', 'messenger', 'facebook', 'connect', 'integration'],
  },
  {
    key: 'subscription',
    href: '/billing/subscription',
    title: 'Subscription',
    description: 'Your plan, usage and limits.',
    icon: CreditCard,
    group: 'Workspace',
    needs: 'billing:read',
    keywords: [
      'plan',
      'subscription',
      'usage',
      'limits',
      'upgrade',
      'downgrade',
      'cancel',
      'trial',
    ],
  },
  {
    key: 'billing',
    href: '/billing/invoices',
    title: 'Billing',
    description: 'Invoices, payment methods and billing details.',
    icon: Receipt,
    group: 'Workspace',
    needs: 'billing:read',
    keywords: ['invoice', 'payment', 'card', 'receipt', 'tax', 'vat', 'billing address', 'history'],
  },
  {
    key: 'privacy',
    href: '/settings/privacy',
    title: 'Data & Privacy',
    description: 'Manage your account data and privacy requests.',
    icon: Database,
    group: 'Privacy',
    keywords: ['export', 'download', 'data', 'delete account', 'retention', 'gdpr'],
  },
  {
    key: 'audit',
    href: '/settings/audit',
    title: 'Audit Log',
    description: 'Review important activities and changes in your workspace.',
    icon: ScrollText,
    group: 'Administration',
    needs: 'audit:read',
    keywords: ['history', 'activity', 'changes', 'log', 'audit'],
  },
];

export const GROUPS = ['Personal', 'Workspace', 'Privacy', 'Administration'] as const;

/**
 * Routes that belong to the Settings area. Billing (/billing), Teams (/team) and Channels (/channels) keep their own
 * routes but are listed in the Settings navigation, so Settings stays highlighted while they are open. Everything here is derived from the current URL, never from click state.
 */
export const isSettingsPath = (pathname: string) =>
  pathname === '/settings' ||
  pathname.startsWith('/settings/') ||
  pathname === '/billing' ||
  pathname.startsWith('/billing/') ||
  pathname === '/team' ||
  pathname.startsWith('/team/') ||
  pathname === '/channels' ||
  pathname.startsWith('/channels/');
