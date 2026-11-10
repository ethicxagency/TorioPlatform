import { expect, test } from '@playwright/test';
import { addDays, toIso, todayIn } from '@torio/contracts';
import { dashboardState, mockApi, resetDashboard } from './mocks';

// The sample figures are scaled to a 30-day window: yesterday and the 29 days before it.
const thirtyDays = () => {
  const end = addDays(todayIn('UTC'), -1);
  return `/?range=custom&from=${toIso(addDays(end, -29))}&to=${toIso(end)}`;
};

test.describe('dashboard smoke', () => {
  test.beforeEach(async ({ page }) => {
    resetDashboard();
    await mockApi(page);
  });

  test('renders KPIs and all widget sections', async ({ page }) => {
    await page.goto(thirtyDays());
    await expect(page).toHaveTitle('Dashboard · Torio');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('90', { exact: true }).first()).toBeVisible(); // 30 days × 3 conversations (mock API)
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

  test('shows exactly five KPI cards in order, with real values and no demo notices', async ({
    page,
  }) => {
    await page.goto(thirtyDays());
    const labels = ['Revenue', 'Orders', 'Conversations', 'Leads', 'New Customers'];
    const cards = page.getByRole('tablist', { name: 'Metrics' }).getByRole('tab');
    await expect(cards).toHaveCount(5);
    for (const [i, l] of labels.entries()) await expect(cards.nth(i)).toContainText(l);
    await expect(cards.nth(0)).toContainText('$3,000.00'); // stored currency of the mock revenue
    await expect(cards.nth(2)).toContainText('30'); // conversations started: 30 × 1
    await expect(cards.nth(4)).toContainText('30'); // new customers
    await expect(cards.first().locator('svg[aria-hidden]').last()).toBeVisible(); // sparkline
    await expect(page.getByText(/demo/i)).toHaveCount(0);
    await expect(page.getByText(/fictional|illustrative/i)).toHaveCount(0);
  });

  test('selecting a KPI updates the chart and the breakdown', async ({ page }) => {
    await page.goto(thirtyDays());
    await expect(page.getByRole('tab', { name: /^Revenue/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('region', { name: 'Revenue · Daily' })).toBeVisible();
    await page.getByRole('tab', { name: /^Leads/ }).click();
    await expect(page.getByRole('tab', { name: /^Leads/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('region', { name: 'Leads · Daily' })).toBeVisible();
    const aside = page.getByRole('complementary', { name: 'Breakdown' });
    await expect(aside).toContainText('Leads ·');
    await expect(aside).toContainText('35'); // leads total = 30 + 5
    await expect(aside.getByRole('button', { name: /WhatsApp/ })).toContainText('30');
    await expect(aside).toContainText('Average per day');
    await expect(aside).toContainText('Best day');
    // keyboard: arrows move between metrics
    await page.getByRole('tab', { name: /^Leads/ }).press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^New Customers/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // hovering a bar shows the period and value
    await page.getByRole('region', { name: 'New Customers · Daily' }).locator('li').nth(3).hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByText(/previous/i)).toHaveCount(0); // no comparisons anywhere
  });

  test('grouping and breakdown channel clicks refetch real data', async ({ page }) => {
    await page.goto(thirtyDays());
    await page.getByRole('radio', { name: 'Weekly' }).click();
    await expect.poll(() => dashboardState.requests.at(-1)?.granularity).toBe('week');
    const aside = page.getByRole('complementary', { name: 'Breakdown' });
    await aside.getByRole('button', { name: /Instagram/ }).click();
    await expect.poll(() => dashboardState.requests.at(-1)?.channel).toBe('INSTAGRAM');
    await expect(page).toHaveURL(/channel=INSTAGRAM/);
    await aside.getByRole('button', { name: /Instagram/ }).click(); // again = all channels
    await expect(page).not.toHaveURL(/channel=/);
  });

  test('channel filter is sent to the API and kept in the URL', async ({ page }) => {
    await page.goto(thirtyDays());
    const trigger = page.getByRole('button', { name: /^Channel:/ });
    await trigger.click();
    const menu = page.getByRole('listbox', { name: 'Channel' });
    // Real connection state per channel comes from the channels API.
    await expect(menu.getByRole('option', { name: /WhatsApp/ })).toBeVisible();
    await menu.getByRole('option', { name: /WhatsApp/ }).click();
    await expect(menu).toHaveCount(0);
    await expect(trigger).toHaveAccessibleName('Channel: WhatsApp');
    await expect.poll(() => dashboardState.requests.at(-1)?.channel).toBe('WHATSAPP');
    await expect(page).toHaveURL(/channel=WHATSAPP/);
    await expect(page.getByRole('link', { name: /Open Inbox/ }).first()).toHaveAttribute(
      'href',
      '/inbox?channel=WHATSAPP',
    );
    // Keyboard: open, move to "All channels", choose; Escape would close without a change.
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(page).not.toHaveURL(/channel=/); // all channels = no filter (served from cache)
  });

  test('needs attention lists real items with working links, or says all caught up', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.getByRole('region', { name: 'Needs Attention' });
    await expect(panel.getByText('conversations waiting over 2 hours')).toBeVisible();
    await expect(panel.getByText(/Oldest: Rakib Hossain on Messenger/)).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Open Inbox' }).first()).toHaveAttribute(
      'href',
      '/inbox?conversation=conv-oldest',
    );
    await expect(panel.getByRole('link', { name: 'View Leads' })).toHaveAttribute('href', '/leads');
    await expect(panel.getByRole('link', { name: 'View Orders' })).toHaveAttribute(
      'href',
      '/orders',
    );
    await expect(panel.getByText(/complaint/i)).toHaveCount(0); // not tracked, so never shown
    dashboardState.calm = true;
    await page.getByRole('button', { name: 'Refresh dashboard' }).click();
    await expect(panel.getByText('All caught up')).toBeVisible();
  });

  test('conversation overview switches views and shows real summary numbers', async ({ page }) => {
    await page.goto(thirtyDays());
    const card = page.getByRole('region', { name: 'Conversation Overview' });
    await expect(card.getByText('Total conversations')).toBeVisible();
    await expect(card.getByText('60', { exact: true })).toBeVisible(); // resolved = 30 × 2
    await card.getByRole('radio', { name: 'Resolved' }).click();
    await expect(card.getByRole('img', { name: /Resolved per day/ })).toBeVisible();
    await expect(page.getByText(/previous (period|30 days)/i)).toHaveCount(0); // no comparison line
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

  test('refresh and customize are square icon-only buttons with tooltips', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Refresh dashboard', 'Customize dashboard']) {
      const b = page.getByRole('button', { name, exact: true });
      await expect(b).toHaveAttribute('title', name);
      await expect(b).toHaveText('');
      const box = (await b.boundingBox())!;
      expect(Math.round(box.width)).toBe(Math.round(box.height));
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByText(/Updated (just now|\d)/)).toHaveCount(0);
    const before = dashboardState.requests.length;
    await page.getByRole('button', { name: 'Refresh dashboard' }).click();
    await expect.poll(() => dashboardState.requests.length).toBeGreaterThan(before);
  });

  test('customize panel hides a section', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Customize' }).click();
    await page.getByRole('checkbox', { name: 'Team Activity' }).click();
    await expect(page.getByRole('region', { name: 'Team Activity' })).toBeHidden();
  });

  test('error and empty demo states render', async ({ page }) => {
    await page.goto('/?demo=error');
    await expect(page.getByText('Metrics unavailable').first()).toBeVisible();
    await page.goto('/?demo=empty');
    await expect(page.getByText('No conversations yet').first()).toBeVisible();
  });

  test('Settings is the last navigation item on desktop and mobile', async ({ page }) => {
    const order = [
      'Dashboard',
      'Inbox',
      'Leads',
      'Customers',
      'Orders',
      'Automation',
      'Brain',
      'Settings',
    ];
    await page.goto('/');
    const links = page.getByRole('navigation', { name: 'Main' }).locator('a[title]');
    await expect(links).toHaveText(order.map(() => /.*/));
    expect(await links.evaluateAll((els) => els.map((e) => e.getAttribute('title')))).toEqual(
      order,
    );
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '/settings');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).locator('a[title]').last(),
    ).toHaveAttribute('title', 'Settings');
    const titles = await page
      .getByRole('navigation', { name: 'Main' })
      .locator('a[title]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('title')));
    expect(titles.at(-1)).toBe('Settings');
    expect(titles.filter((t) => t === 'Settings')).toHaveLength(1);
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

test('sign-in page: split layout, password toggle, honest options, phone layout', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'About Torio' })).toBeVisible();
  await expect(page.getByText('Every Conversation.')).toBeVisible();
  const pw = page.getByLabel('Password', { exact: true });
  await pw.fill('secret-pass');
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(pw).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(pw).toHaveAttribute('type', 'password');
  // only flows that exist are linked; there is no phone sign-in
  await expect(page.getByText(/Phone/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary', { name: 'About Torio' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});

test('login page validates input before calling the API', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid email').first()).toBeVisible();
});
