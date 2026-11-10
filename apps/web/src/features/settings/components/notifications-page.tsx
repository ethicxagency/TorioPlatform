import { Inbox, ShieldCheck, ShoppingBag, UserRoundPlus } from 'lucide-react';
import { Notice, PageHeader, Section } from './bits';

const CATEGORIES = [
  { icon: Inbox, title: 'Inbox', text: 'New conversations, assignments, mentions' },
  { icon: UserRoundPlus, title: 'Leads & Customers', text: 'New leads and lead assignment' },
  { icon: ShoppingBag, title: 'Orders', text: 'New orders and payment events' },
  { icon: ShieldCheck, title: 'Account', text: 'Security alerts and invitations' },
];

/** No notification delivery exists (no email provider, no push, no in-app notification feed), so there are no toggles. */
export function NotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" />
      <Section title="Delivery">
        <Notice>
          Torio doesn&apos;t send notifications yet. No email service, browser push or in-app feed
          is connected, so a switch here would do nothing. Preferences appear on this page when
          delivery exists.
        </Notice>
      </Section>
      <Section title="Planned categories">
        <ul className="m-0 grid list-none gap-px overflow-hidden rounded-xl border border-line bg-line-subtle p-0">
          {CATEGORIES.map((c) => (
            <li key={c.title} className="flex items-center gap-3 bg-white px-3.5 py-3">
              <c.icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{c.title}</div>
                <div className="text-xs text-muted">{c.text}</div>
              </div>
              <span className="shrink-0 rounded-[5px] bg-wash-2 px-1.5 py-px text-[10.5px] font-medium text-muted">
                Not available yet
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
