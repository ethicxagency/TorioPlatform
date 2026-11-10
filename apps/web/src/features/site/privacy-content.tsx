import Link from 'next/link';
import { LEGAL, SITE } from '@/lib/site';

/** A value the company still has to supply. Visible on purpose, so it cannot be published by accident. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <mark
      data-placeholder
      className="rounded bg-[#FFF3C4] px-1 py-px text-[0.95em] font-medium text-[#6B4E00]"
    >
      [{children}]
    </mark>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="m-0 mb-4 text-[16px] leading-[1.75] text-ink-secondary">{children}</p>
);
const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="m-0 mb-4 flex list-disc flex-col gap-1.5 pl-6 text-[16px] leading-[1.7] text-ink-secondary">
    {children}
  </ul>
);

export interface PolicySection {
  id: string;
  title: string;
  body: React.ReactNode;
}

const company = SITE.company;

/**
 * DRAFT policy text written from what Torio actually does today. It is not legal advice and must be reviewed by counsel
 * before it is published. Anything unverified is a visible placeholder (see LEGAL in lib/site.ts).
 */
export const POLICY: PolicySection[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    body: (
      <>
        <P>
          This Privacy Policy explains how information is collected, used, shared and protected when
          you use Torio, an omnichannel customer messaging and team inbox platform available at{' '}
          {SITE.url}, and how you can control your information.
        </P>
        <P>
          By using Torio you acknowledge this policy. If you do not agree with it, please do not use
          the service.
        </P>
      </>
    ),
  },
  {
    id: 'who-we-are',
    title: 'Who We Are',
    body: (
      <>
        <P>
          Torio is operated by {company} (“{company}”, “we”, “us”). When a business uses Torio to
          talk to its own customers, that business decides why and how its customers’ messages are
          handled, and Torio processes that information on its behalf.
        </P>
        <P>
          Registered address:{' '}
          {LEGAL.companyAddress ? (
            LEGAL.companyAddress
          ) : (
            <Placeholder>
              Registered company address: to be completed before publication
            </Placeholder>
          )}
        </P>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information We Collect',
    body: (
      <>
        <P>Depending on how you use Torio, we handle the following kinds of information:</P>
        <UL>
          <li>Account and sign-in information (see below).</li>
          <li>Business and workspace information that you or your team enter.</li>
          <li>
            Customer, lead, order and conversation information that your team manages in Torio.
          </li>
          <li>Messages and related data that connected messaging platforms send to Torio.</li>
          <li>
            Technical information such as IP address, device and browser details, and session
            records, used to run and secure the service.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: 'account-and-authentication',
    title: 'Account and Authentication Information',
    body: (
      <>
        <P>
          To create an account we collect your name, email address and a password (stored only as a
          salted, one-way hash). You can also sign in with Google or Facebook. In that case we
          receive from the provider a stable account identifier, your name and, if the provider
          supplies it, your email address. We use this only to create or sign in to your Torio
          account and to link the provider to it. We do not receive your provider password.
        </P>
        <P>
          We keep a record of your sessions (device, IP address, last activity) so you can see and
          sign out your devices, and security-related events such as sign-ins and password changes.
        </P>
      </>
    ),
  },
  {
    id: 'customer-and-business',
    title: 'Customer and Business Information',
    body: (
      <>
        <P>
          Businesses using Torio can store information about their own customers and leads (for
          example names, phone numbers, email addresses, tags, notes), their orders and products,
          team members and settings. The business is responsible for having a lawful basis to
          collect and use that information and for the content it enters.
        </P>
      </>
    ),
  },
  {
    id: 'messaging-and-conversation',
    title: 'Messaging and Conversation Data',
    body: (
      <>
        <P>
          When a business connects a messaging channel, the channel’s provider sends Torio the
          messages customers send to that business, the replies the business sends, delivery and
          read status, and profile details the provider shares (such as a display name). Torio
          stores this conversation data so the team can read, search, assign and answer
          conversations. Torio does not claim that messages are end-to-end encrypted within Torio,
          and conversation history is stored by Torio for as long as the workspace needs it (see
          Data Retention).
        </P>
      </>
    ),
  },
  {
    id: 'third-party-platforms',
    title: 'Connected Third-Party Platforms',
    body: (
      <>
        <P>
          Torio can connect to WhatsApp Business, Instagram and Facebook Messenger through Meta’s
          platform, and to Google and Facebook for sign-in. When you connect a channel you authorize
          Torio to receive and send messages and read the account details needed for that on your
          behalf; access tokens are stored encrypted. You can disconnect a channel in Torio at any
          time, and you may also need to remove Torio’s access inside the provider’s own settings.
        </P>
        <P>
          Those platforms have their own privacy policies and terms, which apply to what they
          collect and do. Torio is not endorsed by or affiliated with Meta or Google.
        </P>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How We Use Information',
    body: (
      <UL>
        <li>
          To provide, operate and secure Torio, including delivering and displaying conversations.
        </li>
        <li>To authenticate you, keep your sessions safe and prevent abuse.</li>
        <li>
          To send service emails such as sign-in verification, password reset and account deletion
          confirmations, where email delivery is configured.
        </li>
        <li>To provide support, diagnose problems and improve the service.</li>
        <li>To meet legal obligations and enforce our terms.</li>
      </UL>
    ),
  },
  {
    id: 'ai-processing',
    title: 'AI Processing and Business Knowledge',
    body: (
      <>
        <P>
          Torio includes a “Brain” where a business records its knowledge, policies and rules. At
          the time of writing, Torio does not send customer conversations to an external AI model
          provider: AI-generated replies in the inbox are not enabled, and the Brain preview is a
          rule-based simulation that runs without an AI model.
        </P>
        <P>
          If AI features are enabled in the future, this section will be updated before conversation
          content is processed by an AI provider, and will name the provider and purpose.
        </P>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and Session Technologies',
    body: (
      <>
        <P>
          Torio uses cookies and similar technologies that are needed to keep you signed in and to
          protect the service: a secure, HTTP-only session cookie, short-lived cookies used during
          sign-in with Google or Facebook, and a small routing cookie that tells the site whether to
          show the public page or your dashboard. We do not use these to track you across other
          websites. Torio does not currently set advertising cookies.
        </P>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Data Sharing and Service Providers',
    body: (
      <>
        <P>
          We do not sell personal information. We share it only as needed to run Torio: with the
          messaging platforms you connect, with sign-in providers you choose, and with
          infrastructure and service providers that host the application and its database, and send
          service emails (when configured). These providers may process data only to provide their
          service to us. We may also disclose information when required by law or to protect rights
          and safety.
        </P>
        <P>
          Hosting and service providers:{' '}
          <Placeholder>
            List of hosting, database and email providers and their locations: to be completed
            before publication
          </Placeholder>
        </P>
      </>
    ),
  },
  {
    id: 'storage-and-security',
    title: 'Data Storage and Security',
    body: (
      <>
        <P>
          Data is stored in a PostgreSQL database. We use measures such as encrypted connections
          (HTTPS), hashed passwords, encrypted storage of channel access tokens and application
          secrets, access controls between workspaces, and audit logging of sensitive administrative
          actions. No system is perfectly secure, and we cannot guarantee absolute security.
        </P>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Data Retention',
    body: (
      <>
        <P>
          We keep information for as long as your account or workspace is active and as needed to
          provide the service. Retention depends on the functionality you use, your account status
          and legal obligations. After an account is deleted, personal information is deleted or
          anonymized as described below, except where records must be kept for legal, security or
          fraud-prevention reasons.
        </P>
        <P>
          Retention periods:{' '}
          {LEGAL.retention ? (
            LEGAL.retention
          ) : (
            <Placeholder>
              Approved retention periods: to be completed before publication
            </Placeholder>
          )}
        </P>
      </>
    ),
  },
  {
    id: 'account-deletion',
    title: 'Account Deletion',
    body: (
      <>
        <P>
          You can ask us to permanently delete your Torio account on the{' '}
          <Link href="/delete-account" className="text-primary">
            Account Deletion
          </Link>{' '}
          page. We verify that the request comes from the account owner (by your password while
          signed in, or by a link sent to your account email). When a request is processed, access
          to the account is removed, its sessions and linked sign-in providers are deleted, and
          personal details on the account are deleted or anonymized. Channels in workspaces that
          nobody else uses are disconnected and their stored tokens deleted.
        </P>
        <P>
          Some records may be retained where required by law, for security or fraud prevention, or
          for legitimate business obligations. An account that owns a workspace still used by other
          people cannot be deleted until ownership is transferred. Connected third-party permissions
          may also need to be revoked in those platforms’ own settings. Deletion is permanent and is
          different from simply signing out.
        </P>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'International Data Transfers',
    body: (
      <>
        <P>
          Torio and its service providers may process information in countries other than the one
          you live in. Where we transfer personal information internationally we aim to do so with
          appropriate safeguards.{' '}
          <Placeholder>
            Hosting regions and transfer mechanisms: to be completed before publication
          </Placeholder>
        </P>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'User Privacy Rights',
    body: (
      <>
        <P>
          Depending on where you live you may have rights to access, correct, export, delete or
          restrict the use of your personal information, and to object to some processing. Signed-in
          customers can already view and edit their profile and download their account data from
          Settings → Data &amp; Privacy, and can request deletion as described above. For other
          requests, or if your data is held by a business that uses Torio, please contact that
          business or us at the address below. We will respond as required by applicable law.
        </P>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children’s Privacy',
    body: (
      <>
        <P>
          Torio is a business service and is not directed to children. We do not knowingly collect
          personal information from children. If you believe a child has provided us information,
          please contact us and we will take appropriate steps to delete it.
        </P>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to This Policy',
    body: (
      <>
        <P>
          We may update this policy as Torio changes. We will post the new version here with an
          updated “Last updated” date and, where the changes are material, take reasonable steps to
          tell you.
        </P>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact Information',
    body: (
      <>
        <P>Questions or requests about this policy or your information:</P>
        <UL>
          <li>Company: {company}</li>
          <li>
            Privacy contact:{' '}
            {LEGAL.privacyEmail ? (
              <a href={`mailto:${LEGAL.privacyEmail}`} className="text-primary">
                {LEGAL.privacyEmail}
              </a>
            ) : (
              <Placeholder>Privacy contact email: to be completed before publication</Placeholder>
            )}
          </li>
          <li>
            Address:{' '}
            {LEGAL.companyAddress ?? (
              <Placeholder>Registered address: to be completed before publication</Placeholder>
            )}
          </li>
        </UL>
      </>
    ),
  },
];
