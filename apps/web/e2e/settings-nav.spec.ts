import { expect, test, type Page } from '@playwright/test';
import { mockApi, resetSettings } from './mocks';

const main = (p: Page) => p.getByRole('navigation', { name: 'Main' });
const menu = (p: Page) => p.getByRole('navigation', { name: 'Settings' });

const TITLES = [
  'General',
  'Security',
  'Notifications',
  'Teams',
  'Channels',
  'Billing & Subscriptions',
  'Data & Privacy',
  'Audit Log',
];

test.describe('settings mode (dedicated sidebar)', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('clicking Settings swaps the main sidebar for the Settings menu', async ({ page }) => {
    await page.goto('/');
    await main(page).getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
    await expect(main(page)).toHaveCount(0); // the dashboard navigation is replaced, not stacked
    const links = menu(page).getByRole('link');
    await expect(links).toHaveCount(8);
    for (const [i, t] of TITLES.entries()) await expect(links.nth(i)).toContainText(t);
    await expect(menu(page).getByRole('link', { name: /General/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
    // Only Back, the title and the sections: no search box, workspace card or account block.
    await expect(page.getByRole('searchbox', { name: 'Search settings' })).toHaveCount(0);
    await expect(menu(page).locator('..')).not.toContainText('owner@urbannest.test');
    await expect(menu(page).locator('..').getByRole('textbox')).toHaveCount(0);
  });

  test('every item opens its existing route and the menu stays', async ({ page }) => {
    await page.goto('/settings/general');
    const routes: [string, RegExp][] = [
      ['Security', /\/settings\/security$/],
      ['Notifications', /\/settings\/notifications$/],
      ['Teams', /\/team$/],
      ['Channels', /\/channels$/],
      ['Billing & Subscriptions', /\/billing$/],
      ['Data & Privacy', /\/settings\/privacy$/],
      ['Audit Log', /\/settings\/audit$/],
      ['General', /\/settings\/general$/],
    ];
    for (const [name, url] of routes) {
      await menu(page)
        .getByRole('link', { name: new RegExp(name) })
        .click();
      await expect(page).toHaveURL(url);
      await expect(menu(page).getByRole('link')).toHaveCount(8);
      await expect(menu(page).getByRole('link', { name: new RegExp(name) })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/audit$/);
  });

  test('Back returns to the page Settings was opened from', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
    await main(page).getByRole('link', { name: 'Settings' }).click();
    await menu(page)
      .getByRole('link', { name: /Security/ })
      .click();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(main(page)).toBeVisible();
  });

  test('the bare /settings URL opens General', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/general$/);
  });

  test('a refreshed Settings URL still shows the Settings menu with the right item active', async ({
    page,
  }) => {
    await page.goto('/settings/security');
    await page.reload();
    await expect(menu(page).getByRole('link', { name: /Security/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(main(page)).toHaveCount(0);
  });

  test('phone: the Settings menu opens from the header and closing it leaves the page usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings/general');
    await expect(menu(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(menu(page)).toBeVisible();
    await menu(page)
      .getByRole('link', { name: /Security/ })
      .click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect(menu(page)).toHaveCount(0); // drawer closes after choosing
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test('agents do not see owner-only Settings items', async ({ page }) => {
  resetSettings();
  await mockApi(page, { role: 'AGENT' });
  await page.goto('/settings/general');
  await expect(menu(page).getByRole('link', { name: /General/ })).toBeVisible();
  await expect(menu(page).getByRole('link', { name: /Billing/ })).toHaveCount(0);
  await expect(menu(page).getByRole('link', { name: /Audit/ })).toHaveCount(0);
});
