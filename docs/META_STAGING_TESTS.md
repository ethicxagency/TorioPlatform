# Real-Meta staging test plan

The automated tests (`apps/api/test/meta.integration.test.ts`, web e2e) use mocked Meta responses. They prove Torio's
own logic, **not** that Meta accepts these requests. Run this plan against a real Meta app in development mode
(testers added under App roles) before enabling anything for customers. Record the date and result of each step.

Prerequisites: Meta app configured per `docs/META_SETUP.md`; a staging deployment with HTTPS and all variables set;
a test Facebook user with a Page, an Instagram professional account linked to it, and (for WhatsApp) a business
portfolio with a WhatsApp Business Account.

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Connect Channel → Continue with Facebook | Facebook dialog lists exactly the permissions shown in Torio | |
| 2 | Approve everything | Back on /channels with a selection screen | |
| 3 | Pages listed | Every Page the user manages, with name and picture | |
| 4 | Instagram listed | Only professional accounts linked to a Page, shown as @username | |
| 5 | WhatsApp numbers listed (`META_DISCOVER_WHATSAPP=true`) | Registered numbers selectable; unregistered ones explain Embedded Signup | |
| 6 | Select Page + Instagram, Connect | Each shows Connected; Page webhook subscription visible in Meta; channel health shows *Subscribed* | |
| 7 | Decline one permission | Other products still connect; the missing one is named | |
| 8 | Send a real message to the Page | Appears in the Inbox once (check Messenger channel filter) | |
| 9 | Reply from the Inbox | Delivered in Messenger; status goes Sent → Delivered → Read | |
| 10 | Repeat 8–9 for Instagram DM | Same | |
| 11 | WhatsApp Embedded Signup with a new number | Completes; number registered; inbound and outbound work | |
| 12 | Message outside the 24-hour window | Torio blocks the reply and explains why | |
| 13 | Revoke Torio in Facebook → Business integrations | Check connection marks *Authorization expired*; sending is blocked | |
| 14 | Reconnect | Same channel revived, history intact | |
| 15 | Disconnect | Page subscription removed on Meta; token deleted; conversations kept | |
| 16 | Connect the same Page from a second workspace | Refused: already connected | |
| 17 | Force a webhook failure (stop the API, send a message, start it) | Event is picked up within a minute, no duplicates | |

Do not mark the integration production-ready until every row has a recorded pass on real Meta.
