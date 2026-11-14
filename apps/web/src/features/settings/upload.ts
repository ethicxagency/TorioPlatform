import { getAccessToken, refreshSession } from '@/lib/api';
import { env } from '@/lib/env';

export class UploadError extends Error {}

/**
 * Sends one file as multipart form data with real upload progress (fetch cannot report it). Signs in again once if the access
 * token had expired. Resolves with the JSON the server answers; rejects with the server's own message.
 */
export function uploadFile<T>(
  path: string,
  file: Blob,
  filename: string,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  const send = (token: string | null) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${env.NEXT_PUBLIC_API_URL}${path}`);
      xhr.withCredentials = true;
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () =>
        reject(new UploadError('Could not reach the server. Check your connection and try again.'));
      xhr.ontimeout = () => reject(new UploadError('The upload took too long. Try again.'));
      xhr.timeout = 60_000;
      const form = new FormData();
      form.append('file', file, filename);
      xhr.send(form);
    });
  return (async () => {
    let r = await send(getAccessToken());
    if (r.status === 401) r = await send((await refreshSession())?.accessToken ?? null);
    let json: unknown = null;
    try {
      json = JSON.parse(r.body);
    } catch {
      /* not JSON */
    }
    if (r.status < 200 || r.status >= 300) {
      const j = json as { message?: string | string[]; error?: { message?: string } } | null;
      const m = (Array.isArray(j?.message) ? j?.message[0] : j?.message) ?? j?.error?.message;
      throw new UploadError(
        r.status === 403
          ? 'You do not have permission to change this.'
          : r.status === 413
            ? 'That image is too large.'
            : (m ?? 'The upload failed. Try again.'),
      );
    }
    return json as T;
  })();
}
