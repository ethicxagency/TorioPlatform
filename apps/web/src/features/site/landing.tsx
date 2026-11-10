import {
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  Inbox,
  PlugZap,
  UserCheck,
  Users,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { ChannelIcon } from '@/components/channel-icon';
import { SITE } from '@/lib/site';
import { ProductShowcase } from './product-showcase';

const wrap = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';
const eyebrow = 'm-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-primary';
const h2 =
  'm-0 mt-3 text-[32px] font-semibold leading-[1.15] tracking-[-0.025em] text-ink sm:text-[40px]';
const lead = 'm-0 mt-4 max-w-[640px] text-[17px] leading-relaxed text-muted';

const FEATURES = [
  {
    icon: Inbox,
    title: 'Unified inbox',
    text: 'Manage customer conversations from your connected WhatsApp, Instagram and Messenger accounts in one workspace, with status, priority, tags, internal notes and saved replies.',
  },
  {
    icon: Users,
    title: 'Team collaboration',
    text: 'Assign conversations to teammates or teams, invite people with roles, and keep the customer’s context next to every chat.',
  },
  {
    icon: Brain,
    title: 'Business Brain',
    text: 'Write down how your business works: products, policies, delivery, tone and rules, in one place your team and future AI features can rely on.',
    badge: 'AI replies: coming soon',
  },
  {
    icon: Workflow,
    title: 'Smart automation',
    text: 'Build rules that react to conversations, leads and orders, such as assigning, tagging or notifying, so repetitive work doesn’t depend on someone remembering.',
  },
  {
    icon: UserCheck,
    title: 'Customer management',
    text: 'Keep customers, conversation history, leads and orders connected, so anyone on the team sees the full picture.',
  },
  {
    icon: BarChart3,
    title: 'Business insights',
    text: 'See conversation volume, response workload, orders and revenue from the dashboard, in your workspace’s time zone and currency.',
  },
] as const;

const STEPS = [
  {
    n: '1',
    title: 'Connect your channels',
    text: 'Link WhatsApp Business, Instagram or a Facebook Page from the Channels page.',
  },
  {
    n: '2',
    title: 'Bring your team into one inbox',
    text: 'Invite teammates, set roles and let conversations be assigned instead of forwarded.',
  },
  {
    n: '3',
    title: 'Manage and improve conversations',
    text: 'Reply, follow up, turn chats into leads and orders, and use the dashboard to see where to improve.',
  },
] as const;

export function Landing() {
  return (
    <>
      <section
        id="product"
        className="relative overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,#E9E9FF,transparent)] pb-16 pt-14 sm:pt-20"
      >
        <div className={wrap}>
          <div className="mx-auto max-w-[860px] text-center">
            <h1 className="m-0 text-[42px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[60px]">
              Every Conversation.
              <br />
              One Intelligent Platform.
            </h1>
            <p className="m-0 mx-auto mt-6 max-w-[660px] text-[18px] leading-relaxed text-muted">
              Bring WhatsApp, Instagram and Facebook conversations together in one intelligent
              inbox. Empower your team, automate repetitive work and deliver better customer
              experiences with Torio.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-primary px-6 text-[15.5px] font-semibold text-white no-underline shadow-[0_1px_3px_rgba(0,55,112,0.12)] transition-colors duration-150 hover:bg-primary-hover hover:no-underline motion-reduce:transition-none"
              >
                Get Started <ArrowRight size={17} aria-hidden />
              </Link>
              <a
                href="#features"
                className="inline-flex h-12 items-center rounded-[12px] border border-line-input bg-white px-6 text-[15.5px] font-semibold text-ink no-underline transition-colors duration-150 hover:bg-wash hover:no-underline motion-reduce:transition-none"
              >
                Explore the Platform
              </a>
            </div>
            <p className="m-0 mt-4 text-[13.5px] text-faint">
              One workspace for your messaging channels, your team and your customers. Start on the
              Free plan.
            </p>
          </div>
          <div className="mt-14">
            <ProductShowcase />
          </div>
        </div>
      </section>

      <section
        aria-label="Supported channels"
        className="border-y border-line-subtle bg-white py-8"
      >
        <div className={`${wrap} flex flex-col items-center gap-5 sm:flex-row sm:justify-between`}>
          <p className="m-0 text-[14px] font-medium text-muted">
            Connect the channels your customers already use
          </p>
          <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-8 gap-y-3 p-0">
            {(['WHATSAPP', 'INSTAGRAM', 'MESSENGER'] as const).map((c) => (
              <li key={c} className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
                <ChannelIcon channel={c} size={26} variant="tile" decorative />
                {c === 'WHATSAPP'
                  ? 'WhatsApp'
                  : c === 'INSTAGRAM'
                    ? 'Instagram'
                    : 'Facebook Messenger'}
              </li>
            ))}
          </ul>
        </div>
        <p className={`${wrap} m-0 mt-4 text-center text-[12px] text-faint sm:text-left`}>
          WhatsApp, Instagram and Messenger are trademarks of their owners. Torio is not endorsed by
          or affiliated with Meta.
        </p>
      </section>

      <section id="about" className="py-20">
        <div className={wrap}>
          <div className="mx-auto max-w-[760px] text-center">
            <p className={eyebrow}>The problem</p>
            <h2 className={h2}>Customer conversations shouldn’t be scattered.</h2>
            <p className={`${lead} mx-auto`}>
              When every channel has its own app, messages get missed, teammates step on each other,
              and the same questions are answered by hand again and again.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                'Spread across platforms',
                'WhatsApp, Instagram and Messenger each live in a different place.',
              ],
              [
                'Missed messages',
                'Without one queue, a customer waiting for a reply is easy to overlook.',
              ],
              [
                'Manual coordination',
                'Who is handling this chat? Teams end up asking in group threads.',
              ],
              ['Repetitive work', 'The same follow-ups and updates, typed out over and over.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-line bg-white p-5">
                <h3 className="m-0 text-[16px] font-semibold text-ink">{t}</h3>
                <p className="m-0 mt-2 text-[14.5px] leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
          <p className="m-0 mx-auto mt-10 max-w-[680px] text-center text-[17px] leading-relaxed text-ink">
            Torio brings them into <b>one workspace</b>: one inbox, one team, one view of every
            customer.
          </p>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-wash py-20">
        <div className={wrap}>
          <div className="max-w-[640px]">
            <p className={eyebrow}>Features</p>
            <h2 className={h2}>Everything your team needs to handle customer conversations</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="flex flex-col rounded-2xl border border-line bg-white p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <f.icon size={19} strokeWidth={1.75} aria-hidden />
                </span>
                <h3 className="m-0 mt-4 text-[18px] font-semibold text-ink">{f.title}</h3>
                <p className="m-0 mt-2 text-[14.5px] leading-relaxed text-muted">{f.text}</p>
                {'badge' in f && (
                  <span className="mt-3 w-fit rounded-md bg-wash-2 px-2 py-0.5 text-[12px] font-medium text-muted">
                    {f.badge}
                  </span>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-20">
        <div className={wrap}>
          <div className="mx-auto max-w-[640px] text-center">
            <p className={eyebrow}>How Torio works</p>
            <h2 className={h2}>Up and running in three steps</h2>
          </div>
          <ol className="m-0 mt-12 grid list-none gap-6 p-0 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-line bg-white p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-white">
                  {s.n}
                </span>
                <h3 className="m-0 mt-4 text-[18px] font-semibold text-ink">{s.title}</h3>
                <p className="m-0 mt-2 text-[14.5px] leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="integrations" className="scroll-mt-20 bg-wash py-20">
        <div className={wrap}>
          <div className="max-w-[640px]">
            <p className={eyebrow}>Integrations</p>
            <h2 className={h2}>Connect your messaging channels</h2>
            <p className={lead}>
              Torio connects to your accounts through Meta’s official platform. Production access to
              Meta’s messaging APIs depends on Meta’s app review, so availability can vary by
              account while that is in progress.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                c: 'WHATSAPP',
                t: 'WhatsApp Business',
                d: 'Connect a WhatsApp Business number through the Cloud API, using guided setup or a manual token.',
              },
              {
                c: 'INSTAGRAM',
                t: 'Instagram',
                d: 'Connect an Instagram Professional account linked to a Facebook Page to receive and answer direct messages.',
              },
              {
                c: 'MESSENGER',
                t: 'Facebook Messenger',
                d: 'Connect the Facebook Pages you manage and answer Messenger conversations from the shared inbox.',
              },
            ].map((i) => (
              <article key={i.t} className="rounded-2xl border border-line bg-white p-6">
                <div className="flex items-center gap-3">
                  <ChannelIcon channel={i.c as 'WHATSAPP'} size={32} variant="tile" decorative />
                  <h3 className="m-0 text-[17px] font-semibold text-ink">{i.t}</h3>
                </div>
                <p className="m-0 mt-3 text-[14.5px] leading-relaxed text-muted">{i.d}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
                  <Check size={14} aria-hidden /> Connection supported
                </span>
              </article>
            ))}
          </div>
          <p className="m-0 mt-6 flex items-center gap-2 text-[14px] text-muted">
            <PlugZap size={16} aria-hidden /> More channels are not available yet.
          </p>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 py-20">
        <div className={wrap}>
          <div className="mx-auto max-w-[680px] rounded-2xl border border-line bg-white p-8 text-center">
            <p className={eyebrow}>Pricing</p>
            <h2 className={h2}>Start free</h2>
            <p className={`${lead} mx-auto`}>
              Create an account to try Torio on the Free plan with a small team. Paid plans and
              their prices will be published here; the plans available to your workspace are always
              shown under Billing in the app.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex h-11 items-center rounded-[10px] bg-primary px-5 text-[15px] font-semibold text-white no-underline hover:bg-primary-hover hover:no-underline"
            >
              Create your account
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#1C1E54] py-20 text-white">
        <div className={`${wrap} text-center`}>
          <h2 className="m-0 text-[32px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[42px]">
            Make every customer conversation count.
          </h2>
          <p className="m-0 mx-auto mt-4 max-w-[520px] text-[17px] leading-relaxed text-white/75">
            Bring your customer communication into one workspace with Torio.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-[12px] bg-white px-6 text-[15.5px] font-semibold text-[#1C1E54] no-underline hover:bg-white/90 hover:no-underline"
          >
            Get Started <ArrowRight size={17} aria-hidden />
          </Link>
          <p className="m-0 mt-6 text-[13px] text-white/60">
            {SITE.name} is built by {SITE.company}.
          </p>
        </div>
      </section>
    </>
  );
}
