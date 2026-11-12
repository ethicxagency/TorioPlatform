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
    for (const t of ['Pending payments', 'Processing', 'Completed'])
      await expect(kpis.getByText(t, { exact: true })).toBeVisible();
    // The supporting lines under the values are gone.
    for (const t of [
      /\d+ cancelled/,
      'Recorded payments, excl. cancelled',
      /outstanding/,
      'Confirmed or in progress',
      'Fulfilled and paid',
    ])
      await expect(kpis.getByText(t)).toHaveCount(0);
  });

  test('search, status filter and sort query the API', async ({ page }) => {
    await page.getByLabel('Search orders').fill('1002');
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /Select order #1002/ })).toBeVisible();
    await page.getByLabel('Search orders').fill('');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelled', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /Select order #1003/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toHaveCount(0);
    await page.getByRole('heading', { name: 'Orders', level: 1 }).click();
    await expect(page.getByRole('dialog', { name: 'Order filters' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove filter Cancelled' }).click();
    await expect(page.getByRole('checkbox', { name: /Select order #1001/ })).toBeVisible();
  });

  test('sort menu and order date filter combine with search', async ({ page }) => {
    await expect(page.getByRole('row', { name: /#1002/ })).toBeVisible();
    await page.getByLabel('Search orders').fill('1002');
    await page.getByRole('button', { name: /^Sort:/ }).click();
    await page
      .getByRole('listbox', { name: 'Sort' })
      .getByRole('option', { name: 'Highest value' })
      .click();
    await expect(page.getByRole('button', { name: 'Sort: Highest value' })).toBeVisible();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('combobox', { name: 'Order date' }).click();
    await page.getByRole('option', { name: /30 days/ }).click();
    await expect(page.getByRole('button', { name: 'Filters, 1 applied' })).toBeVisible();
    await expect(page.getByLabel('Search orders')).toHaveValue('1002');
  });

  test('details page shows items, financial summary, honest payment and shipping notes', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    const d = page.getByRole('main');
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(d.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await expect(d.getByText('Linen sofa')).toBeVisible();
    await expect(d.getByText('Outstanding').first()).toBeVisible();
    await expect(d.getByText('No payments recorded yet.')).toBeVisible();
    await expect(d.getByText(/Refunds aren.t supported/)).toBeVisible();
    await expect(d.getByText(/Torio isn.t connected to a carrier/)).toBeVisible();
    await expect(d.getByRole('link', { name: /Tanvir Hasan/ })).toHaveAttribute(
      'href',
      /\/customers\?customer=/,
    );
    await d.getByRole('button', { name: 'Back to Orders' }).click();
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('Print invoice asks the server for this order only, and says so when it cannot', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    await expect(page.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    // the print dialog belongs to the browser; the page must not print itself, only request the invoice document
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => ((window as unknown as { printed: number }).printed += 1);
    });
    await page.getByRole('button', { name: 'Print invoice' }).click();
    await expect.poll(() => orderState.invoiceRequests.length).toBe(1);
    expect(orderState.invoiceRequests[0]).toMatch(/^\/[0-9a-f-]+\/invoice$/);
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(0);
    // a server that cannot create the invoice is reported, not hidden
    orderState.invoiceError = 'Invoices are not available yet.';
    await page.getByRole('button', { name: 'Print invoice' }).click();
    await expect(page.getByText('Invoices are not available yet.')).toBeVisible();
  });

  test('Download invoice (PDF) saves the server-named file', async ({ page }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    await expect(page.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await page.getByRole('button', { name: /More/ }).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Download invoice (PDF)' }).click();
    expect((await dl).suggestedFilename()).toBe('TORIO-INV-00001.pdf');
    await expect(page.getByText('Invoice downloaded')).toBeVisible();
  });

  test('back keeps the search, and a direct or invalid link behaves', async ({ page }) => {
    await page.goto('/orders');
    await page.getByLabel('Search orders').fill('1001');
    await page.getByRole('row', { name: /#1001/ }).click();
    await expect(page.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Orders' }).click();
    await expect(page.getByLabel('Search orders')).toHaveValue('1001');
    await page.getByRole('row', { name: /#1001/ }).click();
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await page.goto('/orders/does-not-exist');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      /Order not found|load this order/,
    );
    await expect(page.getByRole('button', { name: 'Back to Orders' }).first()).toBeVisible();
  });

  test('moves through the lifecycle: next step is applied only by the server', async ({ page }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    const d = page.getByRole('main');
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(d.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
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
    const d = page.getByRole('main');
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(d.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
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
    const d = page.getByRole('main');
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(d.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await d.getByRole('button', { name: 'More actions' }).click();
    await d.getByRole('menuitem', { name: 'Cancel order' }).click();
    const c = page.getByRole('alertdialog');
    await expect(c).toContainText('can’t be undone');
    await c.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(orderState.statuses).toHaveLength(0);
    await d.getByRole('button', { name: 'More actions' }).click();
    await d.getByRole('menuitem', { name: 'Cancel order' }).click();
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
    await expect(w.getByText('৳521')).toBeVisible(); // new orders default to BDT
    await w.getByRole('button', { name: 'Continue' }).click();
    await expect(w.getByText(/doesn.t\s+process payments|process payments/)).toBeVisible();
    await w.getByRole('button', { name: 'Continue' }).click();
    await w.getByRole('button', { name: 'Create order' }).click();
    await expect.poll(() => orderState.created.length).toBe(1);
    expect(orderState.created[0]).toMatchObject({
      currency: 'BDT',
      items: [{ name: 'Linen sofa', quantity: 2, unitPriceMinor: 25_050 }],
      shippingMinor: 2_000,
    });
    expect(orderState.created[0]).not.toHaveProperty('totalMinor');
    expect(orderState.created[0]).toHaveProperty('requestId');
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /Order #1011/ })).toBeVisible();
  });

  test('editing: save is grey until something changes, restores clear, one save persists everything', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#1002/ }).click();
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: /Order #1002/ })).toBeVisible();
    const save = main.getByRole('button', { name: 'Save changes' });
    await expect(save).toBeDisabled();
    await main.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const qty = main.getByLabel('Item 1 quantity');
    await qty.focus();
    await expect(save).toBeDisabled(); // touching is not changing
    await qty.fill('3');
    await expect(save).toBeEnabled();
    await expect(main.getByText('Unsaved changes')).toBeVisible();
    await qty.fill('2');
    await expect(save).toBeDisabled(); // restored value clears the dirty state
    await qty.fill('3');
    await main.getByLabel('Discount').fill('10');
    await main.getByLabel('Shipping address').fill('House 4, Road 2');
    await save.click();
    await expect.poll(() => orderState.updates.length).toBe(1);
    expect(orderState.updates[0]).toMatchObject({
      items: [{ name: 'Oak table', quantity: 3, unitPriceMinor: 9_500 }],
      discountMinor: 1_000,
      shippingAddress: 'House 4, Road 2',
    });
    await expect(page.getByRole('status').filter({ hasText: 'Order changes saved' })).toBeVisible();
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(main.getByText('House 4, Road 2')).toBeVisible();
    await expect(main.getByText('$285.00').first()).toBeVisible(); // 3 x 95 - 10 + 10 shipping
  });

  test('a failed save keeps the edits and the save button', async ({ page }) => {
    orderState.failUpdate = true;
    await page.getByRole('row', { name: /#1002/ }).click();
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await main.getByLabel('Item 1 quantity').fill('5');
    await main.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      main.getByRole('alert').filter({ hasText: 'changed while you were editing' }),
    ).toBeVisible();
    await expect(main.getByLabel('Item 1 quantity')).toHaveValue('5');
    await expect(main.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  test('invalid quantity blocks saving and is explained', async ({ page }) => {
    await page.getByRole('row', { name: /#1002/ }).click();
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await main.getByLabel('Item 1 quantity').fill('');
    await main.getByRole('button', { name: 'Save changes' }).click();
    await expect(main.getByText(/Quantity must be a whole number/)).toBeVisible();
    expect(orderState.updates).toHaveLength(0);
  });

  test('unsaved edits are protected: leaving asks first, processing never silently discards', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#1002/ }).click();
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await main.getByLabel('Item 1 quantity').fill('5');
    await main.getByRole('button', { name: 'Back to Orders' }).click();
    const leave = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
    await leave.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await page.getByRole('link', { name: 'Customers' }).first().click();
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'Keep editing' }).click();
    await main.getByRole('button', { name: 'Confirm order' }).click();
    const ask = page.getByRole('alertdialog', { name: 'Save your changes first?' });
    await ask.getByRole('button', { name: 'Keep editing' }).click();
    expect(orderState.statuses).toHaveLength(0);
    await main.getByRole('button', { name: 'Confirm order' }).click();
    await ask.getByRole('button', { name: 'Save and continue' }).click();
    await expect.poll(() => orderState.statuses.length).toBe(1);
    expect(orderState.updates).toHaveLength(1);
  });

  test('discard drops the edits and leaving is then unblocked', async ({ page }) => {
    await page.getByRole('row', { name: /#1002/ }).click();
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await main.getByLabel('Item 1 quantity').fill('5');
    await main.getByRole('button', { name: 'Discard' }).click();
    await expect(main.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await main.getByRole('button', { name: 'Back to Orders' }).click();
    await expect(page).toHaveURL(/\/orders$/);
  });

  test('a confirmed order locks items and pricing but still allows shipping details', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#1001/ }).click();
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(main.getByText(/can only change while the order is Pending/)).toBeVisible();
    await expect(main.getByLabel('Item 1 quantity')).toHaveCount(0);
    await main.getByLabel('Shipping method').fill('Courier');
    await main.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => orderState.updates.length).toBe(1);
    expect(orderState.updates[0]).toEqual({ shippingAddress: null, shippingMethod: 'Courier' });
  });

  test('bulk status change reports orders that were skipped', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select order #1002' }).click();
    await page.getByRole('checkbox', { name: 'Select order #1003' }).click();
    const bar = page.getByRole('toolbar', { name: 'Bulk actions' });
    await expect(bar).toContainText('2 selected');
    await bar.getByRole('combobox', { name: 'Change status' }).click();
    await page.getByRole('option', { name: /Mark confirmed/ }).click();
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
    const d = page.getByRole('main');
    await expect(page).toHaveURL(/\/orders\/[^/]+$/);
    await expect(d.getByRole('heading', { name: /Order #1001/ })).toBeVisible();
    await expect(d.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
    await expect(d.getByText(/needs an Owner or Admin role/)).toBeVisible();
  });
});
