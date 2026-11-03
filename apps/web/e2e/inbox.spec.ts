import { expect, test } from '@playwright/test';
import { mockApi } from './mocks';

test.describe('inbox', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto('/inbox');
  });

  test('lists conversations with real counts and no fake data labels', async ({ page }) => {
    await expect(page.getByRole('option', { name: /Tanvir Hasan/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Open/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /Snoozed/ })).toContainText('0');
  });

  test('closed chat state has no placeholder; opening shows chat without the profile', async ({
    page,
  }) => {
    await expect(page.getByText('Select a conversation')).toHaveCount(0);
    await expect(page.getByRole('region', { name: /^Chat with/ })).toHaveCount(0);
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('region', { name: 'Chat with Tanvir Hasan' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Customer profile' })).toHaveCount(0);
  });

  test('three-dot opens the profile; X closes chat and profile', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('button', { name: 'Open customer profile' }).click();
    await expect(page.locator('aside[aria-label="Customer profile"]')).toBeVisible();
    await page.getByRole('button', { name: 'Close chat' }).click();
    await expect(page.getByRole('region', { name: /^Chat with/ })).toHaveCount(0);
    await expect(page.locator('aside[aria-label="Customer profile"]')).toHaveCount(0);
    // The conversation itself is untouched.
    await expect(page.getByRole('tab', { name: /Open/ })).toContainText('2');
  });

  test('drafts persist per conversation', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('textbox', { name: /Reply to Tanvir/ }).fill('draft one');
    await page.getByRole('option', { name: /Ayesha Siddiqua/ }).click();
    await expect(page.getByRole('textbox', { name: /Reply to Ayesha/ })).toHaveValue('');
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('textbox', { name: /Reply to Tanvir/ })).toHaveValue('draft one');
  });

  test('slash command inserts a saved reply with variables and does not send', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const box = page.getByRole('textbox', { name: /Reply to Tanvir/ });
    await box.fill('/tha');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('Thanks, Tanvir!');
  });

  test('send is disabled for an empty draft; AI Assist is honest', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'AI Assist' }).click();
    await expect(page.getByText("AI Assist isn't connected yet")).toBeVisible();
  });

  test('keyboard: ? opens shortcuts, J opens the first conversation, Escape closes the dialog', async ({
    page,
  }) => {
    await expect(page.getByRole('option', { name: /Tanvir Hasan/ })).toBeVisible(); // wait for hydration
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    await page.keyboard.press('j');
    await expect(page.getByRole('region', { name: 'Chat with Tanvir Hasan' })).toBeVisible();
  });

  test('no horizontal overflow on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/inbox');
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(page.getByRole('option', { name: /Tanvir Hasan/ })).toBeVisible();
  });

  test('filters fit the list: channel chips are labelled icons; no attachment button', async ({
    page,
  }) => {
    const views = page.getByRole('group', { name: 'Views' });
    for (const name of ['WhatsApp', 'Instagram', 'Messenger'])
      await expect(views.getByRole('button', { name })).toBeVisible();
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('button', { name: /Attach file/ })).toHaveCount(0);
  });

  test('a failed reply shows its reason and can be resent', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByText('Not delivered: Outside the 24-hour window')).toBeVisible();
    const retry = page.waitForRequest((r) => r.url().endsWith('/retry') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Retry sending' }).click();
    await retry;
    await expect(page.getByText('Message sent')).toBeVisible();
  });

  test('customer name opens Quick Customer Details beside the chat, not a new page', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const chat = page.getByRole('region', { name: 'Chat with Tanvir Hasan' });
    await chat.getByRole('button', { name: 'Tanvir Hasan', exact: true }).click();
    await expect(page).toHaveURL(/\/inbox/);
    await expect(chat).toBeVisible();
    const panel = page.locator('aside[aria-label="Customer profile"]');
    await expect(panel).toBeVisible();
    // The full profile is still one explicit click away, via the existing Customers deep link.
    await expect(page.getByRole('link', { name: 'View full profile' })).toHaveAttribute(
      'href',
      /^\/customers\?customer=[0-9a-f-]{36}$/,
    );
    await page.getByRole('button', { name: 'Close customer details' }).click();
    await expect(panel).toHaveCount(0);
    await expect(chat).toBeVisible();
  });

  test('wide screens show the Inbox navigation column instead of repeating tabs and chips', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/inbox');
    const nav = page.getByRole('navigation', { name: 'Inbox navigation' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Conversation status' })).toHaveCount(0);
    // A view and a channel combine.
    const listRequest = page.waitForRequest(
      (r) => /view=unread/.test(r.url()) && /channel=WHATSAPP/.test(r.url()),
    );
    await nav.getByRole('button', { name: 'Unread' }).click();
    await nav.getByRole('button', { name: 'WhatsApp' }).click();
    await listRequest;
    await expect(nav.getByRole('button', { name: 'WhatsApp' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('assign menu paints above messages and stays in the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/inbox');
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('button', { name: /Assign conversation|Change assignee/ }).click();
    const menu = page.getByRole('menu', { name: 'Assign conversation' });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    // Whatever is drawn at the menu's centre must belong to the menu, not a message bubble.
    const onTop = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height - 12));
    });
    expect(onTop).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('saved replies picker searches and inserts at the cursor, keeping the draft', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const box = page.getByRole('textbox', { name: /Reply to Tanvir/ });
    await box.fill('Hello');
    await page.getByRole('button', { name: 'Saved replies' }).click();
    const search = page.getByRole('searchbox', { name: 'Search saved replies' });
    await search.fill('zzz');
    await expect(page.getByText('No saved replies match')).toBeVisible();
    await search.fill('thank');
    await page.getByRole('listitem').filter({ hasText: 'Thank you' }).click();
    await expect(box).toHaveValue('Hello Thanks, Tanvir!');
    await expect(box).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Saved replies' })).toHaveCount(0);
  });

  test('create order drawer: catalog product with variant, conversation linked, summary drafted', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const box = page.getByRole('textbox', { name: /Reply to Tanvir/ });
    await box.fill('Sure!');
    await page.getByRole('button', { name: 'Create order' }).click();
    const drawer = page.getByRole('dialog', { name: 'Create order' });
    // Customer comes from the conversation; nothing valid yet, so the button waits.
    await expect(drawer.getByText('Tanvir Hasan')).toBeVisible();
    const create = drawer.getByRole('button', { name: 'Create order' });
    await expect(create).toBeDisabled();

    await drawer.getByRole('combobox', { name: 'Search catalog' }).fill('vase');
    await drawer.getByRole('option', { name: /Nordic Ceramic Vase/ }).click();
    await drawer.getByRole('combobox', { name: 'Colour' }).selectOption('Sage');
    await drawer.getByRole('button', { name: 'Add to order' }).click();
    await expect(drawer.getByRole('textbox', { name: /Product name/ })).toHaveValue(
      'Nordic Ceramic Vase (Sage)',
    );
    await expect(drawer.getByRole('textbox', { name: 'Item 1 amount' })).toHaveValue('1450.00');
    await drawer.getByRole('button', { name: 'Increase quantity of item 1' }).click();
    await expect(drawer.getByText('৳2,900')).toHaveCount(2); // subtotal and total

    const created = page.waitForRequest(
      (r) => r.method() === 'POST' && /\/orders$/.test(new URL(r.url()).pathname),
    );
    await create.click();
    const body = (await created).postDataJSON() as {
      conversationId?: string;
      currency: string;
      items: { name: string; quantity: number; unitPriceMinor: number }[];
    };
    expect(body.conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.items).toEqual([
      { name: 'Nordic Ceramic Vase (Sage)', quantity: 2, unitPriceMinor: 145000 },
    ]);
    await expect(drawer).toHaveCount(0);
    await expect(page.getByText(/Order #\d+ created/)).toBeVisible();
    // The summary goes into the draft after what was typed; nothing is sent.
    await expect(box).toHaveValue(/^Sure!\n\nOrder #\d+\n/);
  });

  test('create order drawer: manual item, Escape closes without saving', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('button', { name: 'Create order' }).click();
    const drawer = page.getByRole('dialog', { name: 'Create order' });
    await drawer.getByRole('textbox', { name: 'Item 1 amount' }).fill('abc');
    await expect(drawer.getByRole('alert')).toContainText('valid unit price');
    await expect(drawer.getByRole('button', { name: 'Create order' })).toBeDisabled();
    await drawer.getByRole('textbox', { name: 'Item 1 amount' }).fill('250');
    await expect(drawer.getByRole('button', { name: 'Create order' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Chat with Tanvir Hasan' })).toBeVisible();
  });

  test('customer panel: no lead yet, Create lead links it to this customer', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page
      .getByRole('region', { name: 'Chat with Tanvir Hasan' })
      .getByRole('button', { name: 'Tanvir Hasan', exact: true })
      .click();
    const panel = page.locator('aside[aria-label="Customer profile"]');
    await expect(panel.getByText('No lead for this customer yet.')).toBeVisible();
    const created = page.waitForRequest(
      (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/leads'),
    );
    await panel.getByRole('button', { name: 'Create lead' }).click();
    const body = (await created).postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Tanvir Hasan', source: 'WHATSAPP', stage: 'NEW' });
    expect(body.customerId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText('Lead created')).toBeVisible();
  });

  test('customer panel: lead stage edits the same lead record the Leads Centre uses', async ({
    page,
  }) => {
    const leadId = '99999999-9999-4999-8999-0000000000aa';
    // Only the panel's per-customer request gets this lead; the mock filters everything else.
    await page.route(/\/leads\?.*customerId=/, (route) =>
      route.fulfill({
        json: {
          data: [
            {
              id: leadId,
              name: 'Tanvir Hasan',
              email: null,
              phone: null,
              company: null,
              jobTitle: null,
              source: 'WHATSAPP',
              stage: 'CONTACTED',
              owner: null,
              tags: [],
              dealValue: null,
              score: 40,
              notes: '',
              customerId: 'dddddddd-dddd-4ddd-8ddd-000000000001',
              conversationId: null,
              lastActivityAt: '2026-11-01T00:00:00.000Z',
              createdAt: '2026-11-01T00:00:00.000Z',
            },
          ],
          meta: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
        },
      }),
    );
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('button', { name: 'Open customer profile' }).click();
    const panel = page.locator('aside[aria-label="Customer profile"]');
    const stage = panel.getByRole('combobox', { name: 'Lead stage' });
    await expect(stage).toHaveValue('CONTACTED');
    const patched = page.waitForRequest(
      (r) => r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/leads/${leadId}`),
    );
    await stage.selectOption('WON');
    expect((await patched).postDataJSON()).toEqual({ stage: 'WON' });
    await expect(panel.getByRole('link', { name: 'View in Leads' })).toHaveAttribute(
      'href',
      `/leads?lead=${leadId}`,
    );
  });
});
