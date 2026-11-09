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

  test('account menu shows identity and workspace, and works from the keyboard', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: 'Account menu' });
    await expect(trigger).toContainText(/\w/);
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Account menu' });
    await expect(menu.getByText('Current workspace')).toBeVisible();
    await expect(menu.getByText('agent@test.dev')).toBeVisible();
    await expect(menu.getByText('owner', { exact: true })).toBeVisible(); // role badge
    await expect(menu.getByText('Account', { exact: true })).toBeVisible(); // section label
    // One workspace only, so there is no misleading "Switch workspace" action.
    await expect(menu.getByText(/switch workspace/i)).toHaveCount(0);
    const box = (await menu.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(320);
    expect(box.width).toBeLessThanOrEqual(360);
    // Focus lands on the first item; arrows move; Escape closes and returns focus.
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // Owners see Billing; it opens the billing page.
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Billing & subscription' }).click();
    await expect(page).toHaveURL(/\/billing$/);
  });

  test('My profile opens the personal section of General; Sign out is styled as destructive', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveClass(/text-danger/);
    await page.getByRole('menuitem', { name: 'My profile' }).click();
    await expect(page).toHaveURL(/\/settings\/general#personal$/);
  });

  test('agents do not get a Billing entry', async ({ page }) => {
    await mockApi(page, { role: 'AGENT' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Workspace settings' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Billing/ })).toHaveCount(0);
  });

  test('phone header stays on one row without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    for (const name of ['Open navigation', 'Search', 'Notifications', 'Account menu'])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    const ys = await Promise.all(
      ['Open navigation', 'Search', 'Notifications', 'Account menu'].map(async (n) =>
        Math.round((await page.getByRole('button', { name: n, exact: true }).boundingBox())!.y),
      ),
    );
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(4);
  });
});
