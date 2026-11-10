import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social preview card: the name and tagline on Torio's indigo, generated at build time. */
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: '#1C1E54',
        color: 'white',
        padding: 72,
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{SITE.name}</div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 76,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -2,
        }}
      >
        <span>Every Conversation.</span>
        <span style={{ color: '#B9B9F9' }}>One Intelligent Platform.</span>
      </div>
      <div style={{ fontSize: 30, color: '#C9CAF5' }}>
        WhatsApp, Instagram and Messenger in one team inbox.
      </div>
    </div>,
    size,
  );
}
