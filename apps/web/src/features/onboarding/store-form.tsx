'use client';

import { createStoreSchema, phoneSchema, STORE_INDUSTRIES } from '@torio/contracts';
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlCls } from '@/components/ui/input';
import { SearchSelect } from '@/features/inbox/components/search-select';
import { CurrencySelect, TimeZoneSelect } from '@/features/settings/components/regional';
import { useProfile, useUpdateProfile } from '@/features/settings/queries';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { checkStoreSlug, StoreFormError, useCreateStore } from '@/lib/workspace';
import {
  countryOptions,
  currencyGuess,
  dialFor,
  dialOptions,
  joinPhone,
  localeCountry,
  splitPhone,
  suggestSlug,
  timeZoneGuess,
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

const STEPS = ['Personal information', 'Business information'] as const;

/** Two-step progress: where the person is, and what is done. */
function Progress({ step }: { step: 0 | 1 }) {
  return (
    <ol aria-label="Progress" className="m-0 mb-8 flex list-none items-center gap-3 p-0">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className="flex flex-1 flex-col gap-2"
          >
            <span
              className={cn(
                'h-1 rounded-full transition-colors duration-200 motion-reduce:transition-none',
                done || current ? 'bg-primary' : 'bg-line',
              )}
            />
            <span
              className={cn(
                'text-xs font-semibold',
                current ? 'text-primary' : done ? 'text-ink' : 'text-faint',
              )}
            >
              Step {i + 1} of 2 · {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Store setup in exactly two steps: who you are (saved to the global account), then the business (saved to the new store).
 * Values live in one state, so Back and Continue never lose anything. Used for the mandatory first store and, with
 * `additional`, for Add Store; there the personal step starts from the saved profile and changes it only if edited.
 */
export function StoreForm({ additional }: { additional?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const profile = useProfile().data;
  const saveProfile = useUpdateProfile();
  const create = useCreateStore();
  const [step, setStep] = useState<0 | 1>(0);

  // The form mounts only after sign-in and the profile are known (never during server rendering), so reading the
  // browser's locale here is safe. Every suggestion stays editable.
  const [v, setV] = useState(() => {
    const phone = splitPhone(profile?.phone);
    const c = localeCountry();
    return {
      // personal (global account)
      fullName: profile?.name ?? user?.name ?? '',
      pDial: phone.dial || (c && dialFor(c) ? c : ''),
      pPhone: phone.national,
      pCountry: c,
      // business (this store)
      name: '',
      slug: '',
      industry: '',
      currency: currencyGuess(c),
      tz: timeZoneGuess(c),
      email: profile?.email ?? user?.email ?? '',
      dial: phone.dial || (c && dialFor(c) ? c : ''),
      phone: phone.national,
      country: c,
      addressLine: '',
      city: '',
      state: '',
      postalCode: '',
    };
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [tzEdited, setTzEdited] = useState(false);
  const [bizCountryEdited, setBizCountryEdited] = useState(false);
  const [bizPhoneEdited, setBizPhoneEdited] = useState(false);
  const [checked, setChecked] = useState<{ slug: string; state: SlugState } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const submitting = useRef(false);

  const clear = (k: string) => {
    setErrs((e) => ({ ...e, [k]: '', form: '' }));
    setFormError('');
  };
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => {
    setV((x) => {
      const next = { ...x, [k]: val };
      if (k === 'name' && !slugEdited) next.slug = suggestSlug(val as string);
      // Personal country and phone are only suggestions for the business, until the business fields are edited.
      if (k === 'pCountry') {
        const c = val as string;
        if (!bizCountryEdited) next.country = c;
        if (!currencyEdited) next.currency = currencyGuess(c);
        if (!tzEdited) next.tz = timeZoneGuess(c);
        if (!x.pPhone && dialFor(c)) next.pDial = c;
      }
      if (k === 'country') {
        const c = val as string;
        if (!currencyEdited) next.currency = currencyGuess(c);
        if (!tzEdited) next.tz = timeZoneGuess(c);
        if (!x.phone && dialFor(c)) next.dial = c;
      }
      if (!bizPhoneEdited && (k === 'pPhone' || k === 'pDial')) {
        next.phone = k === 'pPhone' ? (val as string) : x.pPhone;
        next.dial = k === 'pDial' ? (val as string) : x.pDial;
      }
      return next;
    });
    clear(k === 'tz' ? 'reportingTimeZone' : k);
  };

  // Availability: debounced, and an answer for an older value is ignored (the result is keyed by the slug it is for).
  useEffect(() => {
    const s = v.slug.trim();
    if (!s || step !== 1) return;
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
  }, [v.slug, step]);
  const slug: SlugState = !v.slug.trim()
    ? { kind: 'idle' }
    : checked?.slug === v.slug
      ? checked.state
      : { kind: 'checking' };

  const countries = useMemo(() => countryOptions(), []);
  const dials = useMemo(() => dialOptions(), []);
  const industries = useMemo(() => STORE_INDUSTRIES.map((i) => ({ value: i, label: i })), []);
  const host = typeof window === 'undefined' ? 'torio' : window.location.host;

  // ---- step 1 -> 2: validate, then save the global profile only if the person actually changed it
  const next = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    const out: Record<string, string> = {};
    const name = v.fullName.trim();
    if (!name) out.fullName = 'Enter your full name';
    else if (name.length > 100) out.fullName = 'Use 100 characters or fewer';
    const phone = joinPhone(v.pDial, v.pPhone);
    if (phone) {
      const p = phoneSchema.safeParse(phone);
      if (!p.success) out.pPhone = p.error.issues[0]?.message ?? 'Enter a valid phone number';
    }
    if (!v.pCountry) out.pCountry = 'Choose your country';
    if (Object.keys(out).length) {
      setErrs(out);
      setFormError('Check the highlighted fields.');
      return;
    }
    const patch: { name?: string; phone?: string } = {};
    if (name !== (profile?.name ?? '')) patch.name = name;
    if ((phone ?? '') !== (profile?.phone ?? '')) patch.phone = phone ?? '';
    if (Object.keys(patch).length) {
      submitting.current = true;
      try {
        await saveProfile.mutateAsync(patch);
      } catch (err) {
        setFormError((err as Error).message || 'Could not save your details. Try again.');
        return;
      } finally {
        submitting.current = false;
      }
    }
    setErrs({});
    setFormError('');
    setStep(1);
  };

  const body = () => ({
    name: v.name,
    slug: v.slug,
    industry: v.industry,
    defaultCurrency: v.currency,
    reportingTimeZone: v.tz,
    contactEmail: v.email,
    phone: joinPhone(v.dial, v.phone),
    country: v.country,
    addressLine: v.addressLine,
    city: v.city,
    state: v.state,
    postalCode: v.postalCode,
  });

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

  const personal = (
    <form onSubmit={next} noValidate className="flex flex-col gap-6">
      <div>
        <h2 className="m-0 text-xl font-semibold tracking-[-0.01em] text-ink">
          Let&apos;s get to know you
        </h2>
        <p className="m-0 mt-1 text-sm text-muted">
          Tell us a little about yourself before setting up your workspace.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Full name" htmlFor="pf-name" required error={err('fullName')}>
            <input
              id="pf-name"
              className={controlCls}
              autoComplete="name"
              value={v.fullName}
              aria-invalid={!!err('fullName')}
              onChange={(e) => set('fullName', e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Email address"
            htmlFor="pf-email"
            required
            hint={
              profile?.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <BadgeCheck size={13} aria-hidden /> Verified
                </span>
              ) : (
                'This is your sign-in email. It can’t be changed here.'
              )
            }
          >
            <input
              id="pf-email"
              type="email"
              className={controlCls}
              value={profile?.email ?? user?.email ?? ''}
              disabled
              readOnly
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Phone number" htmlFor="pf-phone" error={err('pPhone')}>
            <div className="grid grid-cols-[minmax(0,150px)_1fr] gap-2">
              <SearchSelect
                label="Country code"
                hideLabel
                searchPlaceholder="Search country or code"
                emptyText="No codes."
                options={dials}
                value={v.pDial}
                onChange={(d) => set('pDial', d)}
                anyLabel="Code"
                limit={80}
              />
              <input
                id="pf-phone"
                type="tel"
                inputMode="tel"
                className={controlCls}
                autoComplete="tel-national"
                placeholder="1712 345678"
                value={v.pPhone}
                aria-invalid={!!err('pPhone')}
                onChange={(e) => set('pPhone', e.target.value)}
              />
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Country" htmlFor="pf-country" required error={err('pCountry')}>
            <SearchSelect
              id="pf-country"
              label="Your country"
              hideLabel
              searchPlaceholder="Search countries"
              emptyText="No countries."
              options={countries}
              value={v.pCountry}
              onChange={(c) => set('pCountry', c)}
              anyLabel="Select a country"
              limit={80}
            />
          </Field>
        </div>
      </div>
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
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={saveProfile.isPending} className="h-10 px-5">
          Continue
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </form>
  );

  const business = (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <div>
        <h2 className="m-0 text-xl font-semibold tracking-[-0.01em] text-ink">
          Set up your business
        </h2>
        <p className="m-0 mt-1 text-sm text-muted">
          Configure your store so Torio can personalize your workspace.
        </p>
      </div>
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
          <TimeZoneSelect
            id="st-tz"
            value={v.tz}
            onChange={(z) => {
              setTzEdited(true);
              set('tz', z);
            }}
          />
        </Field>
      </Group>

      <Group title="Contact information">
        <div className="sm:col-span-2">
          <Field label="Business email" htmlFor="st-email" required error={err('contactEmail')}>
            <input
              id="st-email"
              type="email"
              className={controlCls}
              autoComplete="off"
              value={v.email}
              aria-invalid={!!err('contactEmail')}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Business phone" htmlFor="st-phone" error={err('phone')}>
            <div className="grid grid-cols-[minmax(0,150px)_1fr] gap-2">
              <SearchSelect
                label="Business country code"
                hideLabel
                searchPlaceholder="Search country or code"
                emptyText="No codes."
                options={dials}
                value={v.dial}
                onChange={(d) => {
                  setBizPhoneEdited(true);
                  set('dial', d);
                }}
                anyLabel="Code"
                limit={80}
              />
              <input
                id="st-phone"
                type="tel"
                inputMode="tel"
                className={controlCls}
                autoComplete="off"
                placeholder="1712 345678"
                value={v.phone}
                aria-invalid={!!err('phone')}
                onChange={(e) => {
                  setBizPhoneEdited(true);
                  set('phone', e.target.value);
                }}
              />
            </div>
          </Field>
        </div>
      </Group>

      <Group title="Business address">
        <div className="sm:col-span-2">
          <Field label="Country" htmlFor="st-country" required error={err('country')}>
            <SearchSelect
              id="st-country"
              label="Business country"
              hideLabel
              searchPlaceholder="Search countries"
              emptyText="No countries."
              options={countries}
              value={v.country}
              onChange={(c) => {
                setBizCountryEdited(true);
                set('country', c);
              }}
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
              autoComplete="off"
              value={v.addressLine}
              onChange={(e) => set('addressLine', e.target.value)}
            />
          </Field>
        </div>
        <Field label="City" htmlFor="st-city" error={err('city')}>
          <input
            id="st-city"
            className={controlCls}
            autoComplete="off"
            value={v.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>
        <Field label="State / region" htmlFor="st-state" error={err('state')}>
          <input
            id="st-state"
            className={controlCls}
            autoComplete="off"
            value={v.state}
            onChange={(e) => set('state', e.target.value)}
          />
        </Field>
        <Field label="Postal code" htmlFor="st-postal" error={err('postalCode')}>
          <input
            id="st-postal"
            className={controlCls}
            autoComplete="off"
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
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" onClick={() => setStep(0)} disabled={create.isPending}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
        <Button type="submit" loading={create.isPending} className="h-10 px-5">
          Create Store
        </Button>
      </div>
    </form>
  );

  return (
    <div>
      <Progress step={step} />
      {step === 0 ? personal : business}
    </div>
  );
}
