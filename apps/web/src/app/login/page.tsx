import type { Metadata } from 'next';
import { ChannelIcon } from '@/components/channel-icon';
import { TorioLogo } from '@/components/shell/torio-logo';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Split-screen sign-in: the form on the left, a Torio brand panel on the right (hidden on phones). The panel shows a
 * brand message over the brand mesh; no testimonial or photo is shown because none is verified or licensed.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-canvas px-4 pb-10 pt-8 sm:pt-12">
      <TorioLogo className="h-11 w-auto shrink-0 object-contain" />
      <div className="mt-8 grid w-full max-w-[1050px] overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_1px_2px_rgba(0,55,112,0.04),0_24px_48px_-12px_rgba(0,55,112,0.12)] md:min-h-[640px] md:grid-cols-2">
        <section className="flex flex-col justify-center px-6 py-10 sm:px-12 sm:py-12">
          <div className="mx-auto w-full max-w-[400px]">
            <h1 className="m-0 text-[30px] font-bold leading-tight tracking-[-0.025em] text-ink">
              Welcome Back
            </h1>
            <p className="m-0 mt-2 text-[15px] text-muted">
              Sign in to your Torio account to continue.
            </p>
            <div className="mt-8">
              <LoginForm />
            </div>
            <p className="m-0 mt-8 text-center text-[12.5px] text-faint">
              New to Torio? Ask your workspace owner for an invitation.
            </p>
          </div>
        </section>

        <aside
          aria-label="About Torio"
          className="relative isolate hidden overflow-hidden bg-[#1C1E54] md:block"
        >
          {/* Brand mesh (DESIGN.md "Brand moments only"): blurred colour fields in Torio's palette, dark where text sits. */}
          <svg
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full"
            viewBox="0 0 500 640"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <filter id="mesh-blur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="60" />
              </filter>
              <linearGradient id="mesh-shade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.35" stopColor="#1C1E54" stopOpacity="0" />
                <stop offset="1" stopColor="#13143D" stopOpacity="0.92" />
              </linearGradient>
            </defs>
            <rect width="500" height="640" fill="#2B2C8C" />
            <g filter="url(#mesh-blur)">
              <ellipse cx="420" cy="40" rx="220" ry="150" fill="#F5E9D4" opacity="0.85" />
              <ellipse cx="300" cy="120" rx="200" ry="140" fill="#B9B9F9" />
              <ellipse cx="90" cy="150" rx="210" ry="170" fill="#5B5CE2" />
              <ellipse cx="470" cy="260" rx="150" ry="120" fill="#EA2261" opacity="0.55" />
              <ellipse cx="200" cy="420" rx="260" ry="180" fill="#3F40B8" />
            </g>
            <rect width="500" height="640" fill="url(#mesh-shade)" />
          </svg>
          {/* product-shaped hint: three channels flowing into one inbox */}
          <div aria-hidden className="absolute inset-x-10 top-12 flex flex-col gap-3">
            {(
              [
                ['WHATSAPP', 'Is the blue sofa still in stock?', 'w-[78%]'],
                ['INSTAGRAM', 'Do you deliver to Chattogram?', 'ml-auto w-[70%]'],
                ['MESSENGER', 'Order #1043 — can I change the address?', 'w-[84%]'],
              ] as const
            ).map(([ch, text, cls]) => (
              <div
                key={ch}
                className={`flex items-center gap-3 rounded-[14px] border border-white/15 bg-white/10 px-3.5 py-3 text-[13px] text-white/90 backdrop-blur-[6px] ${cls}`}
              >
                <ChannelIcon channel={ch} size={26} variant="tile" decorative />
                <span className="truncate">{text}</span>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-10">
            <h2 className="m-0 text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-white">
              Every Conversation.
              <br />
              One Intelligent Platform.
            </h2>
            <p className="m-0 mt-3 max-w-[380px] text-[15px] leading-relaxed text-white/80">
              Manage customer conversations, empower your team and deliver better support with
              Torio.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
