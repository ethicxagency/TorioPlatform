import { expect, test } from '@playwright/test';
import { customerRequests, mockApi } from './mocks';

test.describe('customers', () => {
  test.beforeEach(async ({ page }) => {
    customerRequests.length = 0;
    await mockApi(page);
    await page.goto('/customers');
  });

  test('shows real KPIs, marks order-based metrics unavailable, lists customers', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Customers', level: 1 })).toBeVisible();
    await expect(page.getByRole('row', { name: /Tanvir Hasan/ })).toBeVisible();
    await expect(page.getByText('Available once Orders is built').first()).toBeVisible();
  });

  test('search and segment changes are sent to the server', async ({ page }) => {
    await expect(page.getByRole('row', { name: /Tanvir Hasan/ })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search customers' }).fill('tanvir');
    await expect.poll(() => customerRequests.some((r) => r.includes('q=tanvir'))).toBe(true);
    await page.getByRole('button', { name: 'Recently active' }).click();
    await expect.poll(() => customerRequests.some((r) => r.includes('segment=recent'))).toBe(true);
  });

  test('order-based segments are disabled, not faked', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'High-value' })).toBeDisabled();
  });

  test('profile drawer shows data, an Open conversation action, and closes with Escape', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /Tanvir Hasan/ }).click();
    const drawer = page.getByRole('dialog', { name: /Customer profile: Tanvir Hasan/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Open conversation' })).toBeVisible();
    await expect(drawer.getByText(/Orders, lifetime value/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('add customer validates then confirms creation from the server', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Customer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add customer' });
    await dialog.getByRole('button', { name: 'Save customer' }).click();
    await expect(dialog.getByText('Full name is required')).toBeVisible();
    await dialog.getByLabel('Full name *').fill('New Person');
    await dialog.getByLabel('Email').fill('nope');
    await dialog.getByRole('button', { name: 'Save customer' }).click();
    await expect(dialog.getByText(/valid email|Invalid email/i).first()).toBeVisible();
    await dialog.getByLabel('Email').fill('new@example.test');
    await dialog.getByRole('button', { name: 'Save customer' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Customer added');
  });

  test('selection shows a bulk toolbar scoped to the selected rows', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select Tanvir Hasan' }).click();
    const bar = page.getByRole('toolbar', { name: 'Bulk actions' });
    await expect(bar).toContainText('1 selected');
    await bar.getByRole('button', { name: 'Clear selection' }).click();
    await expect(bar).toHaveCount(0);
  });

  test('no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customers');
    await expect(page.getByRole('checkbox', { name: 'Select Tanvir Hasan' }).first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});
