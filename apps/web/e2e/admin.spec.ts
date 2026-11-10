import { expect, test, type Page } from '@playwright/test';
import { adminState, metaAdminState, mockApi, resetAdmin } from './mocks';

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
      'Meta Developer',
      'Activity & Logs',
      'Settings',
    ]);
    await expect(nav.getByText('MAIN')).toBeVisible();
    await expect(nav.getByText('INTEGRATIONS')).toBeVisible();
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
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
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
    await mockApi(page, { signedOut: true });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
  });

  test.describe('Meta Developer configuration', () => {
    const open = async (page: Page) => {
      await signIn(page);
      await page.getByRole('link', { name: 'Meta Developer' }).click();
      await expect(page.getByRole('heading', { name: 'Meta Developer', level: 1 })).toBeVisible();
    };

    test('shows status and never reveals secrets; the app secret is masked and write-only', async ({
      page,
    }) => {
      await open(page);
      await expect(page.getByText('Configured', { exact: true }).first()).toBeVisible();
      await page.getByRole('tab', { name: 'App Configuration' }).click();
      await expect(page.getByText('••••••••••••••••').first()).toBeVisible();
      await page.getByRole('button', { name: 'Replace' }).click();
      const field = page.getByLabel('New Meta App Secret');
      await expect(field).toHaveAttribute('type', 'password');
      await field.fill('brand-new-secret-value');
      await page.getByRole('button', { name: 'Show value' }).click();
      await expect(field).toHaveAttribute('type', 'text');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Replace' }).click();
      await expect.poll(() => metaAdminState.secrets.length).toBe(1);
      expect(metaAdminState.secrets[0]).toMatchObject({
        path: 'PUT /secrets/app-secret',
        body: { value: 'brand-new-secret-value', confirm: true },
      });
      await expect(page.getByText('brand-new-secret-value')).toHaveCount(0); // gone from the page after saving
    });

    test('unsaved changes are flagged, validated, and saved only after reviewing risky impact', async ({
      page,
    }) => {
      await open(page);
      await page.getByRole('tab', { name: 'App Configuration' }).click();
      await page.getByLabel('Meta App Name').fill('Torio Production');
      await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeVisible();
      // switching sections with edits asks before discarding
      await page.getByRole('tab', { name: 'Security & Encryption' }).click();
      const leave = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
      await leave.getByRole('button', { name: 'Keep editing' }).click();
      await page.getByLabel('Meta App ID').fill('not-a-number');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('alert').filter({ hasText: /numeric id/ })).toBeVisible();
      expect(metaAdminState.saves).toHaveLength(0);
      await page.getByLabel('Meta App ID').fill('987654321');
      await page.getByRole('button', { name: 'Save changes' }).click();
      const dlg = page.getByRole('alertdialog', { name: 'Review these changes' });
      await expect(dlg).toContainText('connected channels will likely need to be reconnected');
      await dlg.getByRole('button', { name: 'Save anyway' }).click();
      await expect.poll(() => metaAdminState.saves.length).toBe(1);
      expect(metaAdminState.saves[0]).toMatchObject({
        confirm: true,
        patch: { appName: 'Torio Production', appId: '987654321' },
      });
      await expect(page.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0);
    });

    test('OAuth: channel and customer Facebook sign-in have separate callback URLs, lists and instructions', async ({
      page,
    }) => {
      await open(page);
      await page.getByRole('tab', { name: 'OAuth & Redirect URLs' }).click();
      const channels = page.getByRole('region', { name: 'Meta Business Channels' });
      const customer = page.getByRole('region', { name: 'Customer Facebook Authentication' });
      await expect(channels.getByText('/api/v1/channels/meta/callback').first()).toBeVisible();
      await expect(
        customer.getByText('/api/v1/auth/oauth/facebook/callback').first(),
      ).toBeVisible();
      // each group shows its own route and never the other's
      await expect(channels.getByText('/api/v1/auth/oauth/facebook/callback')).toHaveCount(0);
      await expect(customer.getByText('/api/v1/channels/meta/callback')).toHaveCount(0);
      // honest about Meta: Torio doesn't register anything there
      await expect(
        customer.getByText(/does not add it to the Meta Developer Dashboard/),
      ).toBeVisible();
      await expect(customer.getByText(/FACEBOOK_APP_ID/)).toBeVisible();
      // the Facebook sign-in check shows the real redirect URI and the exact Meta dashboard steps
      await expect(customer.getByText('Server configuration OK')).toBeVisible();
      await expect(customer.getByText('Redirect URI the server sends to Facebook')).toBeVisible();
      await expect(customer.getByText(/Client OAuth Login/)).toBeVisible();
      await expect(customer.getByText(/Valid OAuth Redirect URIs/).first()).toBeVisible();
      // the customer list is independent: adding there leaves the channel list alone
      await customer
        .getByLabel('Add to Allowed customer sign-in redirect URIs')
        .fill('https://app.example.test/api/v1/auth/oauth/facebook/callback');
      await customer.getByRole('button', { name: 'Add' }).click();
      await expect(customer.getByLabel('Allowed customer sign-in redirect URIs 1')).toHaveValue(
        'https://app.example.test/api/v1/auth/oauth/facebook/callback',
      );
      await expect(channels.getByLabel('Allowed channel redirect URIs 2')).toHaveCount(0);
    });

    test('OAuth: exact redirect URI to register, multiple URIs, primary choice; webhooks: copyable URLs and verify token', async ({
      page,
    }) => {
      await open(page);
      await page.getByRole('tab', { name: 'OAuth & Redirect URLs' }).click();
      await expect(page.getByText('/api/v1/channels/meta/callback').first()).toBeVisible();
      await page
        .getByLabel('Add to Allowed channel redirect URIs')
        .fill('https://backup.example.test/api/v1/channels/meta/callback');
      await page
        .getByRole('region', { name: 'Meta Business Channels' })
        .getByRole('button', { name: 'Add' })
        .click();
      await expect(page.getByLabel('Allowed channel redirect URIs 2')).toHaveValue(
        'https://backup.example.test/api/v1/channels/meta/callback',
      );
      await page
        .getByRole('button', {
          name: 'Remove https://backup.example.test/api/v1/channels/meta/callback',
        })
        .click();
      // adding then removing the entry restores the saved list, so nothing is left unsaved
      await expect(page.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0);
      await page.getByRole('tab', { name: 'Webhook Configuration' }).click();
      await expect(
        page.getByText('https://app.example.test/api/v1/webhooks/whatsapp'),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Generate new' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Generate' }).click();
      await expect(page.getByText('generated-token-ABCDEF')).toBeVisible(); // shown once
      expect(metaAdminState.secrets[0]).toMatchObject({
        path: 'POST /secrets/webhook-verify-token/generate',
      });
      await page.getByRole('button', { name: 'Test Webhook Verification' }).click();
      await expect(page.getByText(/don.t match what Torio serves/)).toBeVisible();
      await expect(page.getByText('Set the callback URL in Meta.')).toBeVisible();
      await expect(page.getByText(/4 processed · 1 failed/)).toBeVisible();
    });

    test('diagnostics run real test calls; security explains rotation and re-encrypts only on confirmation; activity lists changes', async ({
      page,
    }) => {
      await open(page);
      await page.getByRole('tab', { name: 'Connection Diagnostics' }).click();
      await page.getByRole('button', { name: 'Test Meta App Credentials' }).click();
      await expect(page.getByText('Meta accepted the App ID and App Secret.')).toBeVisible();
      expect(metaAdminState.tests).toContain('credentials');
      await expect(page.getByText('Not verified yet.')).toBeVisible();
      await page.getByRole('tab', { name: 'Permissions & Products' }).click();
      await expect(page.getByText(/Unknown: Meta doesn.t expose approval/).first()).toBeVisible();
      await page.getByRole('tab', { name: 'Security & Encryption' }).click();
      await expect(page.getByText(/CHANNEL_ENCRYPTION_KEY_PREVIOUS/).first()).toBeVisible();
      await page.getByRole('button', { name: /Re-encrypt stored secrets/ }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Re-encrypt' }).click();
      await expect.poll(() => metaAdminState.reencrypts).toBe(1);
      await page.getByRole('tab', { name: 'Activity Logs' }).click();
      await expect(page.getByText('meta.config.update')).toBeVisible();
      await expect(page.getByText(/changed: appId/)).toBeVisible();
    });
  });
});
