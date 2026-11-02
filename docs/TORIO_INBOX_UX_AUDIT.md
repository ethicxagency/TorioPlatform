# Torio Inbox UX Audit

Date: 2026-11-02. Scope: the customer-portal Inbox (`apps/web/src/features/inbox`). Checked on desktop (three
panes), tablet (profile as a drawer) and mobile at 375px (one pane at a time).

The visual language follows `apps/web/DESIGN.md` (navy ink, Torio indigo #5B5CE2, Inter). The older colour values in
the request (#17181C and similar) were not applied, because DESIGN.md is the binding palette.

## Already sound (kept as is)

- Three-pane layout with resizable panels; the profile becomes a drawer on narrow widths; mobile shows list, chat and
  profile one at a time, with a back button.
- Real-time updates through `useInboxRealtime`; the timeline only auto-scrolls when the reader is near the bottom and
  otherwise shows a "New messages" button.
- Per-conversation drafts, slash-command saved replies, keyboard shortcuts, bulk actions, snooze, assignment to a
  team member, status changes.
- Sending is disabled while a send is in flight, so double sends cannot happen.
- Internal notes look clearly different from replies and say "only your team sees this".
- AI Assist states honestly that no model provider is connected.
- WhatsApp 24-hour window and opt-out are enforced and explained in the composer.

## Issues found and fixed

| #   | Area     | Issue                                                                                             | Fix                                                                                                                                                                                      |
| --- | -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Filters  | View chips overflowed the narrow list column and were cut off behind a hidden horizontal scroll.  | Text views (All, Mine, Unassigned, Unread) and icon-only channel chips (official brand icons, with `aria-label` and `title`) now wrap as two groups.                                     |
| 2   | Filters  | Sort select and search placeholder were clipped.                                                  | Placeholder shortened to "Search"; sort option renamed "Longest wait"; select given a fixed width; visible focus ring.                                                                   |
| 3   | List     | Active row used a coloured left border, which DESIGN.md does not use.                             | Active and checked rows use the primary-soft fill; hover uses wash; keyboard focus shows an outline.                                                                                     |
| 4   | List     | Customer names changed weight between read and unread rows, so rows jumped.                       | Names are always semibold; unread is shown through colour and the unread badge.                                                                                                          |
| 5   | Header   | The profile toggle used a "⋯" icon that read as a "More" menu.                                    | Uses a panel icon; label "Open customer profile" unchanged.                                                                                                                              |
| 6   | Composer | A disabled "Attach file" button advertised a feature that does not exist.                         | Removed until attachments are built.                                                                                                                                                     |
| 7   | Messages | Failed outbound messages showed the reason but no way to resend, although the API supports retry. | "Retry sending" button on failed messages (for users who can reply), wired to `POST /messages/{id}/retry`, with a toast for the result. The endpoint's response is now typed in OpenAPI. |
| 8   | Layout   | A decorative radial gradient sat behind the working screen.                                       | Plain canvas background; gradients stay on brand surfaces only.                                                                                                                          |

## Remaining limitations (not built; shown honestly or absent)

- No attachments or media sending, and no media preview beyond what the API stores.
- AI reply suggestions: no model provider connected.
- Messenger and Instagram sending: Meta connections are still pending, so only WhatsApp sends live.
- Assignment is to a single user; there are no teams or round-robin rules.
- No @mentions inside internal notes, and no notifications for them.
- The conversation list is not virtualized; very large workspaces may scroll slowly.
- No typing indicators or read receipts from customers.
