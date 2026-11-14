'use client';

import { IMAGE_MAX_BYTES, LOGO_TYPES } from '@torio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { WorkspaceLogo } from '@/components/workspace-logo';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useRemoveLogo, useRemoveLogoLight } from '../queries';
import { UploadError, uploadFile } from '../upload';

const USES = [
  'The store switcher and your account menu',
  'The top bar of Torio while this store is open',
  'Invoice PDFs, at the top of every invoice',
];

function Tile({
  logo,
  logoLight,
  src,
  dark,
  name,
  onSize,
}: {
  logo: string | null;
  logoLight: string | null;
  src: string | null;
  dark?: boolean;
  name: string;
  onSize?: (w: number, h: number) => void;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[112px] min-w-0 flex-1 items-center justify-center rounded-xl border p-5',
        dark ? 'border-[#2A2B33] bg-[#17181C]' : 'border-line bg-white',
      )}
    >
      <WorkspaceLogo
        name={name}
        logo={logo}
        logoLight={logoLight}
        src={src}
        context="preview"
        tone={dark ? 'dark' : 'light'}
        onLoadSize={onSize}
      />
    </div>
  );
}

/** One picture's upload: choose, validate, send with progress (cancellable), and only then refresh what the app shows. */
function useLogoUpload(path: string) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
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
  const save = async (done: string) => {
    if (!file) return;
    setError('');
    setProgress(0);
    abort.current = new AbortController();
    try {
      await uploadFile(path, file, file.name, setProgress, abort.current.signal);
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      setFile(null);
      toast.success(done);
    } catch (e) {
      // A cancelled or failed upload changes nothing: the saved logo stays as it was.
      setError(e instanceof UploadError || e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };
  const cancel = () => {
    abort.current?.abort();
    setFile(null);
    setError('');
  };
  return { file, preview, error, progress, busy: progress !== null, choose, save, cancel };
}

function Actions({
  up,
  has,
  canEdit,
  label,
  saveLabel,
  done,
  onRemove,
}: {
  up: ReturnType<typeof useLogoUpload>;
  has: boolean;
  canEdit: boolean;
  label: string;
  saveLabel: string;
  done: string;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  if (!canEdit) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          aria-label={label}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            up.choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {up.file ? (
          <>
            <Button type="button" size="sm" loading={up.busy} onClick={() => void up.save(done)}>
              <Upload aria-hidden />{' '}
              {up.busy ? `Uploading ${Math.round((up.progress ?? 0) * 100)}%` : saveLabel}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={up.cancel}>
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
              <ImagePlus aria-hidden /> {has ? 'Replace' : 'Upload'}
            </Button>
            {has && (
              <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
                <Trash2 aria-hidden /> Remove
              </Button>
            )}
          </>
        )}
      </div>
      {up.busy && (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((up.progress ?? 0) * 100)}
          className="h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-wash-2"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${(up.progress ?? 0) * 100}%` }}
          />
        </div>
      )}
      {up.error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {up.error}
        </p>
      )}
    </div>
  );
}

/**
 * The workspace brand logo: workspace-level, never the same record as anyone's profile picture. The server trims empty margins,
 * keeps the proportions and stores one optimised picture, which the whole app then draws through WorkspaceLogo. An optional
 * second logo is used on dark backgrounds.
 */
export function BrandIdentity({
  workspaceId,
  name,
  logo,
  logoLight,
  canEdit,
}: {
  workspaceId: string;
  name: string;
  logo: string | null;
  logoLight: string | null;
  canEdit: boolean;
}) {
  const base = `/api/v1/workspaces/${workspaceId}`;
  const main = useLogoUpload(`${base}/logo`);
  const light = useLogoUpload(`${base}/logo-light`);
  const remove = useRemoveLogo(workspaceId);
  const removeLight = useRemoveLogoLight(workspaceId);
  const [confirm, setConfirm] = useState<'main' | 'light' | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // What each tile shows: a chosen-but-unsaved file wins over what is saved, so the person sees the result before saving.
  const lightTile = light.preview ?? logoLight;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row" aria-label="Logo preview">
        <Tile
          logo={logo}
          logoLight={null}
          src={main.preview}
          name={name}
          onSize={(w, h) => setSize({ w, h })}
        />
        <Tile logo={main.preview ?? logo} logoLight={lightTile} src={null} dark name={name} />
      </div>
      {(logo || main.preview) && size && (
        <p className="m-0 -mt-2 text-xs tabular-nums text-faint">
          {size.w} × {size.h} px · shown at its own proportions, never stretched or cropped
        </p>
      )}
      {canEdit || logo ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-label text-ink">Logo</span>
          <Actions
            up={main}
            has={!!logo}
            canEdit={canEdit}
            label="Choose a brand logo"
            saveLabel="Save logo"
            done="Brand logo saved"
            onRemove={() => setConfirm('main')}
          />
        </div>
      ) : null}
      {!canEdit && (
        <p className="m-0 text-[13px] text-muted">Only an Owner or Admin can change the logo.</p>
      )}
      {canEdit && logo && (
        <div className="flex flex-col gap-1.5">
          <span className="font-label text-ink">Logo for dark backgrounds</span>
          <p className="m-0 text-xs text-muted">
            Only if your logo needs a lighter version to be readable on dark surfaces. Without it,
            your logo is shown as it is.
          </p>
          <Actions
            up={light}
            has={!!logoLight}
            canEdit={canEdit}
            label="Choose a logo for dark backgrounds"
            saveLabel="Save dark-background logo"
            done="Dark-background logo saved"
            onRemove={() => setConfirm('light')}
          />
        </div>
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
        Use a PNG, WebP or SVG with a transparent background if you can, up to 2 MB. Empty margins
        around the artwork are trimmed automatically, and the logo is never stretched or cropped.
        Without a logo, your store&apos;s initials are shown. Torio&apos;s own logo is never
        replaced.
      </p>
      {confirm && (
        <ConfirmDialog
          title={confirm === 'main' ? 'Remove the brand logo?' : 'Remove the dark-background logo?'}
          body={
            confirm === 'main'
              ? 'The logo is deleted from this store and its initials are shown instead, including on new invoices.'
              : 'Your main logo is shown on dark backgrounds instead.'
          }
          confirmLabel="Remove logo"
          busy={remove.isPending || removeLight.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            (confirm === 'main' ? remove : removeLight).mutate(undefined, {
              onSuccess: () => {
                toast.success(
                  confirm === 'main' ? 'Brand logo removed' : 'Dark-background logo removed',
                );
                setConfirm(null);
              },
              onError: (e) => {
                toast.error(e instanceof Error ? e.message : 'Something went wrong');
                setConfirm(null);
              },
            })
          }
        />
      )}
    </div>
  );
}
