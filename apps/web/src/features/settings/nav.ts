import type { Permission } from '@torio/types';
import {
  Bell,
  Building2,
  CreditCard,
  FileClock,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Shield,
  UsersRound,
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
    description: 'Manage people, invitations, teams, roles and permissions.',
    icon: UsersRound,
    group: 'Workspace',
    keywords: ['invite', 'roles', 'permissions', 'teams', 'members', 'owner', 'admin', 'agent'],
  },
  {
    key: 'channels',
    href: '/settings/channels',
    title: 'Channels & integrations',
    description: 'Manage WhatsApp, Instagram and Messenger connections.',
    icon: Plug,
    group: 'Workspace',
    keywords: ['whatsapp', 'instagram', 'messenger', 'facebook', 'connect', 'integration'],
  },
  {
    key: 'billing',
    href: '/billing',
    title: 'Billing & subscriptions',
    description: 'Manage plans, usage, payment methods, invoices and billing details.',
    icon: CreditCard,
    group: 'Workspace',
    needs: 'billing:read',
    keywords: [
      'plan',
      'subscription',
      'invoice',
      'payment',
      'card',
      'usage',
      'limits',
      'upgrade',
      'cancel',
    ],
  },
  {
    key: 'privacy',
    href: '/settings/privacy',
    title: 'Data & privacy',
    description: 'Manage your account data and privacy requests.',
    icon: Shield,
    group: 'Privacy',
    keywords: ['export', 'download', 'data', 'delete account', 'retention', 'gdpr'],
  },
  {
    key: 'audit',
    href: '/settings/audit',
    title: 'Audit log',
    description: 'Review important activities and changes in your workspace.',
    icon: FileClock,
    group: 'Administration',
    needs: 'audit:read',
    keywords: ['history', 'activity', 'changes', 'log', 'audit'],
  },
];

export const GROUPS = ['Personal', 'Workspace', 'Privacy', 'Administration'] as const;

/**
 * Routes that belong to the Settings area. Billing lives at /billing but is listed in the Settings navigation, so it
 * keeps the two-level layout. Everything here is derived from the current URL, never from click state.
 */
export const isSettingsPath = (pathname: string) =>
  pathname === '/settings' ||
  pathname.startsWith('/settings/') ||
  pathname === '/billing' ||
  pathname.startsWith('/billing/');
