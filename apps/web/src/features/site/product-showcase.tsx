import {
  Bell,
  Check,
  Inbox,
  LayoutDashboard,
  Package,
  Search,
  Settings,
  UserRound,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { ChannelIcon } from '@/components/channel-icon';

const ROWS = [
  {
    ch: 'WHATSAPP',
    name: 'Amina R.',
    text: 'Is the blue sofa still in stock?',
    t: '2m',
    on: true,
    unread: true,
  },
  {
    ch: 'INSTAGRAM',
    name: 'Tanvir H.',
    text: 'Do you deliver to Chattogram?',
    t: '14m',
    unread: true,
  },
  { ch: 'MESSENGER', name: 'Shakil A.', text: 'Order #1043: can I change the address?', t: '1h' },
  { ch: 'WHATSAPP', name: 'Nusrat J.', text: 'Thanks, received it today.', t: '3h' },
] as const;

const NAV = [LayoutDashboard, Inbox, UserRound, UsersRound, Package, Workflow, Settings];

/**
 * An illustration of the Torio inbox built from the product's own visual language (same channel icons, colours and
 * layout). The names and messages are made-up examples, not customer data, and the picture is described for assistive tech.
 */
export function ProductShowcase() {
  return (
    <div
      role="img"
      aria-label="Illustration of the Torio inbox: a list of conversations from WhatsApp, Instagram and Messenger, an open WhatsApp conversation with a reply, and the conversation assigned to a teammate."
      className="mx-auto w-full max-w-[1040px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,55,112,0.04),0_32px_64px_-24px_rgba(63,64,184,0.28)]"
    >
      <div className="flex items-center gap-1.5 border-b border-line-subtle bg-wash px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#E5E7EB]" />
        <span className="ml-3 hidden h-5 w-[260px] items-center rounded-md bg-white px-2 text-[11px] text-faint sm:flex">
          torio.nextupglobal.net
        </span>
      </div>
      <div
        aria-hidden
        className="grid min-h-[360px] grid-cols-[48px_1fr] sm:grid-cols-[52px_minmax(0,300px)_1fr] lg:grid-cols-[52px_minmax(0,300px)_1fr_220px]"
      >
        <div className="flex flex-col items-center gap-3 border-r border-line-subtle py-3">
          {NAV.map((I, i) => (
            <span
              key={i}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 1 ? 'bg-primary-soft text-primary' : 'text-faint'}`}
            >
              <I size={16} strokeWidth={1.75} />
            </span>
          ))}
        </div>
        <div className="hidden flex-col border-r border-line-subtle sm:flex">
          <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2.5">
            <span className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-line px-2.5 text-[12px] text-faint">
              <Search size={13} /> Search
            </span>
          </div>
          {ROWS.map((r) => (
            <div
              key={r.name}
              className={`flex items-start gap-2.5 border-b border-line-subtle px-3 py-3 ${'on' in r && r.on ? 'bg-primary-soft/60' : ''}`}
            >
              <ChannelIcon channel={r.ch} size={22} variant="tile" decorative />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12.5px] font-semibold text-ink">{r.name}</span>
                  <span className="text-[11px] text-faint">{r.t}</span>
                </div>
                <div className="truncate text-[12px] text-muted">{r.text}</div>
              </div>
              {'unread' in r && r.unread && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2.5 border-b border-line-subtle px-4 py-2.5">
            <ChannelIcon channel="WHATSAPP" size={22} variant="tile" decorative />
            <span className="text-[13px] font-semibold text-ink">Amina R.</span>
            <span className="rounded-md bg-wash-2 px-1.5 py-0.5 text-[11px] text-muted">Open</span>
            <Bell size={14} className="ml-auto text-faint" />
          </div>
          <div className="flex flex-1 flex-col gap-3 bg-wash/60 p-4">
            <div className="max-w-[78%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[12.5px] text-ink shadow-[0_1px_2px_rgba(0,55,112,0.06)]">
              Is the blue sofa still in stock?
            </div>
            <div className="ml-auto max-w-[78%] rounded-2xl rounded-tr-md bg-primary px-3.5 py-2.5 text-[12.5px] text-white">
              Yes, it is. I can have it delivered this week. Shall I place the order for you?
            </div>
            <div className="max-w-[60%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[12.5px] text-ink shadow-[0_1px_2px_rgba(0,55,112,0.06)]">
              Please do.
            </div>
            <div className="mt-auto flex h-9 items-center rounded-xl border border-line bg-white px-3 text-[12px] text-faint">
              Write a reply…
            </div>
          </div>
        </div>
        <div className="hidden flex-col gap-4 border-l border-line-subtle p-4 lg:flex">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Assigned to
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[12.5px] font-medium text-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary-hover">
                FA
              </span>{' '}
              Farid A.
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Customer
            </div>
            <div className="mt-1.5 text-[12.5px] text-muted">
              Conversation history, orders and lead stage appear here.
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-success">
            <Check size={14} /> Order draft ready
          </div>
        </div>
      </div>
    </div>
  );
}
