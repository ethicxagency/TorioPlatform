import { expect, test } from '@playwright/test';
import { mockApi, resetSettings } from './mocks';

test.describe('toast notifications', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('a confirmed save shows one success toast in the top right, then it dismisses itself', async ({
    page,
  }) => {
    await page.goto('/settings/general');
    await page.getByLabel('Business Name').fill('UrbanNest HQ');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const region = page.getByRole('region', { name: 'Notifications' });
    const t = region
      .getByRole('status')
      .filter({ hasText: 'Business information updated successfully.' });
    await expect(t).toHaveCount(1);
    const box = (await t.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x + box.width).toBeGreaterThan(vp.width - 40);
    expect(box.y).toBeLessThan(40);
    await expect(t).toHaveCount(0, { timeout: 6000 });
  });

  test('a failed save shows an error toast and never a success toast', async ({ page }) => {
    await page.route(/\/workspaces\/[^/]+$/, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Server exploded' } }),
          })
        : route.fallback(),
    );
    await page.goto('/settings/general');
    await page.getByLabel('Business Name').fill('UrbanNest HQ');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const region = page.getByRole('region', { name: 'Notifications' });
    await expect(region.getByRole('alert')).toContainText('Unable to save');
    await expect(region.getByText(/updated successfully|saved successfully/)).toHaveCount(0);
    // The edit is kept.
    await expect(page.getByLabel('Business Name')).toHaveValue('UrbanNest HQ');
  });

  test('toasts stack, can be dismissed by hand, and sit above dialogs', async ({ page }) => {
    await page.goto('/settings/general');
    await page.getByLabel('Business Name').fill('UrbanNest HQ');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Business information updated successfully.')).toBeVisible();
    await page.getByLabel('Job title (optional)').fill('Head of Support');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const region = page.getByRole('region', { name: 'Notifications' });
    await expect(region.getByRole('status')).toHaveCount(2);
    await region.getByRole('button', { name: 'Dismiss notification' }).first().click();
    await expect(region.getByRole('status')).toHaveCount(1);
    const z = await region.evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(z).toBeGreaterThan(95);
  });
});
