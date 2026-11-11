import { expect, test } from '@playwright/test';
import { mockApi } from './mocks';

test.describe('global header', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/');
  });

  test('keeps the original logo and a stable height beside the sidebar', async ({ page }) => {
    const logo = page.getByRole('banner').getByRole('img', { name: 'Torio' });
    await expect(logo).toHaveAttribute('src', '/torio-logo.png');
    const header = (await page.getByRole('banner').boundingBox())!;
    expect(header.height).toBe(56);
    const nav = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
    expect(Math.round(nav.y)).toBe(Math.round(header.y + header.height));
  });

  test('help and notifications are honest: a tooltip, and an empty list with no fake dot', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Help & Support' })).toHaveAttribute(
      'title',
      'Help & Support',
    );
    const bell = page.getByRole('button', { name: 'Notifications' });
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText('No notifications')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(bell).toBeFocused();
    await bell.click();
    await page.getByRole('main').click({ position: { x: 4, y: 4 }, force: true });
    await expect(panel).toHaveCount(0);
  });

  test('the header avatar is the active store, not the person', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Store menu' });
    await expect(trigger).toContainText('UrbanNest');
    // no store logo: the store's initial, never the user's ("FA" would be Farid Ahmed)
    await expect(trigger.locator('span').first()).toHaveText('U');
    await expect(trigger).not.toContainText('FA');
  });

  test('the dropdown is about stores: list, Add Store, then account row and Sign out, in that order', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: 'Store menu' });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Store menu' });
    const list = panel.getByRole('listbox', { name: 'Stores' });
    await expect(list.getByRole('option', { name: /UrbanNest/ })).toContainText(
      'Current workspace',
    );
    await expect(list.getByRole('option', { name: /UrbanNest/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const y = async (l: ReturnType<typeof panel.getByRole>) => (await l.boundingBox())!.y;
    const add = panel.getByRole('button', { name: 'Add Store' });
    const profile = panel.getByRole('button', { name: 'Profile & Account' });
    const out = panel.getByRole('button', { name: 'Sign out' });
    expect(await y(list)).toBeLessThan(await y(add));
    expect(await y(add)).toBeLessThan(await y(profile));
    expect(await y(profile)).toBeLessThan(await y(out));
    // the account row shows the person
    await expect(profile).toContainText('Farid Ahmed');
    await expect(profile).toContainText('agent@test.dev');
    // the old entries are gone from the dropdown
    for (const gone of ['My profile', 'Workspace settings', 'Billing & subscription'])
      await expect(panel.getByText(gone, { exact: true })).toHaveCount(0);
    await expect(panel.getByRole('menuitem')).toHaveCount(0);
    const box = (await panel.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(320);
    expect(box.width).toBeLessThanOrEqual(360);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Add Store opens store setup; Profile & Account opens Settings → General; Sign out is destructive', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Store menu' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveClass(/text-danger/);
    await page.getByRole('button', { name: 'Add Store', exact: true }).last().click();
    await expect(page).toHaveURL(/\/onboarding\?new=1$/);
    await page.goto('/');
    await page.getByRole('button', { name: 'Store menu' }).click();
    await page.getByRole('button', { name: 'Profile & Account' }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
  });

  test('billing stays reachable through its own route', async ({ page }) => {
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/billing$/);
  });

  test('phone header stays on one row without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    for (const name of ['Open navigation', 'Search', 'Notifications', 'Store menu'])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    const ys = await Promise.all(
      ['Open navigation', 'Search', 'Notifications', 'Store menu'].map(async (n) =>
        Math.round((await page.getByRole('button', { name: n, exact: true }).boundingBox())!.y),
      ),
    );
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(4);
  });
});
