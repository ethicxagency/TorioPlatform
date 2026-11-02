import { expect, test } from '@playwright/test';
import { mockApi, resetSettings } from './mocks';

/**
 * URL audit, automated: every internal destination the customer portal links to must render a real page (never the
 * 404 page), and dashboard actions must navigate instead of showing "isn't available yet".
 */
const NOT_FOUND = 'Page not found';

test.describe('internal routes and links', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('every main sidebar link opens an existing page', async ({ page }) => {
    await page.goto('/');
    const links = page.getByRole('navigation', { name: 'Main' }).locator('a[href^="/"]');
    await expect(links.first()).toBeVisible();
    const hrefs = await links.evaluateAll((els) => [
      ...new Set(els.map((e) => e.getAttribute('href')!)),
    ]);
    expect(hrefs.length).toBeGreaterThanOrEqual(13);
    for (const href of hrefs) {
      await page.goto(href);
      await expect(page.getByRole('heading', { level: 1 }).first(), href).toBeVisible();
      await expect(page.getByText(NOT_FOUND), href).toHaveCount(0);
    }
  });

  test('every settings card and breadcrumb leads to an existing page', async ({ page }) => {
    await page.goto('/settings');
    const cards = page.getByRole('list', { name: 'Settings sections' }).locator('a');
    await expect(cards).toHaveCount(10); // permission-filtered list settles after the workspace loads
    const hrefs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
    expect(hrefs).toHaveLength(10);
    for (const href of hrefs) {
      await page.goto(href);
      await expect(page.getByRole('heading', { level: 1 }).first(), href).toBeVisible();
      await expect(page.getByText(NOT_FOUND), href).toHaveCount(0);
    }
  });

  test('dashboard actions and the order drawer navigate to real pages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Recent Orders' }).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/orders$/);
    await page.goto('/');
    await page.getByRole('button', { name: /#ORD-10351/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Order details' });
    await drawer.getByRole('link', { name: 'Message customer' }).click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByText(/isn.t available yet/)).toHaveCount(0);
  });

  test('unknown URLs show the 404 page with a way home', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible();
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('links never point at a hardcoded host', async ({ page }) => {
    for (const path of ['/', '/settings', '/inbox', '/orders']) {
      await page.goto(path);
      const bad = await page
        .locator('a[href]')
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute('href')!).filter((h) => /localhost|127\.0\.0\.1/.test(h)),
        );
      expect(bad, path).toEqual([]);
    }
  });
});
