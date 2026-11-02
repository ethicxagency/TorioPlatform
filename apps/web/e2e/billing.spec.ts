import { expect, test, type Page } from '@playwright/test';
import { billingState, mockApi, resetBilling } from './mocks';

const open = async (page: Page, tab = '') => {
  await page.goto(`/billing${tab ? `?tab=${tab}` : ''}`);
  await expect(
    page.getByRole('heading', { name: /Billing & Subscriptions/, level: 1 }),
  ).toBeVisible();
};

test.describe('billing (owner)', () => {
  test.beforeEach(async ({ page }) => {
    resetBilling();
    await mockApi(page, { role: 'OWNER' });
  });

  test('free workspace: overview shows the Free plan, honest credits, and an upgrade path', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByText('Free plan').first()).toBeVisible();
    await expect(page.getByText('Not tracked')).toBeVisible();
    await expect(page.getByText(/AI credits aren.t metered yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upgrade plan' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Cancel subscription' })).toHaveCount(0);
  });

  test('without a provider, a banner explains nothing can be bought and plan actions are disabled with a reason', async ({
    page,
  }) => {
    billingState.configured = false;
    await open(page, 'plans');
    await expect(page.getByText(/Payments aren.t connected/).first()).toBeVisible();
    const upgrade = page.getByRole('button', { name: 'Upgrade' }).first();
    await expect(upgrade).toBeDisabled();
    await expect(upgrade).toHaveAttribute('title', /aren.t connected/);
    await page.getByRole('tab', { name: 'Payment Methods' }).click();
    await expect(page.getByRole('button', { name: 'Add payment method' })).toBeDisabled();
  });

  test('plans: interval toggle, placeholder pricing label, current plan highlight, comparison table', async ({
    page,
  }) => {
    billingState.sub = {
      planKey: 'starter',
      interval: 'MONTH',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    };
    await open(page, 'plans');
    await expect(page.getByText(/placeholders/).first()).toBeVisible();
    await expect(page.getByText('৳1,500', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Yearly' }).click();
    await expect(page.getByText('৳15,000', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Saves 17%/).first()).toBeVisible();
    await expect(page.getByText('Recommended')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to yearly' })).toBeVisible();
    await page.getByRole('button', { name: 'Monthly' }).click();
    await expect(page.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    const t = page.getByRole('table');
    await expect(t.getByRole('columnheader', { name: 'Growth' })).toBeVisible();
    await expect(t.getByText('Unlimited').first()).toBeVisible();
  });

  test('free → paid goes to hosted checkout; the browser never sends a price or status', async ({
    page,
  }) => {
    await open(page, 'plans');
    await page.getByRole('button', { name: 'Upgrade' }).nth(1).click();
    const d = page.getByRole('dialog');
    await expect(d.getByText(/Torio doesn.t estimate prorated amounts/)).toBeVisible();
    await d.getByRole('button', { name: 'Continue to secure checkout' }).click();
    await page.waitForURL(/result=success/);
    await expect(page.getByText(/Back from the provider/)).toBeVisible();
    const sent = billingState.calls.find((c) => c.path.includes('/subscription/checkout'))!;
    expect(Object.keys(sent.body as object).sort()).toEqual(['interval', 'planKey']);
  });

  test('downgrade warns about usage above the new limits and needs explicit acknowledgement', async ({
    page,
  }) => {
    billingState.sub = {
      planKey: 'growth',
      interval: 'MONTH',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    };
    billingState.overMembers = true;
    await open(page, 'plans');
    await page.getByRole('button', { name: 'Downgrade' }).nth(1).click();
    const d = page.getByRole('dialog');
    await expect(d.getByText('You lose')).toBeVisible();
    await expect(d.getByText(/above this plan.s limits/)).toBeVisible();
    const confirm = d.getByRole('button', { name: 'Confirm change' });
    await expect(confirm).toBeDisabled();
    await d.getByRole('checkbox').check();
    await confirm.click();
    await expect(page.getByText(/Plan change submitted/).first()).toBeVisible();
    expect(
      billingState.calls.find((c) => c.path.includes('/subscription/change'))!.body,
    ).toMatchObject({ planKey: 'starter', acknowledgeOverage: true });
  });

  test('cancel: explains access, offers period end or immediate, and shows the outcome only after the server accepts', async ({
    page,
  }) => {
    billingState.sub = {
      planKey: 'growth',
      interval: 'MONTH',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    };
    await open(page);
    await page.getByRole('button', { name: 'Cancel subscription' }).click();
    const d = page.getByRole('dialog', { name: 'Cancel subscription' });
    await expect(d.getByText(/keep full access until then/)).toBeVisible();
    await d.getByLabel('Reason (optional)').fill('Too expensive');
    await d.getByRole('button', { name: 'Cancel at period end' }).click();
    await expect(
      page.getByText(/Cancellation scheduled for the end of the billing period/).first(),
    ).toBeVisible();
    expect(billingState.calls.find((c) => c.path.includes('/subscription/cancel'))!.body).toEqual({
      atPeriodEnd: true,
      reason: 'Too expensive',
    });
  });

  test('scheduled cancellation shows the end date and offers reactivation', async ({ page }) => {
    billingState.sub = {
      planKey: 'growth',
      interval: 'MONTH',
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
    };
    await open(page);
    await expect(page.getByText('Cancels at period end').first()).toBeVisible();
    await expect(page.getByText(/keep full access until then/)).toBeVisible();
    await expect(page.getByText('No renewal: cancellation scheduled')).toBeVisible();
    await page.getByRole('button', { name: 'Reactivate subscription' }).click();
    await expect
      .poll(() => billingState.calls.some((c) => c.path.includes('/subscription/resume')))
      .toBe(true);
  });

  test('past due: failed-payment banner, limited access note, retry from history, plan changes blocked', async ({
    page,
  }) => {
    billingState.sub = {
      planKey: 'growth',
      interval: 'MONTH',
      status: 'PAST_DUE',
      cancelAtPeriodEnd: false,
    };
    await open(page);
    await expect(page.getByRole('alert').filter({ hasText: 'A payment failed' })).toBeVisible();
    await expect(page.getByText('Past due').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change plan' })).toBeDisabled();
    await page.getByRole('button', { name: 'Retry payment' }).click();
    await expect(page.getByRole('tab', { name: 'Billing History', selected: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry payment' }).click();
    await expect(page.getByText('Payment retry submitted.').first()).toBeVisible();
  });

  test('usage shows real meters with warning states and states what is not tracked', async ({
    page,
  }) => {
    await open(page, 'usage');
    await expect(page.getByText('Limit reached').first()).toBeVisible(); // members 3 / 2
    await expect(page.getByText('Approaching limit').first()).toBeVisible(); // contacts 80 / 100
    await expect(page.getByText('Unlimited').first()).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Team members' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    await expect(page.getByRole('button', { name: 'Upgrade plan' })).toBeVisible();
    await expect(page.getByText(/AI conversations, AI credits consumed, Storage/)).toBeVisible();
  });

  test('payment methods: masked cards, default badge, set default, confirmed removal; card entry is hosted', async ({
    page,
  }) => {
    billingState.sub = {
      planKey: 'growth',
      interval: 'MONTH',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    };
    await open(page, 'payment-methods');
    await expect(page.getByText('•••• 4242')).toBeVisible();
    await expect(page.getByText('Default', { exact: true })).toBeVisible();
    await expect(page.getByText(/never the full number or CVV/)).toBeVisible();
    await page.getByRole('button', { name: 'Make default' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Default payment method updated' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'removed from your account at the payment provider',
    );
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect.poll(() => billingState.cards.length).toBe(1);
    await page.getByRole('button', { name: 'Add payment method' }).click();
    await page.waitForURL(/pm=1/);
  });

  test('billing history: filters, invoice details with line items, PDF download', async ({
    page,
  }) => {
    await open(page, 'history');
    await expect(page.getByRole('row', { name: /INV-0003/ })).toBeVisible();
    await page.getByRole('button', { name: 'Paid', exact: true }).click();
    await expect(page.getByRole('row', { name: /INV-0003/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /INV-0002/ })).toBeVisible();
    await page.getByRole('button', { name: 'Refunded' }).click();
    await expect(page.getByText('No invoices with that status.')).toBeVisible();
    await page.getByRole('button', { name: 'Paid', exact: true }).click();
    await page
      .getByRole('row', { name: /INV-0002/ })
      .getByRole('button', { name: 'View' })
      .click();
    const d = page.getByRole('dialog', { name: 'Invoice details' });
    await expect(d.getByText('1 × Growth plan')).toBeVisible();
    await expect(d.getByText('Card ending 4242')).toBeVisible();
    await expect(d.getByText('Subtotal')).toBeVisible();
    await expect(d.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  });

  test('billing information validates, saves through the API, and shows saved values', async ({
    page,
  }) => {
    await open(page, 'info');
    await page.getByRole('button', { name: 'Edit billing information' }).click();
    await page.getByLabel('Billing email').fill('nope');
    await page.getByLabel(/Country/).fill('Bangladesh');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Use a 2-letter code, e.g. BD')).toBeVisible();
    expect(billingState.profilePuts).toHaveLength(0);
    await page.getByLabel('Billing email').fill('pay@acme.co');
    await page.getByLabel(/Country/).fill('bd');
    await page.getByLabel('Business / company name').fill('Acme Ltd');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Acme Ltd')).toBeVisible();
    await expect(page.getByText('BD', { exact: true })).toBeVisible();
    expect(billingState.profilePuts[0]).toMatchObject({
      billingEmail: 'pay@acme.co',
      companyName: 'Acme Ltd',
    });
  });

  test('settings links to billing and no horizontal overflow on a phone', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: /Billing & subscriptions/ })
        .first(),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ['', 'plans', 'usage', 'payment-methods', 'history', 'info']) {
      await open(page, tab);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    }
  });
});

test.describe('billing (admin and agent)', () => {
  test('admins can view but not change anything', async ({ page }) => {
    resetBilling();
    billingState.sub = {
      planKey: 'growth',
      interval: 'MONTH',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    };
    await mockApi(page, { role: 'ADMIN' });
    await open(page);
    await expect(page.getByRole('button', { name: 'Cancel subscription' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Change plan' })).toBeDisabled();
    await page.getByRole('tab', { name: 'Billing Information' }).click();
    await expect(page.getByRole('button', { name: 'Edit billing information' })).toBeDisabled();
    await page.getByRole('tab', { name: 'Payment Methods' }).click();
    await expect(page.getByRole('button', { name: 'Add payment method' })).toBeDisabled();
  });

  test('agents are told billing is for owners and admins', async ({ page }) => {
    resetBilling();
    await mockApi(page, { role: 'AGENT' });
    await page.goto('/billing');
    await expect(
      page.getByText('Billing is available to workspace owners and admins.'),
    ).toBeVisible();
    await page.goto('/settings');
    await expect(
      page.getByRole('list', { name: 'Settings sections' }).getByRole('link', { name: /Billing/ }),
    ).toHaveCount(0);
  });
});
