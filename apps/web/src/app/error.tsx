'use client';

import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center"
      role="alert"
    >
      <h1 className="m-0 font-page-title">Something went wrong</h1>
      <p className="m-0 max-w-sm text-sm text-muted">
        An unexpected error occurred. Your data isn&apos;t affected.
        {error.digest && ` Reference: ${error.digest}`}
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
