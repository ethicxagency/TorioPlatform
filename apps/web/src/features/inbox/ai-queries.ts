'use client';

import { useQuery } from '@tanstack/react-query';
import type { AI_PHASES, AiMode } from '@torio/contracts';
import { getAccessToken, refreshSession } from '@/lib/api';
import { env } from '@/lib/env';

export interface AiOptions {
  available: boolean;
  reason: string | null;
  usage: {
    requests: number;
    requestLimit: number | null;
    tokens: number;
    tokenLimit: number | null;
  } | null;
  modes: { mode: AiMode; label: string; available: boolean; reason: string | null }[];
  recommended: AiMode | null;
}
export interface AiDraft {
  requestId: string;
  draft: string;
  mode: AiMode;
  strategy: string;
  providers: string[];
  durationMs: number;
  needsReview: boolean;
  warnings: string[];
  qualityScore: number | null;
}
export type AiPhaseName = (typeof AI_PHASES)[number];

class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Authenticated call to the AI endpoints. Errors carry the server's safe message. */
export async function aiRequest<T>(
  ws: string,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  const url = `${env.NEXT_PUBLIC_API_URL}/api/v1/workspaces/${ws}/ai${path}`;
  const go = (t: string | null) =>
    fetch(url, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(init?.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(t && { Authorization: `Bearer ${t}` }),
      },
      ...(init?.body !== undefined && { body: JSON.stringify(init.body) }),
    });
  let res = await go(getAccessToken());
  if (res.status === 401) res = await go((await refreshSession())?.accessToken ?? null);
  if (!res.ok) {
    let msg = '';
    try {
      const j = (await res.json()) as { message?: string | string[]; error?: { message?: string } };
      msg = (Array.isArray(j.message) ? j.message[0] : j.message) ?? j.error?.message ?? '';
    } catch {
      /* not JSON */
    }
    throw new AiError(
      res.status === 403
        ? 'You do not have permission to use AI Assist.'
        : msg || 'AI Assist is unavailable right now.',
      res.status,
    );
  }
  return (await res.json()) as T;
}

export const useAiOptions = (ws: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ['ai-options', ws],
    enabled: !!ws && enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: () => aiRequest<AiOptions>(ws!, '/options'),
  });

export const requestPhase = (ws: string, requestId: string) =>
  aiRequest<{ phase: AiPhaseName; status: 'running' | 'succeeded' | 'failed' }>(
    ws,
    `/requests/${requestId}/phase`,
  );

export const requestDraft = (
  ws: string,
  conversationId: string,
  body: { requestId: string; mode: AiMode; refine?: string; previousDraft?: string },
) => aiRequest<AiDraft>(ws, `/conversations/${conversationId}/draft`, { method: 'POST', body });

/** Brain "Test AI": asks the real engine about the Brain being edited and the test chat. */
export const requestBrainTest = (
  ws: string,
  body: {
    requestId: string;
    mode: AiMode;
    config: unknown;
    lines: { from: 'customer' | 'agent'; text: string }[];
  },
) => aiRequest<AiDraft>(ws, '/test', { method: 'POST', body });
