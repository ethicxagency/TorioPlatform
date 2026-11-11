'use client';

import { createStoreSchema, STORE_INDUSTRIES } from '@torio/contracts';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { SearchSelect } from '@/features/inbox/components/search-select';
import { CurrencySelect, TimeZoneSelect } from '@/features/settings/components/regional';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { checkStoreSlug, StoreFormError, useCreateStore } from '@/lib/workspace';
import {
  browserTimeZone,
  countryOptions,
  currencyGuess,
  dialFor,
  dialOptions,
  localeCountry,
  suggestSlug,
} from './store-options';

type SlugState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'bad'; reason: string; suggestion: string | null };

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-faint">Optional</span>
        )}
      </label>
      {children}
      {error ? (
        <p role="alert" className="m-0 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="m-0 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <fieldset className="m-0 min-w-0 border-0 p-0">
    <legend className="mb-3 p-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
      {title}
    </legend>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </fieldset>
);

/**
 * Creates a store. Used for the mandatory first store (no way out until one exists) and, with `additional`, for the
 * "Add Store" flow. Validation runs on the same schema the server enforces; the server's answer always wins.
 */
export function StoreForm({ additional }: { additional?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const create = useCreateStore();
  // The form mounts only after sign-in is known (never during server rendering), so reading the browser's locale
  // here is safe. Every suggestion stays editable.
  const [v, setV] = useState(() => {
    const c = localeCountry();
    return {
      name: '',
      slug: '',
      industry: '',
      currency: currencyGuess(c),
      tz: browserTimeZone(),
      email: user?.email ?? '',
      dial: c && dialFor(c) ? c : '',
      phone: '',
      country: c,
      addressLine: '',
      city: '',
      state: '',
      postalCode: '',
    };
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [checked, setChecked] = useState<{ slug: string; state: SlugState } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const submitting = useRef(false);

  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((x) => {
      const next = { ...x, [k]: val };
      if (k === 'name' && !slugEdited) next.slug = suggestSlug(val as string);
      if (k === 'country' && !currencyEdited) next.currency = currencyGuess(val as string);
      if (k === 'country' && !x.phone && dialFor(val as string)) next.dial = val as string;
      return next;
    });
    setErrs((e) => ({ ...e, [k === 'tz' ? 'reportingTimeZone' : k]: '', form: '' }));
    setFormError('');
  };

  // Availability: debounced, and an answer for an older value is ignored (the result is keyed by the slug it is for).
  useEffect(() => {
    const s = v.slug.trim();
    if (!s) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkStoreSlug(s).catch(() => null);
      if (!live || !r) return;
      setChecked({
        slug: v.slug,
        state: r.available
          ? { kind: 'ok' }
          : {
              kind: 'bad',
              // nestjs-zod types a nullable string as string[] in OpenAPI; at runtime it is a string or null.
              reason: r.reason ? String(r.reason) : 'Not available',
              suggestion: r.suggestion ? String(r.suggestion) : null,
            },
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [v.slug]);
  const slug: SlugState = !v.slug.trim()
    ? { kind: 'idle' }
    : checked?.slug === v.slug
      ? checked.state
      : { kind: 'checking' };

  const countries = useMemo(() => countryOptions(), []);
  const dials = useMemo(() => dialOptions(), []);
  const industries = useMemo(() => STORE_INDUSTRIES.map((i) => ({ value: i, label: i })), []);
  const host = typeof window === 'undefined' ? 'torio' : window.location.host;

  const body = () => {
    const digits = v.phone.replace(/[^\d]/g, '').replace(/^0+/, '');
    const dial = dialFor(v.dial);
    return {
      name: v.name,
      slug: v.slug,
      industry: v.industry,
      defaultCurrency: v.currency,
      reportingTimeZone: v.tz,
      contactEmail: v.email,
      phone: digits ? (dial ? `+${dial}${digits}` : `+${digits}`) : null,
      country: v.country,
      addressLine: v.addressLine,
      city: v.city,
      state: v.state,
      postalCode: v.postalCode,
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const parsed = createStoreSchema.safeParse(body());
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
      setErrs(out);
      setFormError('Check the highlighted fields.');
      return;
    }
    if (slug.kind === 'bad') {
      setErrs({ slug: slug.reason });
      return;
    }
    submitting.current = true;
    try {
      await create.mutateAsync(parsed.data);
      // Only after the server has stored it.
      toast.success('Store created successfully.');
      router.replace('/');
    } catch (err) {
      const f = err instanceof StoreFormError ? err : null;
      setErrs(f?.fields ?? {});
      if (f?.status === 409) setErrs({ slug: 'This store address is already taken.' });
      setFormError(f?.message ?? 'Could not create the store. Try again.');
    } finally {
      submitting.current = false;
    }
  };

  const err = (k: string) => errs[k];
  const slugHint =
    slug.kind === 'checking' ? (
      <span className="inline-flex items-center gap-1">
        <Loader2 size={12} className="animate-spin" aria-hidden /> Checking availability…
      </span>
    ) : slug.kind === 'ok' ? (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 size={13} aria-hidden /> Available
      </span>
    ) : slug.kind === 'bad' ? (
      <span className="inline-flex flex-wrap items-center gap-1 text-danger">
        <XCircle size={13} aria-hidden /> {slug.reason}.
        {slug.suggestion && (
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 font-medium text-primary underline"
            onClick={() => {
              setSlugEdited(true);
              set('slug', slug.suggestion!);
            }}
          >
            Use {slug.suggestion}
          </button>
        )}
      </span>
    ) : (
      'Lowercase letters, numbers and hyphens.'
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <Group title="Store information">
        <div className="sm:col-span-2">
          <Field label="Store name" htmlFor="st-name" required error={err('name')}>
            <input
              id="st-name"
              className={controlCls}
              autoComplete="organization"
              placeholder="Digonto Store"
              value={v.name}
              aria-invalid={!!err('name')}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Store URL" htmlFor="st-slug" required error={err('slug')} hint={slugHint}>
            <div className="flex items-stretch">
              <span className="flex items-center rounded-l-[var(--radius-control)] border border-r-0 border-line bg-wash px-2.5 text-[13px] text-muted">
                {host}/
              </span>
              <input
                id="st-slug"
                className={cn(controlCls, 'rounded-l-none')}
                placeholder="digonto-store"
                autoCapitalize="none"
                spellCheck={false}
                value={v.slug}
                aria-invalid={!!err('slug')}
                onChange={(e) => {
                  setSlugEdited(true);
                  set('slug', e.target.value.toLowerCase());
                }}
              />
            </div>
          </Field>
          <p className="m-0 mt-1.5 text-xs text-muted">
            Your store&apos;s unique address in Torio. It identifies the store and can&apos;t be
            changed later.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Field label="Industry" htmlFor="st-industry" required error={err('industry')}>
            <SearchSelect
              id="st-industry"
              label="Industry"
              hideLabel
              searchPlaceholder="Search industries"
              emptyText="No industries."
              options={industries}
              value={v.industry}
              onChange={(x) => set('industry', x)}
              anyLabel="Select an industry"
            />
          </Field>
        </div>
      </Group>

      <Group title="Regional settings">
        <Field label="Currency" htmlFor="st-currency" required error={err('defaultCurrency')}>
          <CurrencySelect
            id="st-currency"
            value={v.currency}
            onChange={(c) => {
              setCurrencyEdited(true);
              set('currency', c);
            }}
          />
        </Field>
        <Field label="Time zone" htmlFor="st-tz" required error={err('reportingTimeZone')}>
          <TimeZoneSelect id="st-tz" value={v.tz} onChange={(z) => set('tz', z)} />
        </Field>
      </Group>

      <Group title="Contact information">
        <div className="sm:col-span-2">
          <Field label="Business email" htmlFor="st-email" required error={err('contactEmail')}>
            <input
              id="st-email"
              type="email"
              className={controlCls}
              autoComplete="email"
              value={v.email}
              aria-invalid={!!err('contactEmail')}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Phone number" htmlFor="st-phone" error={err('phone')}>
            <div className="grid grid-cols-[minmax(0,150px)_1fr] gap-2">
              <SearchSelect
                label="Country code"
                hideLabel
                searchPlaceholder="Search country or code"
                emptyText="No codes."
                options={dials}
                value={v.dial}
                onChange={(d) => set('dial', d)}
                anyLabel="Code"
                limit={80}
              />
              <input
                id="st-phone"
                type="tel"
                inputMode="tel"
                className={controlCls}
                autoComplete="tel-national"
                placeholder="1712 345678"
                value={v.phone}
                aria-invalid={!!err('phone')}
                onChange={(e) => set('phone', e.target.value)}
              />
            </div>
          </Field>
        </div>
      </Group>

      <Group title="Address">
        <div className="sm:col-span-2">
          <Field label="Country" htmlFor="st-country" required error={err('country')}>
            <SearchSelect
              id="st-country"
              label="Country"
              hideLabel
              searchPlaceholder="Search countries"
              emptyText="No countries."
              options={countries}
              value={v.country}
              onChange={(c) => set('country', c)}
              anyLabel="Select a country"
              limit={80}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Street address" htmlFor="st-address" error={err('addressLine')}>
            <input
              id="st-address"
              className={controlCls}
              autoComplete="street-address"
              value={v.addressLine}
              onChange={(e) => set('addressLine', e.target.value)}
            />
          </Field>
        </div>
        <Field label="City" htmlFor="st-city" error={err('city')}>
          <input
            id="st-city"
            className={controlCls}
            autoComplete="address-level2"
            value={v.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>
        <Field label="State / region" htmlFor="st-state" error={err('state')}>
          <input
            id="st-state"
            className={controlCls}
            autoComplete="address-level1"
            value={v.state}
            onChange={(e) => set('state', e.target.value)}
          />
        </Field>
        <Field label="Postal code" htmlFor="st-postal" error={err('postalCode')}>
          <input
            id="st-postal"
            className={controlCls}
            autoComplete="postal-code"
            value={v.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
          />
        </Field>
      </Group>

      {formError && (
        <p
          role="alert"
          className="m-0 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-[#8F2424]"
        >
          {formError}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {additional && (
          <Button variant="outline" onClick={() => router.back()} disabled={create.isPending}>
            Back
          </Button>
        )}
        <Button type="submit" loading={create.isPending} className="h-10 px-5">
          Create Store
        </Button>
      </div>
    </form>
  );
}
