import type { Metadata } from 'next';
import { ApiStatus } from './api-status';

export const metadata: Metadata = { title: 'API status' };

export default function StatusPage() {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-8">
      <h1 className="m-0 text-2xl font-semibold tracking-[-0.015em]">API status</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Live readiness from the Torio API, fetched through the generated typed client.
      </p>
      <ApiStatus />
    </div>
  );
}
