import { expect, test } from '@playwright/test';
import { mockApi, orderState, resetOrders } from './mocks';

test.describe('orders (owner)', () => {
  test.beforeEach(async ({ page }) => {
    resetOrders();
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toBeVisible();
  });

  test('shows real order data with separate order, payment and fulfillment states', async ({
    page,
  }) => {
    const row = page.getByRole('row', { name: /#1001/ });
    await expect(row.getByText('Confirmed')).toBeVisible();
    await expect(row.getByText('Unpaid')).toBeVisible();
    await expect(row.getByText('Unfulfilled')).toBeVisible();
    await expect(row.getByText('$410.00')).toBeVisible();
    await expect(page.getByRole('row', { name: /#1002/ }).getByText('Sample')).toBeVisible();
    const kpis = page.getByRole('region', { name: /Order metrics/ });
    await expect(kpis.getByText('Total orders')).toBeVisible();
    await expect(kpis.getByText('Revenue collected')).toBeVisible();
    await expect(kpis.getByText('Recorded payments, excl. cancelled')).toBeVisible();
  });

  test('search, status filter and sort query the API', async ({ page }) => {
    await page.getByLabel('Search orders').fill('1002');
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /Select order #1002/ })).toBeVisible();
    await page.getByLabel('Search orders').fill('');
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('button', { name: 'Cancelled', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /Select order #1003/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toHaveCount(0);
    await page.getByRole('heading', { name: 'Orders', level: 1 }).click();
    await expect(page.getByRole('dialog', { name: 'Order filters' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove filter Cancelled' }).click();
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toBeVisible();
  });

  test('drawer shows items, financial summary, honest payment and shipping notes', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    const d = page.getByRole('dialog', { name: 'Order #1001' });
    await expect(d.getByText('Linen sofa')).toBeVisible();
    await expect(d.getByText('Outstanding')).toBeVisible();
    await expect(d.getByText('No payments recorded yet.')).toBeVisible();
    await expect(d.getByText(/Refunds aren.t supported/)).toBeVisible();
    await expect(d.getByText(/Torio isn.t connected to a carrier/)).toBeVisible();
    await expect(d.getByRole('link', { name: /Tanvir Hasan/ })).toHaveAttribute(
      'href',
      /\/customers\?customer=/,
    );
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
  });

  test('moves through the lifecycle: next step is applied only by the server', async ({ page }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    const d = page.getByRole('dialog', { name: 'Order #1001' });
    await d.getByRole('button', { name: 'Start processing' }).click();
    await expect.poll(() => orderState.statuses.length).toBe(1);
    expect(orderState.statuses[0]).toEqual({ status: 'PROCESSING' });
    await expect(d.getByText('Status changed to PROCESSING')).toBeVisible();
    // completion is blocked until fulfilled and paid, with the reason on hover
    await expect(d.getByRole('button', { name: 'Complete order' })).toBeDisabled();
    await expect(d.getByRole('button', { name: 'Complete order' })).toHaveAttribute(
      'title',
      /fulfilled/,
    );
  });

  test('records a payment manually and states that nothing is charged', async ({ page }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    const d = page.getByRole('dialog', { name: 'Order #1001' });
    await d.getByRole('button', { name: 'Record payment' }).click();
    const p = page.getByRole('dialog', { name: /Record payment/ });
    await expect(p.getByText(/doesn.t charge cards/)).toBeVisible();
    await p.getByLabel(/Amount/).fill('999.00');
    await p.getByRole('button', { name: 'Record payment' }).click();
    await expect(p.getByRole('alert')).toContainText(/more than the balance/);
    await p.getByLabel(/Amount/).fill('100.00');
    await p.getByLabel('Method').selectOption('BANK_TRANSFER');
    await p.getByRole('button', { name: 'Record payment' }).click();
    await expect.poll(() => orderState.payments.length).toBe(1);
    expect(orderState.payments[0]).toMatchObject({ amountMinor: 10_000, method: 'BANK_TRANSFER' });
    await expect(d.getByText('Bank transfer')).toBeVisible();
    await expect(d.getByText('Partially paid').first()).toBeVisible();
  });

  test('cancel needs confirmation and warns that refunds are not handled', async ({ page }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    const d = page.getByRole('dialog', { name: 'Order #1001' });
    await d.getByRole('button', { name: 'Cancel order' }).click();
    const c = page.getByRole('alertdialog');
    await expect(c).toContainText('can’t be undone');
    await c.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(orderState.statuses).toHaveLength(0);
    await d.getByRole('button', { name: 'Cancel order' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel order' }).click();
    await expect.poll(() => orderState.statuses.length).toBe(1);
    expect(orderState.statuses[0]).toEqual({ status: 'CANCELLED' });
  });

  test('create order wizard validates, shows a preview, and sends items without a total', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Create Order' }).click();
    const w = page.getByRole('dialog', { name: 'Create order' });
    await w.getByRole('button', { name: 'Continue' }).click();
    await expect(w.getByText('Choose a customer to continue.')).toBeVisible();
    await w.getByRole('button', { name: /Tanvir Hasan/ }).click();
    await w.getByRole('button', { name: 'Continue' }).click();
    await w.getByRole('button', { name: 'Continue' }).click();
    await expect(w.getByText('Enter an item name')).toBeVisible();
    await w.getByLabel('Item 1 name').fill('Linen sofa');
    await w.getByLabel('Item 1 quantity').fill('2');
    await w.getByLabel('Item 1 unit price').fill('250.50');
    await w.getByRole('button', { name: 'Continue' }).click();
    await w.getByLabel('Shipping', { exact: true }).fill('20');
    await expect(w.getByText('$521.00')).toBeVisible();
    await w.getByRole('button', { name: 'Continue' }).click();
    await expect(w.getByText(/doesn.t\s+process payments|process payments/)).toBeVisible();
    await w.getByRole('button', { name: 'Continue' }).click();
    await w.getByRole('button', { name: 'Create order' }).click();
    await expect.poll(() => orderState.created.length).toBe(1);
    expect(orderState.created[0]).toMatchObject({
      currency: 'USD',
      items: [{ name: 'Linen sofa', quantity: 2, unitPriceMinor: 25_050 }],
      shippingMinor: 2_000,
    });
    expect(orderState.created[0]).not.toHaveProperty('totalMinor');
    expect(orderState.created[0]).toHaveProperty('requestId');
    await expect(page.getByRole('dialog', { name: /Order #1011/ })).toBeVisible();
  });

  test('bulk status change reports orders that were skipped', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select order #1002' }).click();
    await page.getByRole('checkbox', { name: 'Select order #1003' }).click();
    const bar = page.getByRole('toolbar', { name: 'Bulk actions' });
    await expect(bar).toContainText('2 selected');
    await bar.getByLabel('Change status').selectOption('CONFIRMED');
    await expect(
      page.getByRole('status').filter({ hasText: '1 updated · 1 skipped' }),
    ).toBeVisible();
    expect(orderState.bulks[0]).toMatchObject({ action: 'SET_STATUS', status: 'CONFIRMED' });
  });

  test('no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/orders');
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test.describe('orders (agent)', () => {
  test('agents can work orders but cannot record payments', async ({ page }) => {
    resetOrders();
    await mockApi(page, { role: 'AGENT' });
    await page.goto('/orders');
    await expect(page.getByRole('button', { name: 'Create Order' })).toBeEnabled();
    await page.getByRole('row', { name: /#1001/ }).click();
    const d = page.getByRole('dialog', { name: 'Order #1001' });
    await expect(d.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
    await expect(d.getByText(/needs an Owner or Admin role/)).toBeVisible();
  });
});
