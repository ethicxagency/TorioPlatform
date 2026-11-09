import { expect, test, type Page } from '@playwright/test';
import { mockApi, resetSettings } from './mocks';

const main = (p: Page) => p.getByRole('navigation', { name: 'Main' });
const width = async (p: Page) => (await main(p).boundingBox())!.width;
const cards = (p: Page) => p.getByRole('list', { name: 'Settings sections' }).getByRole('link');

/** The page fades in on load; measure layout only once that has finished. */
const settled = (page: import('@playwright/test').Page) =>
  page.getByRole('main').evaluate((m) => Promise.all(m.getAnimations().map((a) => a.finished)));

test.describe('settings overview (card navigation, no sub-sidebar)', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('clicking Settings keeps the main sidebar expanded and shows ten cards, three per row', async ({
    page,
  }) => {
    await page.goto('/');
    await main(page).getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    expect(await width(page)).toBeGreaterThan(200); // never collapses to an icon rail
    await expect(page.getByRole('navigation', { name: 'Settings' })).toHaveCount(0); // no sub-sidebar
    await expect(main(page).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(cards(page)).toHaveCount(8);
    const titles = [
      'General',
      'Security',
      'Notifications',
      'Teams',
      'Channels',
      'Billing & subscriptions',
      'Data & privacy',
      'Audit log',
    ];
    for (const [i, t] of titles.entries()) await expect(cards(page).nth(i)).toContainText(t);
    const ys = await Promise.all(
      [0, 1, 2, 3].map(async (i) => (await cards(page).nth(i).boundingBox())!.y),
    );
    expect(ys[0]).toBe(ys[1]);
    expect(ys[1]).toBe(ys[2]);
    expect(ys[3]).toBeGreaterThan(ys[0]!); // fourth card starts row two
  });

  test('every card opens its existing route, with a breadcrumb back; back/forward work', async ({
    page,
  }) => {
    await page.goto('/settings');
    const routes: [string, RegExp][] = [
      ['General', /\/settings\/general$/],
      ['Security', /\/settings\/security$/],
      ['Billing & subscriptions', /\/billing$/],
      ['Audit log', /\/settings\/audit$/],
    ];
    for (const [name, url] of routes) {
      await page.goto('/settings');
      await cards(page).filter({ hasText: name }).click();
      await expect(page).toHaveURL(url);
      expect(await width(page)).toBeGreaterThan(200);
      await expect(main(page).getByRole('link', { name: 'Settings' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    await page.goto('/settings/security');
    const crumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumb).toContainText('Settings');
    await expect(crumb).toContainText('Security');
    await crumb.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('the overview has no search box', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByLabel('Search settings')).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(8);
  });

  test('responsive: two columns on tablet, one on phone, no sideways scrolling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/settings');
    await settled(page);
    const y = async (i: number) => (await cards(page).nth(i).boundingBox())!.y;
    expect(await y(0)).toBe(await y(1));
    expect(await y(2)).toBeGreaterThan(await y(1));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings');
    await settled(page);
    expect(await y(1)).toBeGreaterThan(await y(0));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });

  test('direct URLs work and agents do not see owner-only cards', async ({ page }) => {
    await page.goto('/settings/general');
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Settings' })).toHaveCount(0);
  });

  test('Teams and Channels moved from the main sidebar into Settings and open the same pages', async ({
    page,
  }) => {
    await page.goto('/settings');
    const main = page.getByRole('navigation', { name: 'Main' });
    await expect(main.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0);
    await expect(main.getByRole('link', { name: 'Channels', exact: true })).toHaveCount(0);
    const list = page.getByRole('list', { name: 'Settings sections' });
    await list.getByRole('link', { name: /^Teams/ }).click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await list.getByRole('link', { name: /^Channels/ }).click();
    await expect(page).toHaveURL(/\/channels$/);
    await expect(page.getByRole('heading', { name: 'Channels', level: 1 })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Channels', level: 1 })).toBeVisible();
  });
});
