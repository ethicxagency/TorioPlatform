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
    await expect(page.getByText('Needs attention').first()).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Authorization expired' }),
    ).toBeVisible();
    await expect(page.getByText(/health not verified/)).toBeVisible();
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

  test('details: health is "not monitored", reconnect is unavailable, rename persists via the API', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Brand Instagram' }).click();
    const d = page.getByRole('dialog', { name: 'Channel: Brand Instagram' });
    await expect(d.getByText('Not monitored yet').first()).toBeVisible();
    await expect(d.getByText(/never been verified/)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Reconnect' })).toBeDisabled();
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
