/** Meta channel credentials are stored encrypted as JSON: the Page access token and the Page id used for sending. */
export interface MetaCredential {
  token: string;
  pageId: string;
}
export const packCredential = (c: MetaCredential) => JSON.stringify({ t: c.token, p: c.pageId });
export function unpackCredential(plain: string): MetaCredential | null {
  try {
    const j = JSON.parse(plain) as { t?: string; p?: string };
    return j.t && j.p ? { token: j.t, pageId: j.p } : null;
  } catch {
    return null;
  }
}
