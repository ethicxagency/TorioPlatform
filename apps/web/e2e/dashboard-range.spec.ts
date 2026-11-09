import { expect, test, type Page } from '@playwright/test';
import { formatRange, PRESETS, resolvePreset, todayIn, type PresetKey } from '@torio/contracts';
import { dashboardState, mockApi, resetDashboard, resetSettings } from './mocks';

const TZ = 'Asia/Dhaka'; // the mocked workspace's reporting time zone
const today = () => todayIn(TZ);
const expected = (k: Exclude<PresetKey, 'custom'>) => resolvePreset(k, today());
const last = () => dashboardState.requests.at(-1)!;

async function open(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Business analytics' })).toBeVisible();
  await expect.poll(() => dashboardState.requests.length).toBeGreaterThan(0);
}
const trigger = (page: Page) => page.getByRole('button', { name: /^Date range:/ });
const picker = (page: Page) => page.getByRole('dialog', { name: 'Choose date range' });

test.describe('dashboard date range', () => {
  test.beforeEach(async ({ page }) => {
    resetDashboard();
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('defaults to Last 30 Days in the reporting time zone', async ({ page }) => {
    await open(page);
    const r = expected('last_30_days');
    await expect(trigger(page)).toContainText('Last 30 Days');
    await expect(trigger(page)).toContainText(formatRange(r));
    expect(last()).toMatchObject({ ...r, compare: 'none', granularity: 'day' });
    expect(dashboardState.requests).toHaveLength(1); // no duplicate fetches on load
  });

  test('every preset updates the selection, the URL and the API request', async ({ page }) => {
    await open(page);
    for (const p of PRESETS.filter((x) => x.key !== 'custom')) {
      await trigger(page).click();
      await picker(page).getByRole('option', { name: p.label, exact: true }).click();
      const key = p.key as Exclude<PresetKey, 'custom'>;
      await expect(trigger(page)).toContainText(p.label);
      const want = expected(key);
      // already-cached ranges are served without a new request, so check the range was requested at some point
      await expect
        .poll(() => dashboardState.requests.some((q) => q.from === want.from && q.to === want.to))
        .toBe(true);
      await expect(page).toHaveURL(new RegExp(`range=${p.key}`));
    }
  });

  test('presets are one plain list: no group headings, no time zone line', async ({ page }) => {
    await open(page);
    await trigger(page).click();
    const options = picker(page).getByRole('option');
    await expect(options).toHaveCount(13);
    await expect(options.first()).toHaveText('Today');
    await expect(options.last()).toHaveText('Custom Range');
    await expect(picker(page).getByRole('group')).toHaveCount(0);
    for (const heading of ['Quick select', 'Monthly', 'Yearly'])
      await expect(picker(page).getByText(heading, { exact: true })).toHaveCount(0);
    await expect(picker(page).getByText(/Reporting time zone/)).toHaveCount(0);
  });

  test('custom range applies only after Apply; Cancel and Clear change nothing', async ({
    page,
  }) => {
    await open(page);
    const before = dashboardState.requests.length;
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'Custom Range' }).click();
    const t = today();
    const pad = (n: number) => String(n).padStart(2, '0');
    const from = `${t.y}-${pad(t.m)}-01`;
    await picker(page).getByLabel('Start date').fill(from);
    await picker(page)
      .getByLabel('End date')
      .fill(`${t.y}-${pad(t.m)}-${pad(t.d)}`);
    expect(dashboardState.requests).toHaveLength(before); // nothing yet
    await expect(picker(page).getByText(/days? \(inclusive\)/)).toBeVisible();
    await picker(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(trigger(page)).toContainText('Last 30 Days');
    expect(dashboardState.requests).toHaveLength(before);
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'Custom Range' }).click();
    await picker(page).getByRole('button', { name: 'Clear' }).click();
    await expect(picker(page).getByRole('alert')).toContainText(/Choose a start and an end date/);
    await expect(picker(page).getByRole('button', { name: 'Apply' })).toBeDisabled();
    await picker(page).getByLabel('Start date').fill('2026-03-01');
    await picker(page).getByLabel('End date').fill('2026-03-15');
    await picker(page).getByRole('button', { name: 'Apply' }).click();
    await expect(trigger(page)).toContainText('Custom Range');
    await expect(trigger(page)).toContainText('1–15 Mar 2026');
    await expect.poll(() => last().from).toBe('2026-03-01');
    expect(last().to).toBe('2026-03-15');
    await expect(page).toHaveURL(/range=custom&from=2026-03-01&to=2026-03-15/);
  });

  test('rejects invalid custom ranges with a clear message and blocks Apply', async ({ page }) => {
    await open(page);
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'Custom Range' }).click();
    const apply = picker(page).getByRole('button', { name: 'Apply' });
    await picker(page).getByLabel('Start date').fill('2026-03-10');
    await picker(page).getByLabel('End date').fill('2026-03-09');
    await expect(picker(page).getByRole('alert')).toContainText(
      'The start date can’t be after the end date.',
    );
    await expect(apply).toBeDisabled();
    const t = today();
    const future = `${t.y + 1}-01-01`;
    await picker(page).getByLabel('Start date').fill('2026-03-01');
    await picker(page).getByLabel('End date').fill(future);
    await expect(picker(page).getByRole('alert')).toContainText(
      'The end date can’t be in the future.',
    );
    await expect(apply).toBeDisabled();
    await picker(page).getByLabel('Start date').fill('2019-01-01');
    await picker(page).getByLabel('End date').fill('2026-03-09');
    await expect(picker(page).getByRole('alert')).toContainText(/two years/);
    await picker(page).getByLabel('End date').fill('2019-01-31');
    await expect(apply).toBeEnabled();
  });

  test('the calendar selects a range by clicking days and highlights it', async ({ page }) => {
    await open(page);
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'Custom Range' }).click();
    await picker(page).getByRole('button', { name: 'Clear' }).click();
    const days = picker(page).locator('.torio-daypicker button.rdp-day_button:not([disabled])');
    await days.nth(8).click();
    await days.nth(12).click();
    await expect(picker(page).getByText(/5 days \(inclusive\)/)).toBeVisible();
    await expect(picker(page).locator('.rdp-range_middle').first()).toBeVisible();
    // month and year navigation is available
    await expect(
      picker(page).locator('.rdp-months_dropdown, .rdp-dropdowns select').first(),
    ).toBeVisible();
    await picker(page).getByRole('button', { name: 'Apply' }).click();
    await expect(trigger(page)).toContainText('Custom Range');
  });

  test('has no compare control, hints or Payments received card; messaging cards come first', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByLabel('Compare to')).toHaveCount(0);
    await expect(page.getByText(/compare/i)).toHaveCount(0);
    await expect(page.getByText(/Payments received/i)).toHaveCount(0);
    await expect(
      page.getByText(/Sample data, scaled|Percentages are stage|not date-filtered/i),
    ).toHaveCount(0);
    expect(dashboardState.requests.every((r) => r.compare === 'none')).toBe(true);
    const kpi = page.getByText('Conversations', { exact: true }).first();
    const analytics = page.getByRole('region', { name: 'Business analytics' });
    await expect(kpi).toBeVisible();
    const [h, an] = await Promise.all([kpi.boundingBox(), analytics.boundingBox()]);
    expect(h!.y).toBeLessThan(an!.y);
    const range = await trigger(page).boundingBox();
    expect(range!.y).toBeLessThan(h!.y); // directly under the header and range selector
  });

  test('all analytics widgets and the sample widgets follow the same range', async ({ page }) => {
    await open(page);
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'Last Year' }).click();
    const r = expected('last_year');
    await expect.poll(() => last().from).toBe(r.from);
    const section = page.getByRole('region', { name: 'Business analytics' });
    // KPI cards: revenue in the record's own currency, other currencies listed (never added), orders
    const tab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
    await expect(tab('Revenue')).toContainText('$36,500.00'); // 365 days × $100, stored currency
    await expect(tab('Orders')).toContainText('730');
    await expect(page.getByRole('region', { name: /^Revenue · (Weekly|Monthly)$/ })).toBeVisible();
    await expect(page.getByText('1,095', { exact: true }).first()).toBeVisible(); // conversations: 365 × 3
    await expect(section.getByRole('region', { name: 'Recent activity' })).toBeVisible();
    // the real conversation chart follows the same buckets (monthly for a year)
    await expect(
      page
        .getByRole('region', { name: 'Conversation Overview' })
        .getByRole('img', { name: /per day|per week|per month/ }),
    ).toBeVisible();
    await expect(trigger(page)).toContainText(formatRange(r));
  });

  test('the selection survives reloads, in-app navigation and ignores broken URLs', async ({
    page,
  }) => {
    await open(page, '?range=last_year');
    await expect(trigger(page)).toContainText('Last Year');
    await page.reload();
    await expect(trigger(page)).toContainText('Last Year');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Orders' })
      .click();
    await expect(page).toHaveURL(/\/orders/);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Dashboard' })
      .click();
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(trigger(page)).toContainText('Last Year'); // restored from the session
    await open(page, '?range=custom&from=2026-03-20&to=2026-03-01');
    await expect(trigger(page)).toContainText('Last 30 Days');
    await open(page, '?range=bogus');
    await expect(trigger(page)).toContainText('Last 30 Days');
  });

  test('rapid changes never show a stale response', async ({ page }) => {
    await open(page);
    const slow = expected('last_year');
    dashboardState.delayFrom = slow.from;
    dashboardState.delayMs = 1200;
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'Last Year' }).click(); // slow response
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'This Year' }).click(); // selected last
    await expect(trigger(page)).toContainText('This Year');
    await page.waitForTimeout(1800); // the slow Last Year response lands now
    await expect(page.getByRole('tab', { name: /^Revenue/ })).not.toContainText('$36,500.00');
    await expect(trigger(page)).toContainText('This Year');
  });

  test('shows loading skeletons while fetching and an error with retry', async ({ page }) => {
    dashboardState.delayFrom = expected('last_30_days').from;
    dashboardState.delayMs = 800;
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Business analytics' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(page.getByRole('tablist', { name: 'Metrics' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Business analytics' })).toHaveAttribute(
      'aria-busy',
      'false',
    );
    dashboardState.delayMs = 0;
    dashboardState.fail = true;
    await trigger(page).click();
    await picker(page).getByRole('option', { name: 'Last Year' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /Couldn.t load analytics/ }),
    ).toBeVisible();
    dashboardState.fail = false;
    await page.getByRole('button', { name: 'Try again' }).first().click();
    await expect(
      page.getByRole('alert').filter({ hasText: /Couldn.t load analytics/ }),
    ).toHaveCount(0);
  });

  test('is keyboard accessible: open, arrow through presets, select with Enter, Escape returns focus', async ({
    page,
  }) => {
    await open(page);
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(picker(page)).toBeVisible();
    await picker(page).getByRole('option', { name: 'This Year', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(picker(page).getByRole('option', { name: 'Last Year' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(trigger(page)).toContainText('Last Year');
    await trigger(page).click();
    await expect(picker(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test('works on a phone: the popover fits the screen and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await trigger(page).click();
    const box = await picker(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await picker(page).getByRole('option', { name: 'Custom Range' }).click();
    const box2 = await picker(page).boundingBox();
    expect(box2!.x + box2!.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await picker(page).getByRole('button', { name: 'Cancel' }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(trigger(page)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });

  test('the reporting time zone can be set in workspace settings', async ({ page }) => {
    await page.goto('/settings/general');
    await expect(page.getByRole('button', { name: `Reporting time zone: ${TZ}` })).toBeVisible();
    await expect(page.getByText(/Decides where each day starts and ends/)).toBeVisible();
  });
});
