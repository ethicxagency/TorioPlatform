import { expect, test } from '@playwright/test';
import { mockApi } from './mocks';

test.describe('dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('renders KPIs and all widget sections', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Dashboard · Torio');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('1,284').first()).toBeVisible();
    for (const name of [
      'Conversation Overview',
      'Needs Attention',
      'Channel Performance',
      'AI Performance',
      'Recent Conversations',
      'Recent Orders',
      'Leads & Sales Funnel',
      'Team Activity',
    ]) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
  });

  test('channel filter updates the numbers', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Channel', { exact: true }).selectOption('whatsapp');
    await expect(page.getByText('668').first()).toBeVisible();
  });

  test('order drawer opens from Recent Orders and closes with Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /#ORD-10351/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Order details' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Cash on delivery')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('customize panel hides a section', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Customize' }).click();
    await page.getByRole('checkbox', { name: 'Team Activity' }).click();
    await expect(page.getByRole('region', { name: 'Team Activity' })).toBeHidden();
  });

  test('error and empty demo states render', async ({ page }) => {
    await page.goto('/?demo=error');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Some dashboard data failed to load' }),
    ).toBeVisible();
    await page.goto('/?demo=empty');
    await expect(page.getByText('No conversations yet').first()).toBeVisible();
  });

  test('unavailable destinations show a toast instead of failing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Help' }).click();
    await expect(page.getByRole('status')).toContainText("This action isn't available yet");
  });
});

test('signed-out visitors are redirected to the login page', async ({ page }) => {
  await page.route('http://localhost:4000/**', (r) =>
    r.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': 'http://localhost:3100',
        'access-control-allow-credentials': 'true',
      },
      body: '{}',
    }),
  );
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('login page validates input before calling the API', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid email').first()).toBeVisible();
});
