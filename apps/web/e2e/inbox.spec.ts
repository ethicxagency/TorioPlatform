import { expect, test } from '@playwright/test';
import {
  aiState,
  inboxState,
  mockApi,
  orderListItem,
  orderState,
  resetAi,
  resetOrders,
} from './mocks';

test.describe('inbox', () => {
  test.beforeEach(async ({ page }) => {
    resetAi();
    await mockApi(page);
    await page.goto('/inbox');
  });

  test('lists conversations with real counts and no fake data labels', async ({ page }) => {
    await expect(page.getByRole('option', { name: /Tanvir Hasan/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Status: Open (2)' })).toBeVisible();
    await page.getByRole('button', { name: /^Status:/ }).click();
    await expect(
      page.getByRole('listbox', { name: 'Status' }).getByRole('option', { name: /Snoozed/ }),
    ).toContainText('0');
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
    await expect(page.getByRole('button', { name: 'Status: Open (2)' })).toBeVisible();
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
    aiState.options = {
      available: false,
      reason: 'AI Assist is not set up yet.',
      modes: [],
      recommended: null,
    };
    await page.getByRole('button', { name: 'AI Assist' }).click();
    const panel = page.getByRole('region', { name: 'AI Assist' });
    await expect(panel.getByText(/AI Assist is not set up yet/)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Suggest a reply' })).toHaveCount(0); // nothing is faked
  });

  test('AI Assist prepares one draft for review; inserting it does not send anything', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const sends: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/messages/.test(r.url())) sends.push(r.url());
    });
    await page.getByRole('button', { name: 'AI Assist', exact: true }).click();
    const panel = page.getByRole('region', { name: 'AI Assist' });
    await panel.getByRole('button', { name: 'Suggest a reply' }).click();
    const box = panel.getByRole('textbox', { name: 'Suggested reply' });
    await expect(box).toHaveValue(aiState.draftText);
    expect(aiState.drafts[0]).toMatchObject({ mode: 'auto' });
    await expect(panel.getByText('Auto (Recommended)').last()).toBeVisible();
    await expect(panel.getByText('OpenAI').last()).toBeVisible();
    await expect(panel.getByText('2.3s')).toBeVisible();
    await box.fill('Hello Tanvir, the Linen sofa is $400.00.'); // the agent edits it
    await panel.getByRole('button', { name: 'Insert into composer' }).click();
    await expect(page.getByRole('textbox', { name: /Reply to Tanvir/ })).toHaveValue(
      'Hello Tanvir, the Linen sofa is $400.00.',
    );
    expect(sends).toHaveLength(0); // inserting is not sending
  });

  test('AI Assist offers refinements, keeps the draft when a regenerate fails, and explains unavailable modes', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('button', { name: 'AI Assist', exact: true }).click();
    const panel = page.getByRole('region', { name: 'AI Assist' });
    await panel.getByRole('button', { name: 'Suggest a reply' }).click();
    const box = panel.getByRole('textbox', { name: 'Suggested reply' });
    await expect(box).toHaveValue(aiState.draftText);
    await panel.getByRole('button', { name: 'Make shorter' }).click();
    await expect(box).toHaveValue(`${aiState.draftText} (shorter)`);
    expect(aiState.drafts.at(-1)).toMatchObject({
      refine: 'shorter',
      previousDraft: aiState.draftText,
    });
    const before = await box.inputValue();
    aiState.draftFail = 'The AI service is busy right now. Try again in a moment.';
    await panel.getByRole('button', { name: 'Regenerate' }).first().click();
    await expect(panel.getByRole('alert')).toContainText('busy right now');
    await expect(box).toHaveValue(before); // nothing the agent was reading is lost
    await panel.getByRole('combobox', { name: 'AI mode' }).click();
    const synth = page.getByRole('option', { name: /Multi-AI Synthesis/ });
    await expect(synth).toHaveAttribute('aria-disabled', 'true');
    await expect(synth).toContainText('Needs two AI providers');
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

  test('channel tabs sit below the Inbox heading, above the toolbar, and filter the list', async ({
    page,
  }) => {
    const tabs = page.getByRole('tablist', { name: 'Channels' });
    for (const name of ['All messages', 'Messenger', 'Instagram', 'WhatsApp'])
      await expect(tabs.getByRole('tab', { name })).toBeVisible();
    // Count badges come from the list response and say what they count; zero shows no badge.
    const all = tabs.getByRole('tab', { name: 'All messages, 2 open conversations' });
    await expect(all).toBeVisible();
    await expect(all).toContainText('2');
    await expect(tabs.getByRole('tab', { name: 'WhatsApp, 1 open conversation' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Messenger', exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ open · \d+ waiting/)).toHaveCount(0);
    const tabsBox = await tabs.boundingBox();
    const headingBox = await page.getByRole('heading', { name: 'Inbox', level: 1 }).boundingBox();
    const searchBox = await page
      .getByRole('searchbox', { name: 'Search conversations' })
      .boundingBox();
    expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(tabsBox!.y);
    expect(tabsBox!.y + tabsBox!.height).toBeLessThanOrEqual(searchBox!.y);

    // Switching channel keeps unrelated filters (search) and writes ?channel=.
    await page.getByRole('searchbox', { name: 'Search conversations' }).fill('tan');
    const req = page.waitForRequest(
      (r) => /channel=WHATSAPP/.test(r.url()) && /q=tan/.test(r.url()),
    );
    await tabs.getByRole('tab', { name: 'WhatsApp' }).click();
    await req;
    await expect(page).toHaveURL(/channel=WHATSAPP/);
    await expect(tabs.getByRole('tab', { name: 'WhatsApp' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('searchbox', { name: 'Search conversations' })).toHaveValue('tan');

    // Arrow keys move between channels; All messages drops the param.
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.getByRole('tab', { name: 'Instagram' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tabs.getByRole('tab', { name: 'All messages' }).click();
    await expect(page).not.toHaveURL(/channel=/);
  });

  test('no attachment button in the composer', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('button', { name: /Attach file/ })).toHaveCount(0);
  });

  test('composer actions are icon-only until hovered, then show their label', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    for (const name of ['Create order', 'Saved replies', 'Insert emoji']) {
      const btn = page.getByRole('button', { name, exact: true });
      const label = btn.locator('span[aria-hidden]');
      const rest = (await btn.boundingBox())!.width;
      await btn.hover();
      await expect(label).toBeVisible();
      await expect.poll(async () => (await btn.boundingBox())!.width).toBeGreaterThan(rest + 20);
      await page.mouse.move(0, 0);
    }
  });

  test('AI Assist has the AI look: gradient, glow, pressed state; ordinary buttons keep theirs', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const ai = page.getByRole('button', { name: 'AI Assist', exact: true });
    await expect(ai).toContainText('AI Assist');
    const look = await ai.evaluate((el) => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundImage, shadow: c.boxShadow, color: c.color };
    });
    expect(look.bg).toContain('linear-gradient');
    expect(look.shadow).not.toBe('none');
    expect(look.color).toBe('rgb(255, 255, 255)');
    // Send is an ordinary action: solid brand colour, no gradient
    const send = await page
      .getByRole('button', { name: 'Send', exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(send).toBe('none');
    await expect(ai).toHaveAttribute('aria-pressed', 'false');
    await ai.click();
    await expect(ai).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'AI Assist' })).toBeVisible();
  });

  test('AI Assist motion is switched off for reduced motion, and the label stays reachable on a phone', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const ai = page.getByRole('button', { name: 'AI Assist', exact: true });
    const sweep = () => ai.evaluate((el) => getComputedStyle(el, '::after').animationName);
    expect(await sweep()).toContain('ai-sweep');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ai.hover();
    expect(await ai.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await ai.evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'AI Assist', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
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

  test('Conversations and Status dropdowns sit between search and sort, and combine', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/inbox');
    // No separate navigation column, status tabs or view chips any more.
    await expect(page.getByRole('navigation', { name: 'Inbox navigation' })).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Conversation status' })).toHaveCount(0);

    const search = page.getByRole('searchbox', { name: 'Search conversations' });
    const views = page.getByRole('button', { name: /^Conversations:/ });
    const status = page.getByRole('button', { name: /^Status:/ });
    const sort = page.getByRole('button', { name: /^Sort:/ });
    const xs = await Promise.all(
      [
        search,
        views,
        status,
        sort,
        page.getByRole('button', { name: 'Manage conversations' }),
        page.getByRole('button', { name: 'Filters', exact: true }),
      ].map(async (l) => (await l.boundingBox())!.x),
    );
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);

    // Search and sort survive; view, status and channel combine in one request.
    await search.fill('tan');
    await sort.click();
    await page
      .getByRole('listbox', { name: 'Sort' })
      .getByRole('option', { name: /Newest/ })
      .click();
    const req = page.waitForRequest((r) =>
      ['view=unread', 'status=SNOOZED', 'channel=WHATSAPP', 'q=tan', 'order=newest'].every((p) =>
        r.url().includes(p),
      ),
    );
    await views.click();
    await page
      .getByRole('listbox', { name: 'Conversations' })
      .getByRole('option', { name: /Unread/ })
      .click();
    await status.click();
    // Keyboard works too: opening focuses Open; one step down is Snoozed.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page
      .getByRole('tablist', { name: 'Channels' })
      .getByRole('tab', { name: 'WhatsApp' })
      .click();
    await req;
    await expect(page.getByRole('button', { name: 'Conversations: Unread' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Status: Snoozed/ })).toBeVisible();
    await expect(search).toHaveValue('tan');
    await expect(page.getByRole('button', { name: 'Sort: Newest' })).toBeVisible();
    // Escape closes without changing the choice.
    await status.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox', { name: 'Status' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Status: Snoozed/ })).toBeVisible();
  });

  test('rows show no checkbox until Manage; Manage selects, acts in bulk and exits cleanly', async ({
    page,
  }) => {
    const row = page.getByRole('option', { name: /Tanvir Hasan/ });
    await row.hover();
    await expect(page.getByRole('checkbox', { name: /Select conversation/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Manage conversations' }).click();
    const bar = page.getByRole('toolbar', { name: 'Bulk actions' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Mark read' })).toBeDisabled();
    // In Manage mode a row click selects instead of opening the chat.
    await row.click();
    await expect(page.getByRole('region', { name: /^Chat with/ })).toHaveCount(0);
    await expect(
      page.getByRole('checkbox', { name: 'Select conversation with Tanvir Hasan' }),
    ).toHaveAttribute('aria-checked', 'true');
    const all = bar.getByRole('checkbox', { name: 'Select all' });
    await expect(all).toHaveAttribute('aria-checked', 'mixed');
    await expect(bar).toContainText('1 selected');
    await all.click();
    await expect(bar).toContainText('2 selected');

    await bar.getByRole('button', { name: 'Assign' }).click();
    await page
      .getByRole('menu', { name: 'Assign selected conversations' })
      .getByRole('menuitemradio', { name: /Nadia Islam/ })
      .click();
    await expect(page.getByText('Assigned to Nadia Islam · 2 conversations')).toBeVisible();
    await expect
      .poll(() => inboxState.bulks.at(-1))
      .toMatchObject({
        action: 'ASSIGN',
        assigneeId: 'ffffffff-0000-4000-8000-000000000002',
      });
    expect((inboxState.bulks.at(-1) as { ids: string[] }).ids).toHaveLength(2);

    // Selection cleared after an action; pick one again and set its priority.
    await expect(all).toHaveAttribute('aria-checked', 'false');
    await row.click();
    await bar.getByRole('button', { name: 'Priority' }).click();
    await page
      .getByRole('menu', { name: 'Set priority' })
      .getByRole('menuitem', { name: 'Urgent' })
      .click();
    await expect
      .poll(() => inboxState.bulks.at(-1))
      .toMatchObject({ action: 'SET_PRIORITY', priority: 'HIGH' });

    await row.click();
    await bar.getByRole('button', { name: 'Mark unread' }).click();
    await expect.poll(() => inboxState.bulks.at(-1)).toMatchObject({ action: 'MARK_UNREAD' });

    // Done leaves Manage mode; rows open conversations again.
    await bar.getByRole('button', { name: 'Done' }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /Select conversation/ })).toHaveCount(0);
    await row.click();
    await expect(page.getByRole('region', { name: 'Chat with Tanvir Hasan' })).toBeVisible();
  });

  test('filters panel: searchable agent and tag, priority, clear all; other filters survive', async ({
    page,
  }) => {
    await page.getByRole('searchbox', { name: 'Search conversations' }).fill('a');
    await page
      .getByRole('tablist', { name: 'Channels' })
      .getByRole('tab', { name: 'WhatsApp' })
      .click();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Advanced filters' });

    await panel.getByRole('button', { name: 'Assigned agent: Any agent' }).click();
    await page.getByRole('combobox', { name: 'Search assigned agent' }).fill('nad');
    await expect(panel.getByRole('option', { name: 'Farid Ahmed' })).toHaveCount(0);
    const byAgent = page.waitForRequest(
      (r) =>
        r.url().includes('assigneeId=ffffffff-0000-4000-8000-000000000002') &&
        r.url().includes('channel=WHATSAPP') &&
        r.url().includes('q=a'),
    );
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await byAgent;

    await panel.getByRole('button', { name: 'Tag: Any tag' }).click();
    await expect(panel.getByRole('option', { name: 'Hot Lead' })).toBeVisible();
    // Escape closes only the tag list, not the panel.
    await page.keyboard.press('Escape');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Tag: Any tag' }).click();
    const byTag = page.waitForRequest(
      (r) => r.url().includes('tag=vip') && r.url().includes('assigneeId='),
    );
    await panel.getByRole('option', { name: 'vip' }).click();
    await byTag;

    const byPriority = page.waitForRequest(
      (r) => r.url().includes('priority=HIGH') && r.url().includes('tag=vip'),
    );
    await panel.getByRole('radio', { name: 'Urgent' }).click();
    await byPriority;
    await expect(page.getByRole('button', { name: 'Filters, 3 applied' })).toBeVisible();

    await panel.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search conversations' })).toHaveValue('a');
    await expect(page).toHaveURL(/channel=WHATSAPP/);
  });

  test('the five labelled toolbar controls share one row on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/inbox');
    const controls = [
      page.getByRole('button', { name: /^Conversations:/ }),
      page.getByRole('button', { name: /^Status:/ }),
      page.getByRole('button', { name: /^Sort:/ }),
      page.getByRole('button', { name: 'Manage conversations' }),
      page.getByRole('button', { name: 'Filters', exact: true }),
    ];
    const ys = await Promise.all(controls.map(async (c) => Math.round((await c.boundingBox())!.y)));
    expect(new Set(ys).size).toBe(1);
    // Manage and Filters keep their text labels.
    await expect(controls[3]).toContainText('Manage');
    await expect(controls[4]).toContainText('Filters');
    await expect(controls[2]).toContainText('Longest wait');
  });

  test('toolbar wraps on a phone without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/inbox');
    await expect(page.getByRole('button', { name: /^Status:/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('details panel: pinned identity, linked contact rows, collapsible sections, searchable assignee', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('button', { name: 'Open customer profile' }).click();
    const panel = page.locator('aside[aria-label="Customer profile"]');
    await expect(panel.getByRole('heading', { name: 'Tanvir Hasan', level: 2 })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'View full profile' })).toBeVisible();
    // Phone and email are real links with copy actions.
    await expect(panel.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
    await expect(panel.getByRole('button', { name: 'Copy email' })).toBeVisible();
    // Sections collapse and expand from their whole header row.
    const contact = panel.getByRole('button', { name: 'Contact' });
    await expect(contact).toHaveAttribute('aria-expanded', 'true');
    await contact.click();
    await expect(contact).toHaveAttribute('aria-expanded', 'false');
    await contact.click();
    // Conversation status and the channel read at a glance; the assignee picker is searchable.
    await expect(panel.getByText('Open', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: /^Assigned agent:/ }).click();
    await expect(panel.getByRole('combobox', { name: 'Search assigned agent' })).toBeVisible();
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

  test('create order modal: catalog product with variant, conversation linked, summary drafted', async ({
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

  test('create order modal: centered, outside click asks before discarding typed work', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const trigger = page.getByRole('button', { name: 'Create order' });
    await trigger.click();
    const modal = page.getByRole('dialog', { name: 'Create order' });
    await expect(modal).toBeVisible();
    // Centered, 520-600px wide, with the conversation still behind it.
    const box = (await modal.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.width).toBeGreaterThanOrEqual(520);
    expect(box.width).toBeLessThanOrEqual(600);
    expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(2);
    await expect(page.getByRole('region', { name: 'Chat with Tanvir Hasan' })).toBeVisible();
    await expect(modal.getByText('Tanvir Hasan')).toBeVisible();
    // Untouched: an outside click closes it, and focus returns to the trigger.
    await page.mouse.click(5, 5);
    await expect(modal).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // With work in progress the outside click asks first.
    await trigger.click();
    await modal.getByLabel(/Description/).fill('Gift wrap please');
    await page.mouse.click(5, 5);
    await expect(page.getByRole('alertdialog')).toContainText('Discard this order?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).toBeVisible();
  });

  test('conversation header: channel, status, waiting time and a copyable phone', async ({
    page,
  }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const header = page.getByRole('region', { name: 'Chat with Tanvir Hasan' }).locator('header');
    await expect(header.getByRole('heading', { name: 'Tanvir Hasan' })).toBeVisible();
    await expect(header.getByText('WhatsApp', { exact: true })).toBeVisible();
    await expect(header.getByText('Open', { exact: true })).toBeVisible();
    await expect(header.getByText(/^Waiting /)).toBeVisible();
    await expect(header.getByRole('button', { name: /^Copy phone number:/ })).toBeVisible();
  });

  test('create order modal: manual item, Escape closes without saving', async ({ page }) => {
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
    const stage = panel.getByRole('button', { name: /^Lead stage:/ });
    await expect(stage).toContainText('Contacted');
    const patched = page.waitForRequest(
      (r) => r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/leads/${leadId}`),
    );
    await stage.click();
    await expect(panel.getByRole('option')).toHaveCount(6);
    await expect(panel.getByRole('option', { name: 'Contacted' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await panel.getByRole('option', { name: 'Won' }).click();
    expect((await patched).postDataJSON()).toEqual({ stage: 'WON' });
    await expect(panel.getByRole('link', { name: 'View in Leads' })).toHaveAttribute(
      'href',
      `/leads?lead=${leadId}`,
    );
    // Orders belong to the customer: with several of them there is no single order to change from here.
    await expect(panel.getByText(/orders\b.*set each from its order|No orders yet/)).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Order status:/ })).toHaveCount(0);
  });

  test('customer panel: order status follows the order lifecycle for a single order', async ({
    page,
  }) => {
    resetOrders();
    const leadId = '99999999-9999-4999-8999-0000000000aa';
    const pending = orderState.list.find((o) => o.number === 1002)!;
    await page.route(/\/orders\?.*customerId=/, (route) =>
      route.fulfill({
        json: {
          data: [orderListItem(pending)],
          meta: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
        },
      }),
    );
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
              stage: 'NEW',
              owner: null,
              tags: [],
              dealValue: null,
              score: 10,
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
    const status = panel.getByRole('button', { name: /^Order status:/ });
    await expect(status).toContainText('Pending');
    await status.click();
    // Only the real lifecycle step is pickable; cancelling and skipping ahead are disabled with a reason.
    await expect(panel.getByRole('option', { name: 'Processing' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(panel.getByRole('option', { name: 'Cancelled' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await panel.getByRole('option', { name: 'Confirmed' }).click();
    await expect.poll(() => orderState.statuses.length).toBe(1);
    expect(orderState.statuses[0]).toEqual({ status: 'CONFIRMED' });
    await expect(panel.getByRole('link', { name: /#1002/ })).toHaveAttribute('href', /\/orders\//);
  });
});
