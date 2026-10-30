'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Torio hit an unexpected error</h1>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 0,
            background: '#5B5CE2',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
