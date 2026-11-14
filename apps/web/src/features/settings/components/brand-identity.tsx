'use client';

import { IMAGE_MAX_BYTES, LOGO_TYPES } from '@torio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { initialsOf } from '@/features/inbox/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useRemoveLogo } from '../queries';
import { UploadError, uploadFile } from '../upload';

const USES = [
  'The store switcher and your account menu',
  'The top bar of Torio while this store is open',
  'Invoice PDFs, at the top of every invoice',
];

function Tile({ src, dark, name }: { src: string | null; dark?: boolean; name: string }) {
  return (
    <div
      className={cn(
        'flex h-[92px] min-w-0 flex-1 items-center justify-center rounded-xl border px-4',
        dark ? 'border-[#2A2B33] bg-[#17181C]' : 'border-line bg-white',
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the logo is served by the API; a chosen file is previewed locally
        <img
          src={src}
          alt={dark ? 'Logo on a dark background' : 'Logo on a light background'}
          className="max-h-[56px] max-w-full object-contain"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl text-base font-semibold',
            dark ? 'bg-white/10 text-white' : 'bg-primary-soft text-primary',
          )}
        >
          {initialsOf(name)}
        </span>
      )}
    </div>
  );
}

/**
 * The workspace brand logo: workspace-level, never the same record as anyone's profile picture. Saving it updates the store
 * switcher, the top bar and invoices (after saving, the shared store list is refreshed so open pages pick it up at once).
 */
export function BrandIdentity({
  workspaceId,
  name,
  logo,
  canEdit,
}: {
  workspaceId: string;
  name: string;
  logo: string | null;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const remove = useRemoveLogo(workspaceId);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const busy = progress !== null;

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const choose = (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (!(LOGO_TYPES as readonly string[]).includes(f.type))
      return setError('Use a PNG, JPG, WebP or SVG image.');
    if (f.size > IMAGE_MAX_BYTES) return setError('That image is larger than 2 MB.');
    setFile(f);
  };

  const save = async () => {
    if (!file) return;
    setError('');
    setProgress(0);
    try {
      await uploadFile(`/api/v1/workspaces/${workspaceId}/logo`, file, file.name, setProgress);
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      setFile(null);
      toast.success('Brand logo saved');
    } catch (e) {
      setError(e instanceof UploadError || e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setProgress(null);
    }
  };

  const shown = preview ?? logo;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row" aria-label="Logo preview">
        <Tile src={shown} name={name} />
        <Tile src={shown} name={name} dark />
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Choose a brand logo"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {file ? (
            <>
              <Button type="button" size="sm" loading={busy} onClick={() => void save()}>
                <Upload aria-hidden />{' '}
                {busy ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : 'Save logo'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setError('');
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => input.current?.click()}
              >
                <ImagePlus aria-hidden /> {logo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {logo && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                  <Trash2 aria-hidden /> Remove
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-muted">Only an Owner or Admin can change the logo.</p>
      )}
      {busy && (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((progress ?? 0) * 100)}
          className="h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-wash-2"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${(progress ?? 0) * 100}%` }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-muted">
        <li className="font-medium text-ink">Where it appears</li>
        {USES.map((u) => (
          <li key={u} className="flex items-center gap-2">
            <span aria-hidden className="h-1 w-1 rounded-full bg-faint" />
            {u}
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-faint">
        Use a PNG, WebP or SVG with a transparent background if you can. A wide logo around 400 ×
        120 px or a square one around 512 × 512 px works well, up to 2 MB. Without a logo, your
        store&apos;s initials are shown. Torio&apos;s own logo is never replaced.
      </p>
      {confirm && (
        <ConfirmDialog
          title="Remove the brand logo?"
          body="The logo is deleted from this store and its initials are shown instead, including on new invoices."
          confirmLabel="Remove logo"
          busy={remove.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                toast.success('Brand logo removed');
                setConfirm(false);
              },
              onError: (e) => {
                toast.error(e instanceof Error ? e.message : 'Something went wrong');
                setConfirm(false);
              },
            })
          }
        />
      )}
    </div>
  );
}
