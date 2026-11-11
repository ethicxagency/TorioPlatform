import { expect, test, type Page } from '@playwright/test';
import { billingState, mockApi, resetBilling, resetSettings, settingsState } from './mocks';

/** `tab` is '' (the plan), 'plans' or 'usage' on the Subscription page; 'invoices' opens the Billing page. */
const open = async (page: Page, tab = '') => {
  if (tab === 'invoices' || tab === 'payment-methods' || tab === 'info' || tab === 'history') {
    await page.goto('/billing/invoices');
    await expect(page.getByRole('heading', { name: 'Billing', level: 1 })).toBeVisible();
  } else {
    await page.goto(`/billing/subscription${tab ? `?tab=${tab}` : ''}`);
    await expect(page.getByRole('heading', { name: /^Subscription/, level: 1 })).toBeVisible();
  }
};

test.describe('billing (owner)', () => {
  test.beforeEach(async ({ page }) => {
    resetBilling();
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('free workspace: the Free plan, no invented payment date, and an upgrade path', async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByText('Free plan').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upgrade plan' }).first()).toBeEnabled();
    await expect(page.getByText('No renewal required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel subscription' })).toHaveCount(0);
    await expect(page.getByText('Next payment')).toHaveCount(0); // a free plan has none
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
    await open(page, 'payment-methods');
    // one compact status, and no action that looks functional
    await expect(page.getByText('Payment provider not connected')).toHaveCount(1);
    await expect(page.getByText(/currently unavailable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add payment method' })).toHaveCount(0);
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
    await expect(page.getByText('Recommended').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to yearly' })).toBeVisible();
    await page.getByRole('button', { name: 'Monthly' }).click();
    await expect(page.getByRole('button', { name: 'Current plan' })).toBeDisabled();
    const t = page.getByRole('table');
    await expect(t.getByRole('columnheader', { name: 'Growth' })).toBeVisible();
    await expect(t.getByText('Unlimited').first()).toBeVisible();
  });

  test('compare plans: grouped rows, all four plans, prices exact, no page overflow on a phone', async ({
    page,
  }) => {
    await open(page, 'plans');
    const t = page.getByRole('table');
    for (const n of ['Free', 'Starter', 'Growth', 'Scale'])
      await expect(t.getByRole('columnheader', { name: new RegExp(n) })).toBeVisible();
    for (const g of [
      'Team & channels',
      'Customer capacity',
      'Messaging & usage',
      'AI capabilities',
      'Pricing',
    ])
      await expect(t.getByText(g, { exact: true })).toBeVisible();
    const price = t.getByRole('row', { name: /Price \(monthly\)/ });
    for (const v of ['৳0', '৳1,500', '৳4,500', '৳12,000'])
      await expect(price.getByText(v, { exact: true })).toBeVisible();
    await expect(t.getByText('Not metered yet')).toHaveCount(4);
    await expect(
      t.getByRole('columnheader', { name: /Growth/ }).getByText('Recommended'),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Scroll for more plans')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
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
    await expect(page.getByText('Access until', { exact: true })).toBeVisible(); // no renewal date is shown
    await page.getByRole('button', { name: 'Reactivate subscription' }).click();
    await expect
      .poll(() => billingState.calls.some((c) => c.path.includes('/subscription/resume')))
      .toBe(true);
  });

  test('past due: failed-payment banner, limited access note, retry from Billing, plan changes blocked', async ({
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
    await page.getByRole('button', { name: 'Retry payment' }).first().click();
    await expect(page).toHaveURL(/\/billing\/invoices$/);
    await page.getByRole('button', { name: 'Retry payment' }).last().click();
    await expect(page.getByText('Payment retry submitted.').first()).toBeVisible();
  });

  test('usage shows real meters with warning states and states what is not tracked', async ({
    page,
  }) => {
    await open(page, 'usage');
    await expect(page.getByText('Limit exceeded').first()).toBeVisible(); // members 3 / 2: the real count, not a capped 2
    await expect(page.getByText('1 over')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Team members' })).toHaveAttribute(
      'aria-valuetext',
      '3 of 2 used',
    );
    await expect(page.getByText('Approaching limit').first()).toBeVisible(); // contacts 80 / 100
    await expect(page.getByText('Unlimited').first()).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Team members' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    await expect(page.getByRole('button', { name: 'Upgrade plan' }).first()).toBeVisible();
    await expect(page.getByText(/AI conversations, AI credits consumed, Storage/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Usage and limits' })).toBeVisible();
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
    await expect(page.getByText(/added on the payment provider.s secure page/)).toBeVisible();
    await expect(page.getByText('Expires 12/2030')).toBeVisible();
    await page.getByRole('button', { name: 'Set as default' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Default payment method updated' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^More actions for visa/i }).click();
    await page.getByRole('menuitem', { name: 'Remove payment method' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'removed from your account at the payment provider',
    );
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect.poll(() => billingState.cards.length).toBe(1);
    await page.getByRole('button', { name: 'Add payment method' }).click();
    await page.waitForURL(/pm=1/);
  });

  test('billing: overview figures, invoice table with currency, status filter, details and PDF', async ({
    page,
  }) => {
    await open(page, 'invoices');
    const overview = page.getByRole('list', { name: 'Billing overview' });
    await expect(
      overview.getByRole('listitem').filter({ hasText: 'Total invoices' }),
    ).toContainText('2');
    await expect(overview.getByRole('listitem').filter({ hasText: 'Paid invoices' })).toContainText(
      '1',
    );
    await expect(overview.getByRole('listitem').filter({ hasText: 'Outstanding' })).toContainText(
      '$49',
    );
    await expect(page.getByRole('row', { name: /INV-0003/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /INV-0003/ })).toContainText('$49.00');
    await page.getByRole('button', { name: 'Paid', exact: true }).click();
    await expect(page.getByRole('row', { name: /INV-0003/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /INV-0002/ })).toBeVisible();
    await page.getByRole('button', { name: 'Refunded' }).click();
    await expect(page.getByText('No invoices match your filters')).toBeVisible();
    // the overview describes the whole history, not the filtered list
    await expect(
      overview.getByRole('listitem').filter({ hasText: 'Total invoices' }),
    ).toContainText('2');
    await page.getByRole('button', { name: 'Paid', exact: true }).click();
    await page
      .getByRole('row', { name: /INV-0002/ })
      .getByRole('button', { name: /^View invoice INV-0002/ })
      .click();
    const d = page.getByRole('dialog', { name: 'Invoice details' });
    await expect(d.getByText('1 × Growth plan')).toBeVisible();
    await expect(d.getByText('Card ending 4242')).toBeVisible();
    await expect(d.getByText('Subtotal')).toBeVisible();
    await expect(d.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  });

  test('billing: search and date range go to the server, and can be cleared', async ({ page }) => {
    await open(page, 'invoices');
    await page.getByLabel('Search invoices').fill('INV-0002');
    await expect(page.getByRole('row', { name: /INV-0003/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /INV-0002/ })).toBeVisible();
    expect(billingState.invoiceQueries.some((q) => q.q === 'INV-0002')).toBe(true);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.getByRole('row', { name: /INV-0003/ })).toBeVisible();
    await page.getByRole('button', { name: 'Any date' }).click();
    await page.getByLabel('From date').fill('2999-01-01');
    await page.keyboard.press('Escape');
    await expect(page.getByText('No invoices match your filters')).toBeVisible();
    expect(billingState.invoiceQueries.some((q) => q.from === '2999-01-01')).toBe(true);
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.getByRole('row', { name: /INV-0003/ })).toBeVisible();
  });

  test('billing: with no invoices the empty state says so and nothing is invented', async ({
    page,
  }) => {
    billingState.noInvoices = true;
    await open(page, 'invoices');
    await expect(page.getByText('No invoices yet')).toHaveCount(0);
    await expect(
      page.getByText('Invoices appear here with their payment status and a download option.'),
    ).toBeVisible();
    // no table header, rows or pagination around an empty list
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(/Showing \d/)).toHaveCount(0);
    const overview = page.getByRole('list', { name: 'Billing overview' });
    for (const gone of ['None issued yet', 'Nothing paid yet', 'No invoices yet'])
      await expect(page.getByText(gone)).toHaveCount(0);
    await expect(
      overview.getByRole('listitem').filter({ hasText: 'Total invoices' }),
    ).toContainText('0');
  });

  test('billing details are not edited here: no Billing information section, and complete details show no notice', async ({
    page,
  }) => {
    settingsState.workspace.contactEmail = 'pay@acme.co';
    settingsState.workspace.country = 'BD';
    await open(page, 'invoices');
    await expect(page.getByText('Billing information', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /billing information/i })).toHaveCount(0);
    await expect(page.getByTestId('billing-details-notice')).toHaveCount(0);
    // only the overview, the invoices and the payment methods
    await expect(page.getByRole('list', { name: 'Billing overview' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Invoices' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Payment methods' })).toBeVisible();
  });

  test('missing invoice details are named, with a link to Settings → General', async ({ page }) => {
    await open(page, 'invoices'); // the default store has no email or country saved
    const n = page.getByTestId('billing-details-notice');
    await expect(n).toContainText('Email');
    await expect(n).toContainText('Country');
    await n.getByRole('link', { name: /Settings → General/ }).click();
    await expect(page).toHaveURL(/\/settings\/general#workspace$/);
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  });

  test('invoice sorting goes to the server and reorders the list', async ({ page }) => {
    await open(page, 'invoices');
    const first = page.getByRole('row').nth(1);
    await expect(first).toContainText('INV-0003'); // newest first
    await page.getByRole('combobox', { name: 'Sort invoices' }).click();
    await page.getByRole('option', { name: 'Oldest first' }).click();
    await expect(page.getByRole('row').nth(1)).toContainText('INV-0002');
    expect(billingState.invoiceQueries.some((q) => q.sort === 'date_asc')).toBe(true);
  });

  test('on a phone invoices are compact cards, with secondary actions in a menu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'invoices');
    await expect(page.getByRole('table')).toBeHidden();
    const card = page.getByRole('listitem').filter({ hasText: 'INV-0003' }).last();
    await expect(card).toContainText('Failed');
    await expect(card).toContainText('$49.00');
    await expect(card.getByRole('button', { name: /View invoice/ })).toBeVisible();
    await card.getByRole('button', { name: /^More actions for INV-0003/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Download PDF' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Retry payment' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('settings lists Subscription and Billing once each, and the old route redirects', async ({
    page,
  }) => {
    await page.goto('/settings');
    const nav = page.getByRole('navigation', { name: 'Settings' });
    await expect(nav.getByRole('link', { name: /^Subscription/ })).toHaveCount(1);
    await expect(nav.getByRole('link', { name: /^Billing$/ })).toHaveCount(1);
    await expect(nav.getByRole('link', { name: /Billing & Subscriptions/ })).toHaveCount(0);
    await nav.getByRole('link', { name: /^Subscription/ }).click();
    await expect(page).toHaveURL(/\/billing\/subscription$/);
    await expect(nav.getByRole('link', { name: /^Subscription/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nav.getByRole('link', { name: /^Billing$/ }).click();
    await expect(page).toHaveURL(/\/billing\/invoices$/);
    await expect(nav.getByRole('link', { name: /^Billing$/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // the old combined page and its section links
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/billing\/subscription$/);
    await page.goto('/billing?tab=plans');
    await expect(page).toHaveURL(/\/billing\/subscription\?tab=plans$/);
    await page.goto('/billing?tab=history');
    await expect(page).toHaveURL(/\/billing\/invoices\?section=invoices$/);
    await page.goto('/billing?tab=info'); // billing details live in General Settings now
    await expect(page).toHaveURL(/\/settings\/general#workspace$/);
    // a provider return link keeps its result
    await page.goto('/billing?result=success&pm=1');
    await expect(page).toHaveURL(/\/billing\/invoices\?result=success&section=payment-methods$/);
    await page.goto('/billing?result=cancelled');
    await expect(page).toHaveURL(/\/billing\/subscription\?result=cancelled$/);
  });

  test('the two pages keep their own content and fit a phone', async ({ page }) => {
    billingState.sub = {
      planKey: 'growth',
      interval: 'MONTH',
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
    };
    await open(page);
    await expect(page.getByRole('heading', { name: 'Usage & limits' })).toBeVisible();
    await expect(page.getByText('Payment methods', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await open(page, 'invoices');
    await expect(page.getByRole('heading', { name: 'Usage & limits' })).toHaveCount(0);
    await expect(page.getByText('Payment methods', { exact: true })).toBeVisible();
    await expect(page.getByText('Billing information', { exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ['', 'plans', 'usage', 'invoices']) {
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
    await open(page, 'invoices');
    await expect(page.getByRole('button', { name: 'Add payment method' })).toBeDisabled();
  });

  test('agents are told billing is for owners and admins', async ({ page }) => {
    resetBilling();
    await mockApi(page, { role: 'AGENT' });
    await page.goto('/billing/subscription');
    await expect(
      page.getByText('Billing is available to workspace owners and admins.'),
    ).toBeVisible();
    await page.goto('/billing/invoices');
    await expect(
      page.getByText('Billing is available to workspace owners and admins.'),
    ).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: /Billing/ }),
    ).toHaveCount(0);
  });
});
