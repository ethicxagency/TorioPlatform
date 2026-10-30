import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="m-0 text-xl font-semibold">Page not found</h1>
      <p className="m-0 text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/">Back to dashboard</Link>
    </main>
  );
}
