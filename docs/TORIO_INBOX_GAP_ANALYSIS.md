# Torio Inbox — Gap Analysis (Meta Business Suite-inspired brief)

Date: 2026-11-02. Audited against the code on `main`: Prisma schema, NestJS modules, contracts and the web app.
"Existing" means it works end to end today; "Partial" means some layers exist; "Missing" means no backend support.

## What exists today

- **Data:** Workspace, User, WorkspaceMembership (Owner/Admin/Agent), Team + TeamMembership, Channel
  (WhatsApp / Instagram / Messenger), Customer (name, phone, email, handle, location, company, address, tags,
  source, owner, opt-out), Conversation (status, priority, assignee, snooze, unread, waiting), Message (text
  only: inbound, outbound, note, event; reply-to; delivery status; provider error), SavedReply, Lead + LeadActivity
  (stages New → Won/Lost, owner, source), Order + items/payments/notes/events, Automation engine (versions,
  executions), BrainConfig (products, policies), AuditLog.
- **APIs:** conversations (list with view/channel/status/search/sort, page-based), messages (page-based), send,
  bulk actions, saved replies (list/create/delete), customers (incl. activity and conversations), leads
  (pipeline + activity), orders (full CRUD), automations, WhatsApp Cloud webhooks/send/retry, realtime gateway
  (socket.io, ids only).
- **Inbox UI:** channel tabs, list with search + Conversations/Status dropdowns + sort + filters, bulk, chat with grouping, notes, reply-to, retry,
  new-message indicator, assignment, snooze, resolve, urgent, Quick Customer Details panel, saved replies picker,
  emoji, Create Order drawer, responsive one-pane mobile flow.

## Gap matrix

| Feature                                   | Existing | Partial | Missing | Action                                                                             |
| ----------------------------------------- | :------: | :-----: | :-----: | ---------------------------------------------------------------------------------- |
| Channel tabs WhatsApp/Instagram/Messenger |    ✓     |         |         | Tabs above the list heading; status counts follow the channel                      |
| Facebook / Instagram comments             |          |         |    ✓    | Needs new provider ingestion + data model; not started                             |
| Conversation counts per channel           |    ✓     |         |         | Tab badges: conversations in the selected status per channel (see below)           |
| Agent availability (Available/Busy/Away)  |          |         |    ✓    | Needs a membership field + API + realtime; not started                             |
| Filters: Unread, Priority                 |    ✓     |         |         | Keep                                                                               |
| Filters: Ad replies, Follow up            |          |         |    ✓    | No ad-referral or follow-up data captured; not started                             |
| Assign to agent / reassign / unassign     |    ✓     |         |         | Keep                                                                               |
| Assign to team                            |          |    ✓    |         | Teams exist; conversations have no team field                                      |
| Conversation tags                         |          |    ✓    |         | Tags live on customers; filter lists workspace tags. No bulk tag edit yet          |
| Mark read/unread, snooze, resolve, bulk   |    ✓     |         |         | Manage mode: bulk assign/unassign, read, unread, priority, snooze, resolve         |
| Conversation list pagination              |          |    ✓    |         | API pages; UI loads first 100 only                                                 |
| Message history pagination                |          |    ✓    |         | API pages; UI loads first 200 only                                                 |
| Images, documents, audio, video           |          |         |    ✓    | Message is text only; needs attachment model, storage and provider media           |
| Attachment upload                         |          |         |    ✓    | No file storage in the stack                                                       |
| Reactions                                 |          |         |    ✓    | Not stored                                                                         |
| Delivery / read status                    |    ✓     |         |         | WhatsApp only                                                                      |
| Internal notes                            |    ✓     |         |         | Keep                                                                               |
| @mentions in notes                        |          |         |    ✓    | Needs parsing + notifications (notifications not built)                            |
| Collision detection (two agents replying) |          |         |    ✓    | Needs presence over realtime                                                       |
| Voice messages                            |          |         |    ✓    | Depends on attachments                                                             |
| Saved replies: search, insert, keep draft |    ✓     |         |         | Done                                                                               |
| Saved replies management UI / edit        |          |    ✓    |         | API has create/delete, no edit, no settings page                                   |
| Create order from chat                    |    ✓     |         |         | Done (drawer, Brain catalogue, manual items, multi-item)                           |
| Product catalogue                         |          |    ✓    |         | Brain products (text price, variants as text, no images, no stock count)           |
| Customer panel: contact, conversation     |    ✓     |         |         | Keep                                                                               |
| Customer panel: edit About fields         |          |    ✓    |         | Lead status, tags, notes editable; contact fields only on Customers page           |
| Channel profile (public provider data)    |          |         |    ✓    | Providers' profile data is not fetched                                             |
| Lead stage in Inbox panel                 |    ✓     |         |         | Done 2026-11-03: panel edits the Lead record (stage, owner); links to /leads?lead= |
| Orders in panel                           |    ✓     |         |         | Latest 5 with status                                                               |
| Activity timeline                         |          |    ✓    |         | Lead activity + order events exist; no unified customer timeline in Inbox          |
| Consent / data sharing                    |          |    ✓    |         | Only WhatsApp opt-out; Meta data-sharing has no Torio equivalent                   |
| Leads Centre (table + Kanban)             |    ✓     |         |         | Keep (leads page, pipeline board)                                                  |
| Automations: assignment, tags, lead stage |    ✓     |         |         | Keep                                                                               |
| Welcome / away / keyword auto-replies     |          |         |    ✓    | No message.received trigger or send-message action                                 |
| Business hours, SLA notifications         |          |         |    ✓    | No schedule model; notifications not built                                         |
| Messenger / Instagram sending             |          |    ✓    |         | Channels modelled; sending only implemented for WhatsApp                           |
| Realtime updates                          |    ✓     |         |         | socket.io; unavailable on Vercel functions                                         |

## Channel badge definition

Each channel tab shows how many conversations in the selected status (Open by default) belong to that channel,
across the whole workspace. View (Unread, Mine, Unassigned), search and advanced filters do not change the
badges, so they stay stable while you narrow the list. "All messages" is the sum of the three providers, so no
conversation is counted twice. The Status dropdown is the mirror image: its counts follow the selected channel.
Both come from the same list response (`counts`, `channelCounts`) and refresh whenever the list refetches
(after any conversation change or realtime event). Unread totals are not shown: the API has no unread aggregate.

## Recommended order

1. ~~**Lead stage in the Inbox panel**~~ — done 2026-11-03.
2. **Pagination** — load older messages and more conversations. Backend exists.
3. **Assign to team + conversation tags** — small schema additions with existing team/tag patterns.
4. **Attachments** — attachment model, object storage, WhatsApp media send/receive. Largest missing piece.
5. **Agent availability + collision detection** — membership field, realtime presence.
6. **Auto-replies** — `message.received` trigger and send-message action in the existing automation engine.
7. **Comments channels and Messenger/Instagram sending** — after Meta app review.
