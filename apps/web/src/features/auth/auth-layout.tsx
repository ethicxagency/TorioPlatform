import { ChannelIcon } from '@/components/channel-icon';
import { TorioLogo } from '@/components/shell/torio-logo';
import { Toaster } from '@/components/ui/toaster';

/**
 * One frame for every customer authentication page: a quiet brand panel on the left (hidden below 1024px) and the
 * task on the right. Nothing here depends on the page, so sign-in, sign-up, recovery and verification read as one flow.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        aria-label="About Torio"
        className="relative hidden flex-col justify-between overflow-hidden bg-[#1C1E54] p-12 text-white lg:sticky lg:top-0 lg:flex lg:h-screen"
      >
        <div>
          <h2 className="m-0 max-w-[440px] text-[34px] font-semibold leading-[1.15] tracking-[-0.025em]">
            Every conversation.
            <br />
            One place to answer it.
          </h2>
          <p className="m-0 mt-4 max-w-[400px] text-[15.5px] leading-relaxed text-white/75">
            WhatsApp, Instagram and Messenger in one inbox, with the customers, leads and orders
            behind each chat.
          </p>
        </div>
        <div aria-hidden className="flex max-w-[460px] flex-col gap-3">
          {(
            [
              ['WHATSAPP', 'Is the blue sofa still in stock?', ''],
              ['INSTAGRAM', 'Do you deliver to Chattogram?', 'ml-10'],
              ['MESSENGER', 'Order #1043 — can I change the address?', ''],
            ] as const
          ).map(([ch, text, cls]) => (
            <div
              key={ch}
              className={`flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.07] px-3.5 py-3 text-[13.5px] text-white/90 ${cls}`}
            >
              <ChannelIcon channel={ch} size={26} variant="tile" decorative />
              <span className="truncate">{text}</span>
            </div>
          ))}
        </div>
      </aside>
      <main className="flex min-h-screen flex-col px-5 py-8 sm:px-10 lg:px-16">
        <TorioLogo className="h-9 w-auto shrink-0 self-start object-contain" />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}

export function AuthHeading({ title, text }: { title: string; text?: string }) {
  return (
    <header className="mb-7">
      <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">
        {title}
      </h1>
      {text && <p className="m-0 mt-2 text-[14.5px] leading-relaxed text-muted">{text}</p>}
    </header>
  );
}
