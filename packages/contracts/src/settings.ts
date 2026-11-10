import { z } from 'zod';
import { passwordSchema } from './index';
import { isTimeZone } from './locale';
import { currencyCodeSchema } from './orders';

/** Settings: personal profile and preferences, security (password, sessions), workspace profile, audit log. */

const nullableString = z.string().describe('Text, or null when not set').nullable();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const LANDING_PAGES = ['dashboard', 'inbox', 'leads', 'customers', 'orders'] as const;
export const landingPageSchema = z.enum(LANDING_PAGES);
export const LANDING_HREF: Record<(typeof LANDING_PAGES)[number], string> = {
  dashboard: '/',
  inbox: '/inbox',
  leads: '/leads',
  customers: '/customers',
  orders: '/orders',
};

export const timeZoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine(isTimeZone, 'Choose a valid time zone');

export const profileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
  phone: nullableString,
  jobTitle: nullableString,
  timeZone: nullableString,
  landingPage: landingPageSchema,
});

/** Email, role and workspace membership can’t be changed here; unknown keys are rejected. */
export const updateProfileSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    phone: optionalText(40),
    jobTitle: optionalText(100),
    timeZone: z
      .union([z.literal(''), timeZoneSchema])
      .nullable()
      .optional()
      .transform((v) => (v ? v : v === undefined ? undefined : null)),
    landingPage: landingPageSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const sessionInfoSchema = z.object({
  id: z.uuid(),
  device: z.string(),
  ipAddress: nullableString,
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  current: z.boolean(),
});
export const sessionListSchema = z.object({ data: z.array(sessionInfoSchema) });
export const revokedSchema = z.object({ revoked: z.number().int() });

export const updateWorkspaceSchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Workspace name needs at least 2 characters').max(80).optional(),
    description: optionalText(300),
    defaultCurrency: z
      .union([z.literal(''), currencyCodeSchema])
      .nullable()
      .optional()
      .transform((v) => (v ? v : v === undefined ? undefined : null)),
    reportingTimeZone: timeZoneSchema.optional(),
    contactEmail: z
      .union([z.literal(''), z.email().max(254)])
      .nullable()
      .optional()
      .transform((v) => (v ? v.toLowerCase() : v === undefined ? undefined : null)),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().min(1).max(60).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  action: z.string(),
  description: z.string(),
  entityType: nullableString,
  entityId: nullableString,
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
});
export const auditListSchema = z.object({
  data: z.array(auditEntrySchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const accountExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  profile: profileSchema,
  workspaces: z.array(
    z.object({
      name: z.string(),
      slug: z.string(),
      role: z.enum(['OWNER', 'ADMIN', 'AGENT']),
      status: z.enum(['ACTIVE', 'SUSPENDED']),
      joinedAt: z.iso.datetime(),
    }),
  ),
  signedInDevices: z.array(
    z.object({
      device: z.string(),
      ipAddress: nullableString,
      createdAt: z.iso.datetime(),
      lastActiveAt: z.iso.datetime(),
      current: z.boolean(),
    }),
  ),
});
