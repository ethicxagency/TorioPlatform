import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const alt = 'Torio Brain: Your Business. Understood.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social preview card for the Torio Brain page, generated at build time. */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #0E0F2E 0%, #2A2A8F 100%)',
        color: 'white',
        padding: 72,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 6, color: '#A9A8FF' }}>
        TORIO BRAIN
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 92,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: -3,
        }}
      >
        <span>Your Business.</span>
        <span style={{ color: '#B9AEFF' }}>Understood.</span>
      </div>
      <div style={{ fontSize: 30, color: '#C9CAF5' }}>
        {`${SITE.name}: business knowledge, brand voice and rules behind your AI replies.`}
      </div>
    </div>,
    size,
  );
}
