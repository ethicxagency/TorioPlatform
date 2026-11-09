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

  test('Connect Channel never pretends to connect when Meta is not configured', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Connect Channel' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Connect your channels' });
    await expect(dlg.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled();
    await expect(dlg.getByText(/Nothing was connected/).first()).toBeVisible();
    await dlg.getByRole('button', { name: /Set up a new WhatsApp number/ }).click();
    await expect(dlg.getByText(/isn.t configured/).last()).toBeVisible();
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

  test('Continue with Facebook starts one authorization for every channel; the browser only gets a URL', async ({
    page,
  }) => {
    channelState.metaConfigured = true;
    await page.route('https://www.facebook.com/**', (r) => r.fulfill({ body: 'meta' }));
    await page.getByRole('button', { name: 'Connect Channel' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Connect your channels' });
    await dlg.getByText('What Facebook will ask for, and why').click();
    await expect(dlg.getByText(/Receive and answer Messenger messages/)).toBeVisible();
    await dlg.getByRole('button', { name: 'Continue with Facebook' }).click();
    await expect(page).toHaveURL(/facebook\.com\/v27\.0\/dialog\/oauth/);
    expect(channelState.starts).toEqual([{}]);
  });

  test('returning from Facebook: pick several assets, see per-channel results, retry only the failure', async ({
    page,
  }) => {
    channelState.failKeys = ['INSTAGRAM:222'];
    await page.goto('/channels?meta_session=aaaaaaaa-0000-4000-8000-000000000001');
    const dlg = page.getByRole('dialog', { name: 'Choose what to connect' });
    await expect(dlg.getByRole('checkbox', { name: /Old Shop Page/ })).toBeDisabled();
    await expect(dlg.getByText('Already connected to a workspace')).toBeVisible();
    await expect(dlg.getByRole('checkbox', { name: /\+880 1711-000002/ })).toBeDisabled();
    await expect(dlg.getByText(/Finish setup with WhatsApp Embedded Signup/)).toBeVisible();
    await dlg.getByRole('button', { name: /Select all eligible \(3\)/ }).click();
    await dlg.getByRole('button', { name: 'Connect 3' }).click();
    await expect.poll(() => channelState.selects.length).toBe(1);
    expect(channelState.selects[0]).toEqual({
      candidateKeys: ['MESSENGER:111', 'INSTAGRAM:222', 'WHATSAPP:444'],
    });
    // one failed, two connected: the failure shows its own reason and is the only thing left to retry
    await expect(dlg.getByRole('alert').filter({ hasText: /Couldn.t subscribe/ })).toBeVisible();
    await expect(dlg.getByText('Connected', { exact: true })).toHaveCount(2);
    await dlg.getByRole('button', { name: 'Retry 1' }).click();
    await expect.poll(() => channelState.selects.length).toBe(2);
    expect(channelState.selects[1]).toEqual({ candidateKeys: ['INSTAGRAM:222'] });
    const done = page.getByRole('dialog', { name: 'Your channels are connected' });
    await expect(done).toBeVisible();
    await expect(done.getByRole('link', { name: 'Open Inbox' })).toHaveAttribute('href', '/inbox');
    await done.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL(/\/channels$/);
    expect(channelState.cancels).toHaveLength(0);
  });

  test('cancelling the selection discards the parked authorization', async ({ page }) => {
    await page.goto('/channels?meta_session=aaaaaaaa-0000-4000-8000-000000000002');
    const dlg = page.getByRole('dialog', { name: 'Choose what to connect' });
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => channelState.cancels.length).toBe(1);
    expect(channelState.selects).toHaveLength(0);
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
    expect(channelState.starts).toEqual([{ products: ['INSTAGRAM'] }]);
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
