import { expect, test, type Page } from '@playwright/test';
import { adminState, mockApi, resetAdmin } from './mocks';

const signIn = async (page: Page) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('root@torio.test');
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
};

test.describe('super admin', () => {
  test.beforeEach(async ({ page }) => {
    resetAdmin();
    await mockApi(page, { role: 'OWNER' });
  });

  test('anyone not signed in is sent to the admin login; bad credentials show an error and stay out', async ({
    page,
  }) => {
    await page.goto('/admin/customers');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByText(/Customer accounts can.t sign in here/)).toBeVisible();
    await page.getByLabel('Email').fill('root@torio.test');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email' })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('signs in to a compact dashboard with only the specified navigation, then logs out', async ({
    page,
  }) => {
    await signIn(page);
    const nav = page.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link')).toHaveText([
      'Dashboard',
      'Customers',
      'Workspaces',
      'Subscriptions & Billing',
      'Plans & Pricing',
      'Activity & Logs',
      'Settings',
    ]);
    await expect(nav.getByText('MAIN')).toBeVisible();
    await expect(nav.getByText('PLATFORM')).toBeVisible();
    for (const t of [
      'Total customers',
      'Active workspaces',
      'Active subscriptions',
      'Monthly recurring revenue',
    ])
      await expect(page.getByText(t)).toBeVisible();
    await expect(page.getByText('$49.00').first()).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Failed payments' }).getByText('Gamma Ltd'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Revenue overview' })).toBeVisible();
    await expect(page.getByText('Platform Owner')).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin/customers');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('customers: search and filters, details, and suspension that needs a reason', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page.getByRole('row', { name: /Nadia Rahman/ })).toBeVisible();
    await page.getByLabel('Search by name or email').fill('karim');
    await expect(page.getByRole('row', { name: /Nadia Rahman/ })).toHaveCount(0);
    await page.getByLabel('Search by name or email').fill('');
    await page.getByLabel('Subscription status').selectOption('NONE');
    await expect(page.getByRole('row', { name: /Karim Hossain/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Nadia Rahman/ })).toHaveCount(0);
    await page.getByLabel('Subscription status').selectOption('');
    await page.getByRole('button', { name: 'View Karim Hossain' }).click();
    const d = page.getByRole('dialog', { name: 'Karim Hossain' });
    await expect(
      d.getByText('Conversations, messages and customer contact data are never shown here.'),
    ).toBeVisible();
    await expect(d.getByText('INV-0004')).toBeVisible();
    await d.getByRole('button', { name: 'Suspend customer' }).click();
    const r = page.getByRole('dialog', { name: /Suspend Karim Hossain/ });
    await r.getByRole('button', { name: 'Suspend customer' }).click();
    await expect(r.getByText(/at least 5 characters/)).toBeVisible();
    expect(adminState.posts).toHaveLength(0);
    await r.getByLabel('Reason (required)').fill('Payment fraud under review');
    await r.getByRole('button', { name: 'Suspend customer' }).click();
    await expect(page.getByRole('status')).toContainText('Customer suspended');
    expect(adminState.posts[0]).toEqual({
      path: `POST /customers/${adminState.customers[1]!.id}/suspend`,
      body: { reason: 'Payment fraud under review' },
    });
    await expect(d.getByText(/Suspended .*Payment fraud under review/)).toBeVisible();
    await expect(d.getByRole('button', { name: 'Reactivate customer' })).toBeVisible();
  });

  test('workspaces: list columns and detail with suspend action', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Workspaces' }).click();
    const row = page.getByRole('row', { name: /Acme Store/ });
    await expect(row).toContainText('Nadia Rahman');
    await expect(row).toContainText('Growth');
    await page.getByRole('button', { name: 'View Acme Store' }).click();
    const d = page.getByRole('dialog', { name: 'Acme Store' });
    await expect(d.getByText('Team members')).toBeVisible();
    await expect(
      d.getByText(/Conversations, customers and messages inside the workspace are private/),
    ).toBeVisible();
    await expect(d.getByRole('button', { name: 'Suspend workspace' })).toBeVisible();
  });

  test('subscriptions: filters, manual vs provider, and cancellation that is only requested', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Subscriptions & Billing' }).click();
    await expect(page.getByRole('row', { name: /Acme Store/ })).toContainText('$49.00');
    await expect(page.getByRole('row', { name: /Beta Shop/ })).toContainText('Manual grant');
    await page.getByLabel('Subscription status').selectOption('TRIALING');
    await expect(page.getByText('No subscriptions match.')).toBeVisible();
    await page.getByLabel('Subscription status').selectOption('');
    await page.getByRole('button', { name: 'View subscription for Acme Store' }).click();
    const d = page.getByRole('dialog', { name: /Acme Store/ });
    await expect(d.getByText('invoice.paid')).toBeVisible();
    await d.getByRole('button', { name: 'Cancel subscription' }).click();
    const r = page.getByRole('dialog', { name: 'Cancel this subscription?' });
    await expect(r.getByText(/only after the provider confirms/)).toBeVisible();
    await r.getByLabel('Reason (required)').fill('Customer asked by phone');
    await r.getByRole('button', { name: 'Request cancellation' }).click();
    await expect(page.getByRole('status')).toContainText('once the provider confirms');
    expect(adminState.posts.at(-1)!.body).toEqual({
      reason: 'Customer asked by phone',
      atPeriodEnd: true,
    });
  });

  test('plans: create as disabled, edit warns about existing subscribers, archive blocked while in use', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Plans & Pricing' }).click();
    await expect(
      page.getByText(/Existing subscribers keep the limits and features they signed up with/),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive Growth' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Archive Free' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create plan' }).click();
    const d = page.getByRole('dialog', { name: 'Create plan' });
    await d.getByRole('button', { name: 'Save plan' }).click();
    await expect(d.getByText('Enter a plan name.')).toBeVisible();
    await d.getByLabel('Plan name').fill('Business');
    await d.getByLabel('Plan key').fill('business');
    await d.getByLabel('Monthly price').fill('99.00');
    await d.getByLabel('Yearly price').fill('990.00');
    await d.getByLabel('Team members', { exact: true }).fill('50');
    await d.getByLabel('Contacts').fill('abc');
    await d.getByRole('button', { name: 'Save plan' }).click();
    await expect(d.getByText(/Contacts: enter a whole number/)).toBeVisible();
    await d.getByLabel('Contacts').fill('');
    await d.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.getByRole('row', { name: /Business/ })).toBeVisible();
    expect(adminState.posts.at(-1)!.body).toMatchObject({
      key: 'business',
      monthlyMinor: 9900,
      yearlyMinor: 99000,
    });
    await expect(page.getByRole('row', { name: /Business/ })).toContainText('Disabled');
    await page.getByRole('button', { name: 'Enable Business' }).click();
    const r = page.getByRole('dialog', { name: 'Enable Business?' });
    await r.getByLabel('Reason (required)').fill('Launching it');
    await r.getByRole('button', { name: 'Enable plan' }).click();
    await expect(page.getByRole('row', { name: /Business/ })).toContainText('Active');
  });

  test('activity log is searchable and has no edit controls; payment events are separate', async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Activity & Logs' }).click();
    await expect(page.getByText('customer.suspend')).toBeVisible();
    await expect(page.getByText(/Reason: Fraud review/)).toBeVisible();
    await page.getByLabel('Search logs').fill('login');
    await expect(page.getByText('customer.suspend')).toHaveCount(0);
    await expect(page.getByText('admin.login')).toBeVisible();
    await expect(page.getByRole('button', { name: /delete|edit/i })).toHaveCount(0);
    await page.getByLabel('Search logs').fill('');
    await page.getByRole('button', { name: 'Payment events' }).click();
    await expect(page.getByText('invoice.payment_failed')).toBeVisible();
  });

  test('settings shows connection status without secrets', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(
      page.getByRole('region', { name: 'Connections' }).getByText('Not connected'),
    ).toBeVisible();
    await expect(page.getByText(/never shown or returned by the API/)).toBeVisible();
    await expect(page.getByLabel('Product name')).toHaveValue('Torio');
    await expect(page.getByLabel('Allow new customer registrations')).toBeChecked();
    expect(await page.content()).not.toMatch(/sk_(live|test)_|whsec_/);
  });

  test('mobile: menu opens as a drawer and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Admin menu' }).getByRole('link', { name: 'Customers' }),
    ).toBeVisible();
    await page
      .getByRole('dialog', { name: 'Admin menu' })
      .getByRole('link', { name: 'Customers' })
      .click();
    await expect(page.getByRole('heading', { name: 'Customers', level: 1 })).toBeVisible();
    for (const p of [
      '/admin',
      '/admin/customers',
      '/admin/workspaces',
      '/admin/subscriptions',
      '/admin/plans',
      '/admin/activity',
      '/admin/settings',
    ]) {
      await page.goto(p);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    }
  });

  test('the customer app is unaffected: its login page is separate from admin', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
  });
});
