'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function ApiStatus() {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: async () => {
      // 503 still carries a typed readiness body, so read both branches.
      const res = await api.GET('/api/v1/health/ready');
      if (res.data) return res.data;
      throw new Error(`API not ready (HTTP ${res.response.status})`);
    },
  });

  return (
    <div className="rounded-card border border-line bg-white p-5">
      {isPending && <p className="text-sm text-muted">Checking…</p>}
      {error && (
        <div role="alert" className="text-sm text-danger">
          {error.message}
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-3 cursor-pointer font-medium text-primary"
          >
            Retry
          </button>
        </div>
      )}
      {data && (
        <dl className="m-0 grid grid-cols-[120px_1fr] gap-y-2 text-sm" data-testid="api-status">
          <dt className="text-muted">Overall</dt>
          <dd className="m-0 font-semibold">{data.status}</dd>
          {(['database', 'redis'] as const)
            .flatMap((name) => {
              const c = data.checks?.[name];
              return c ? [[name, c] as const] : [];
            })
            .map(([name, c]) => (
              <div key={name} className="contents">
                <dt className="text-muted capitalize">{name}</dt>
                <dd className="m-0">
                  {c.status}
                  {c.latencyMs != null ? ` · ${c.latencyMs}ms` : ''}
                </dd>
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}
