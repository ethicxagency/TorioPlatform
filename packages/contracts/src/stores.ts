import { z } from 'zod';
import { isTimeZone } from './locale';
import { currencyCodeSchema } from './orders';

/**
 * A "store" is a workspace: one independently managed business under a person's single Torio account.
 * These are the fields collected at store setup and edited later in Settings → General. They are the same columns
 * on the same record, never two copies: currency = defaultCurrency, email = contactEmail, timezone = reportingTimeZone.
 */

export const STORE_INDUSTRIES = [
  'Fashion & Apparel',
  'Beauty & Cosmetics',
  'Electronics & Technology',
  'Food & Beverage',
  'Health & Wellness',
  'Travel & Tourism',
  'Home & Lifestyle',
  'Education',
  'Digital Products',
  'Other',
] as const;

/** ISO 3166-1 alpha-2 country codes. Names come from the runtime's Intl.DisplayNames, never hand-translated. */
export const COUNTRY_CODES =
  'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(
    ' ',
  );

/** International calling codes offered in the phone selector (the common ones; the number is validated as E.164). */
export const DIAL_CODES: { code: string; dial: string }[] = [
  ['BD', '880'],
  ['US', '1'],
  ['CA', '1'],
  ['GB', '44'],
  ['IN', '91'],
  ['PK', '92'],
  ['AE', '971'],
  ['SA', '966'],
  ['QA', '974'],
  ['KW', '965'],
  ['OM', '968'],
  ['BH', '973'],
  ['MY', '60'],
  ['SG', '65'],
  ['ID', '62'],
  ['TH', '66'],
  ['VN', '84'],
  ['PH', '63'],
  ['LK', '94'],
  ['NP', '977'],
  ['CN', '86'],
  ['HK', '852'],
  ['JP', '81'],
  ['KR', '82'],
  ['AU', '61'],
  ['NZ', '64'],
  ['DE', '49'],
  ['FR', '33'],
  ['IT', '39'],
  ['ES', '34'],
  ['NL', '31'],
  ['BE', '32'],
  ['CH', '41'],
  ['AT', '43'],
  ['SE', '46'],
  ['NO', '47'],
  ['DK', '45'],
  ['FI', '358'],
  ['IE', '353'],
  ['PT', '351'],
  ['PL', '48'],
  ['TR', '90'],
  ['RU', '7'],
  ['UA', '380'],
  ['EG', '20'],
  ['NG', '234'],
  ['KE', '254'],
  ['ZA', '27'],
  ['GH', '233'],
  ['MA', '212'],
  ['BR', '55'],
  ['MX', '52'],
  ['AR', '54'],
  ['CO', '57'],
  ['CL', '56'],
  ['IL', '972'],
  ['JO', '962'],
  ['LB', '961'],
  ['IQ', '964'],
  ['MV', '960'],
].map(([code, dial]) => ({ code: code!, dial: dial! }));

export const SLUG_MIN = 3;
export const SLUG_MAX = 48;
/** Names that would collide with the app's own routes or read as official Torio pages. */
export const RESERVED_SLUGS = [
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'dashboard',
  'help',
  'inbox',
  'login',
  'logout',
  'onboarding',
  'privacy',
  'privacy-policy',
  'settings',
  'signup',
  'store',
  'stores',
  'support',
  'torio',
  'welcome',
];

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN, `Use at least ${SLUG_MIN} characters`)
  .max(SLUG_MAX)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .refine((v) => !RESERVED_SLUGS.includes(v), 'This address is reserved');

/** International format: "+" and 7 to 15 digits (E.164). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Enter the number in international format, e.g. +8801712345678');

const optionalField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const emailField = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.toLowerCase());
const country = z.enum(COUNTRY_CODES as [string, ...string[]], 'Choose a country');
const industry = z.enum(STORE_INDUSTRIES, 'Choose an industry');

/** Everything needed to create a store. Required: name, URL, industry, currency, time zone, email, country. */
export const createStoreSchema = z.strictObject({
  name: z.string().trim().min(2, 'Store name needs at least 2 characters').max(80),
  slug: storeSlugSchema,
  industry,
  defaultCurrency: currencyCodeSchema,
  reportingTimeZone: z.string().trim().max(64).refine(isTimeZone, 'Choose a valid time zone'),
  contactEmail: emailField,
  phone: phoneSchema
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  country,
  addressLine: optionalField(200),
  city: optionalField(100),
  state: optionalField(100),
  postalCode: optionalField(20),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const storeSlugCheckQuerySchema = z.object({
  slug: z.string().trim().toLowerCase().max(80),
});
export const storeSlugCheckSchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  /** Why it is not available, in words fit to show. */
  reason: z.string().nullable(),
  suggestion: z.string().nullable(),
});

export const setActiveWorkspaceSchema = z.strictObject({ workspaceId: z.uuid() });
