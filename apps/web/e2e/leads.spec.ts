import { expect, test } from '@playwright/test';
import { leadRequests, mockApi } from './mocks';

test.describe('leads', () => {
  test.beforeEach(async ({ page }) => {
    leadRequests.length = 0;
    await mockApi(page);
    await page.goto('/leads');
  });

  test('shows real KPIs and the lead table', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Leads', level: 1 })).toBeVisible();
    await expect(page.getByRole('row', { name: /Nusrat Jahan/ })).toBeVisible();
    await expect(page.getByText('No closed leads yet')).toBeVisible(); // conversion rate is null, not invented
  });

  test('search is debounced and sent to the server', async ({ page }) => {
    await expect(page.getByRole('row', { name: /Nusrat Jahan/ })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search leads' }).fill('imran');
    await expect.poll(() => leadRequests.some((r) => r.includes('q=imran'))).toBe(true);
  });

  test('filters are sent to the server and shown as removable chips', async ({ page }) => {
    await expect(page.getByRole('row', { name: /Nusrat Jahan/ })).toBeVisible();
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('button', { name: 'Qualified', exact: true }).click();
    await expect.poll(() => leadRequests.some((r) => r.includes('stages=QUALIFIED'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Lead filters' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove filter Qualified' }).click();
    await expect(page.getByRole('button', { name: 'Remove filter Qualified' })).toHaveCount(0);
  });

  test('?lead=<id> opens that lead (deep link from the Inbox panel)', async ({ page }) => {
    await page.goto('/leads?lead=99999999-9999-4999-8999-000000000001');
    await expect(page.getByRole('dialog', { name: /Lead details: Nusrat Jahan/ })).toBeVisible();
  });

  test('opens the details drawer and closes it with Escape', async ({ page }) => {
    await page.getByRole('row', { name: /Nusrat Jahan/ }).click();
    const drawer = page.getByRole('dialog', { name: /Lead details: Nusrat Jahan/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Lead created (whatsapp)')).toBeVisible();
    await expect(drawer.getByText('No linked conversation')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('add lead validates, then confirms creation from the server', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Lead' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add lead' });
    await dialog.getByRole('button', { name: 'Save lead' }).click();
    await expect(dialog.getByText('Full name is required')).toBeVisible();
    await dialog.getByLabel('Full name *').fill('Test Person');
    await dialog.getByLabel('Phone (with country code)').fill('abc');
    await dialog.getByRole('button', { name: 'Save lead' }).click();
    await expect(dialog.getByText(/valid phone/)).toBeVisible();
    await dialog.getByLabel('Phone (with country code)').fill('+880 1712 345678');
    await dialog.getByRole('button', { name: 'Save lead' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Lead added');
  });

  test('selecting rows shows the bulk toolbar', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select Nusrat Jahan' }).click();
    const bar = page.getByRole('toolbar', { name: 'Bulk actions' });
    await expect(bar).toContainText('1 selected');
    await bar.getByRole('button', { name: 'Clear selection' }).click();
    await expect(bar).toHaveCount(0);
  });

  test('pipeline view lists stages with counts', async ({ page }) => {
    await page.getByRole('radio', { name: 'Pipeline' }).click();
    await expect(page.getByRole('region', { name: 'Qualified, 1 leads' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Won, 0 leads' })).toBeVisible();
  });

  test('no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/leads');
    await expect(
      page
        .getByRole('button', { name: 'Select Nusrat Jahan' })
        .or(page.getByRole('checkbox', { name: 'Select Nusrat Jahan' }))
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});
