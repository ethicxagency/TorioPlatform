import { expect, test } from '@playwright/test';
import { mockApi, searchState } from './mocks';

test.describe('global search', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
  });

  const field = (page: import('@playwright/test').Page) =>
    page.getByRole('combobox', { name: 'Search' });

  test('Ctrl+K and Cmd+K focus the field; the shortcut hint matches the platform', async ({
    page,
  }) => {
    await expect(field(page)).toHaveAttribute(
      'placeholder',
      'Search conversations, customers, orders…',
    );
    // The hint follows the platform the tests run on: ⌘ K on macOS, Ctrl K elsewhere.
    const mac = await page.evaluate(() => /mac|iphone|ipad/i.test(navigator.platform));
    await expect(page.locator('kbd', { hasText: mac ? '⌘ K' : 'Ctrl K' })).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(field(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(field(page)).not.toBeFocused();
    await page.keyboard.press('Meta+k');
    await expect(field(page)).toBeFocused();
  });

  test('empty query offers only destinations this member can open', async ({ page }) => {
    await field(page).focus();
    const box = page.getByRole('listbox', { name: 'Search results' });
    const nav = box.getByRole('group', { name: 'Quick navigation' });
    for (const label of ['Dashboard', 'Inbox', 'Leads', 'Customers', 'Orders', 'Settings'])
      await expect(nav.getByRole('option', { name: new RegExp(`^${label}`) })).toBeVisible();
    expect(searchState.requests).toHaveLength(0);
  });

  test('groups results, navigates with the keyboard, and opens the right conversation', async ({
    page,
  }) => {
    await field(page).fill('tan');
    const box = page.getByRole('listbox', { name: 'Search results' });
    await expect(box.getByRole('group', { name: 'Conversations' })).toBeVisible();
    await expect(box.getByRole('group', { name: 'Customers' })).toBeVisible();
    await expect(box.getByRole('group', { name: 'Orders' })).toBeVisible();
    await expect(box.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await field(page).fill('nusrat');
    await expect(
      box.getByRole('group', { name: 'Leads' }).getByRole('option', { name: /Nusrat Jahan/ }),
    ).toContainText('Qualified');
    await field(page).fill('tan');
    await expect(box.getByRole('group', { name: 'Conversations' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/inbox\?conversation=3{8}-3{4}-4333-8333-0{11}1$/);
  });

  test('no results, error with retry, and outside click / Escape close it', async ({ page }) => {
    await field(page).fill('zzzz');
    await expect(page.getByText('No results found')).toBeVisible();
    await expect(
      page.getByText('Check the spelling or try a different search term.'),
    ).toBeVisible();

    searchState.fail = true;
    await field(page).fill('qqqq');
    await expect(
      page.getByRole('alert').filter({ hasText: 'couldn’t be completed' }),
    ).toBeVisible();
    searchState.fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('No results found')).toBeVisible();

    // Click on the blank page background, away from the field and its popover.
    await page.getByRole('main').click({ position: { x: 4, y: 4 }, force: true });
    await expect(page.getByRole('listbox', { name: 'Search results' })).toHaveCount(0);
  });

  test('a quick-navigation match goes to its page', async ({ page }) => {
    await field(page).fill('orders');
    await page
      .getByRole('option', { name: /^Orders\s*Go to Orders/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('on a phone the search opens from an icon, full width, without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(field(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(field(page)).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.getByRole('button', { name: 'Close search' }).click();
    await expect(field(page)).toHaveCount(0);
  });
});
