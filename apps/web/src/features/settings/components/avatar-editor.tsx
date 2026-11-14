'use client';

import { AVATAR_TYPES } from '@torio/contracts';
import { Camera, ImageOff, RotateCcw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/features/inbox/components/confirm-dialog';
import { initialsOf } from '@/features/inbox/format';
import { toast } from '@/lib/toast';
import { useAvatarActions, type Profile } from '../queries';
import { UploadError, uploadFile } from '../upload';
import { ImageCropDialog } from './image-crop-dialog';

const MAX_INPUT = 20 * 1024 * 1024;

/**
 * The personal profile picture: upload, reposition, replace, remove, or go back to the Google or Facebook picture. A picture the
 * person uploads wins, and later social sign-ins do not replace it. Nothing here touches the workspace logo.
 */
export function AvatarEditor({ profile, name }: { profile: Profile; name: string }) {
  const actions = useAvatarActions();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const src = profile.imageSource;
  const providerName =
    profile.providers.length === 1
      ? profile.providers[0] === 'GOOGLE'
        ? 'Google'
        : 'Facebook'
      : 'your sign-in provider';

  const choose = (f: File | undefined) => {
    setFileError('');
    if (!f) return;
    if (!(AVATAR_TYPES as readonly string[]).includes(f.type))
      return setFileError('Use a PNG, JPG or WebP image.');
    if (f.size > MAX_INPUT) return setFileError('That image is larger than 20 MB.');
    setError('');
    setFile(f);
  };

  const upload = async (blob: Blob) => {
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const p = await uploadFile<Profile>(
        '/api/v1/users/me/avatar',
        blob,
        'avatar.webp',
        setProgress,
      );
      actions.uploaded(p);
      setFile(null);
      toast.success('Profile picture updated');
    } catch (e) {
      setError(e instanceof UploadError || e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const run = (m: typeof actions.remove | typeof actions.useProvider, ok: string) =>
    m.mutate(undefined, {
      onSuccess: () => toast.success(ok),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Something went wrong'),
    });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span
        aria-hidden
        className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xl font-semibold text-white shadow-[0_0_0_3px_#fff,0_0_0_4px_var(--color-line)]"
      >
        {profile.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- the picture is served by the API or the sign-in provider
          <img
            src={profile.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          initialsOf(name)
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Choose a profile picture"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
            <Camera aria-hidden /> {src === 'CUSTOM' ? 'Replace picture' : 'Upload picture'}
          </Button>
          {src === 'CUSTOM' && profile.hasProviderImage && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={actions.useProvider.isPending}
              onClick={() => run(actions.useProvider, 'Using your sign-in picture')}
            >
              <RotateCcw aria-hidden /> Use {providerName} picture
            </Button>
          )}
          {src === 'NONE' && profile.hasProviderImage && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={actions.useProvider.isPending}
              onClick={() => run(actions.useProvider, 'Using your sign-in picture')}
            >
              <RotateCcw aria-hidden /> Restore {providerName} picture
            </Button>
          )}
          {profile.image && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
              <Trash2 aria-hidden /> Remove
            </Button>
          )}
        </div>
        <p className="m-0 flex items-center gap-1.5 text-xs text-muted">
          <ImageOff size={12} aria-hidden className="shrink-0" />
          {src === 'CUSTOM'
            ? 'Your own picture. Sign-ins will not replace it.'
            : src === 'PROVIDER'
              ? `From ${providerName}. Upload your own to replace it.`
              : src === 'NONE'
                ? 'No picture. Your initials are shown.'
                : 'PNG, JPG or WebP. Your initials are shown until you add one.'}
        </p>
        {fileError && (
          <p role="alert" className="m-0 text-xs text-danger">
            {fileError}
          </p>
        )}
      </div>
      {file && (
        <ImageCropDialog
          file={file}
          busy={busy}
          progress={progress}
          error={error}
          onCancel={() => setFile(null)}
          onConfirm={(b) => void upload(b)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Remove your profile picture?"
          body={
            src === 'CUSTOM'
              ? 'Your uploaded picture is deleted and your initials are shown. You can upload another any time.'
              : 'Your initials are shown instead. Signing in again will not bring the picture back until you restore it.'
          }
          confirmLabel="Remove picture"
          busy={actions.remove.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            actions.remove.mutate(undefined, {
              onSuccess: () => {
                toast.success('Profile picture removed');
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
