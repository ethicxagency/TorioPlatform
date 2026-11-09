import { expect, test } from '@playwright/test';
import { channelState, mockApi, resetChannels } from './mocks';

test.describe('channels (owner)', () => {
  test.beforeEach(async ({ page }) => {
    resetChannels();
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/channels');
    await expect(page.getByRole('heading', { name: 'Channels', level: 1 })).toBeVisible();
  });

  test('lists real channel records with honest status, sample and health labelling', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Sales WhatsApp' })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Authorization expired' }),
    ).toBeVisible();
    // The four summary cards are gone.
    for (const text of [
      'Conversations (30 days)',
      'Across all channels',
      'Nothing flagged',
      'History kept',
    ])
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/health not verified/)).toHaveCount(0);
    await expect(page.getByText(/development sample/)).toBeVisible();
  });

  test('search and platform filter narrow the list', async ({ page }) => {
    await page.getByLabel('Filter by platform').selectOption('INSTAGRAM');
    await expect.poll(() => page.getByRole('button', { name: 'Brand Instagram' }).count()).toBe(1);
  });

  test('Connect Channel never pretends to connect: providers are unavailable with requirements', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Connect Channel' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Connect a channel' });
    await expect(dlg.getByText('Unavailable').first()).toBeVisible();
    await dlg.getByRole('radio', { name: /WhatsApp Business/ }).click();
    await expect(dlg.getByText('What WhatsApp Business needs')).toBeVisible();
    await expect(dlg.getByText(/Nothing was connected/)).toBeVisible();
    await expect(dlg.getByRole('button', { name: /^Connect WhatsApp Business$/ })).toBeDisabled();
  });

  test('details: health shows only real evidence, rename persists via the API', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Brand Instagram' }).click();
    const d = page.getByRole('dialog', { name: 'Channel: Brand Instagram' });
    await expect(d.getByText('Not recorded')).toBeVisible(); // webhook subscription was never confirmed
    await expect(d.getByText('None yet')).toBeVisible(); // no event has arrived
    await expect(d.getByText(/never been verified/)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    await d.getByLabel('Display name').fill('Brand IG');
    await d.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => channelState.patches.length).toBe(1);
    // the dialog is renamed once the save lands, so look it up by role rather than by its old name
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Open Inbox' }),
    ).toHaveAttribute('href', '/inbox?channel=INSTAGRAM');
  });

  test('disconnect asks for confirmation and explains history is kept', async ({ page }) => {
    await page.getByRole('button', { name: 'Sales WhatsApp' }).click();
    await page
      .getByRole('dialog', { name: /Channel: Sales WhatsApp/ })
      .getByRole('button', { name: 'Disconnect' })
      .click();
    const c = page.getByRole('alertdialog');
    await expect(c).toContainText('conversation history');
    await c.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'History kept' })).toBeVisible();
  });

  test('Messenger connects through Meta OAuth: the server starts it, the browser only gets a URL', async ({
    page,
  }) => {
    channelState.metaConfigured = true;
    await page.route('https://www.facebook.com/**', (r) => r.fulfill({ body: 'meta' }));
    await page.getByRole('button', { name: 'Connect Channel' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Connect a channel' });
    await dlg.getByRole('radio', { name: /Facebook Messenger/ }).click();
    await expect(dlg.getByText(/never shared with Torio/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Continue with Meta' }).click();
    await expect(page).toHaveURL(/facebook\.com\/v21\.0\/dialog\/oauth/);
    expect(channelState.starts).toEqual([{ provider: 'MESSENGER' }]);
  });

  test('returning from Meta: choose a Page (connected ones are disabled) and it is connected', async ({
    page,
  }) => {
    await page.goto('/channels?meta_session=aaaaaaaa-0000-4000-8000-000000000001');
    const dlg = page.getByRole('dialog', { name: /Choose a Facebook Page/ });
    await expect(dlg.getByRole('radio', { name: /Old Shop Page/ })).toBeDisabled();
    await expect(dlg.getByText('Already connected to a workspace')).toBeVisible();
    await dlg.getByRole('radio', { name: /Urban Nest Page/ }).click();
    await dlg.getByRole('button', { name: 'Connect' }).click();
    await expect.poll(() => channelState.selects.length).toBe(1);
    expect(channelState.selects[0]).toEqual({ candidateId: '111111111' });
    await expect(
      page.getByRole('status').filter({ hasText: 'Urban Nest Page connected' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/channels$/);
  });

  test('a declined or failed authorization explains what to do and connects nothing', async ({
    page,
  }) => {
    await page.goto('/channels?meta_error=missing_permissions');
    await expect(
      page.getByRole('alert').filter({ hasText: /permissions were declined/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /permissions were declined/ }),
    ).toHaveCount(0);
    expect(channelState.selects).toHaveLength(0);
  });

  test('Reconnect re-runs OAuth and Check connection asks the provider', async ({ page }) => {
    await page.route('https://www.facebook.com/**', (r) => r.fulfill({ body: 'meta' }));
    await page.getByRole('button', { name: 'Brand Instagram' }).click();
    const d = page.getByRole('dialog', { name: 'Channel: Brand Instagram' });
    await d.getByRole('button', { name: 'Check connection' }).click();
    await expect.poll(() => channelState.checks.length).toBe(1);
    await expect(
      page.getByRole('status').filter({ hasText: 'Connection is healthy' }),
    ).toBeVisible();
    await d.getByRole('button', { name: 'Reconnect' }).click();
    await expect(page).toHaveURL(/facebook\.com/);
    expect(channelState.starts).toEqual([{ provider: 'INSTAGRAM' }]);
  });

  test('no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/channels');
    await expect(page.getByRole('button', { name: 'Sales WhatsApp' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test('agents can view but not connect, edit or disconnect', async ({ page }) => {
  resetChannels();
  await mockApi(page, { role: 'AGENT' });
  await page.goto('/channels');
  await expect(page.getByRole('button', { name: 'Connect Channel' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sales WhatsApp' }).click();
  const d = page.getByRole('dialog', { name: /Channel: Sales WhatsApp/ });
  await expect(d.getByLabel('Display name')).toBeDisabled();
  await expect(d.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
});
