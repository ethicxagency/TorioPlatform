import { Notice, PageHeader, Section } from './bits';

const PLANNED = [
  'Inbox: new conversations, assignments, mentions',
  'CRM: new leads and lead assignment',
  'Orders: new orders and payment events',
  'Account: security alerts and invitations',
];

/** No notification delivery exists (no email provider, no push, no in-app notification feed), so there are no toggles. */
export function NotificationsPage() {
  return (
    <div>
      <PageHeader title="Notifications" description="Choose which alerts you receive and how." />
      <Section title="Not available yet">
        <Notice>
          Torio doesn&apos;t send notifications yet. There is no email service, browser push or
          in-app notification feed connected, so any switch shown here would do nothing. Preferences
          will appear on this page when delivery exists.
        </Notice>
        <p className="mb-1.5 mt-4 text-[12.5px] font-medium">Planned categories</p>
        <ul className="m-0 list-disc pl-5 text-[13px] text-muted">
          {PLANNED.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
