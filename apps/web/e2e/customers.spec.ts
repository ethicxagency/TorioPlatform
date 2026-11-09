import { expect, test } from '@playwright/test';
import { customerRequests, mockApi } from './mocks';

test.describe('customers', () => {
  test.beforeEach(async ({ page }) => {
    customerRequests.length = 0;
    await mockApi(page);
    await page.goto('/customers');
  });

  test('shows real KPIs above the toolbar, marks order-based metrics unavailable, lists customers', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Customers', level: 1 })).toBeVisible();
    await expect(page.getByRole('row', { name: /Tanvir Hasan/ })).toBeVisible();
    for (const t of [
      'Total customers',
      'New customers (30 days)',
      'With conversations',
      'Repeat customers',
      'Revenue · Lifetime value',
    ])
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    // The supporting lines under the numbers are gone.
    for (const t of [
      /\d+ active/,
      'No prior period to compare',
      'Have messaged you in Inbox',
      'Available once Orders is built',
    ])
      await expect(page.getByText(t)).toHaveCount(0);
    await expect(page.getByText('Total customers', { exact: true })).toBeVisible();
    const kpi = (await page.getByText('Total customers', { exact: true }).boundingBox())!;
    const search = (await page.getByRole('searchbox', { name: 'Search customers' }).boundingBox())!;
    expect(kpi.y).toBeLessThan(search.y);
  });

  test('sort menu offers the supported orders and keeps search; tag filter uses workspace tags', async ({
    page,
  }) => {
    await expect(page.getByRole('row', { name: /Tanvir Hasan/ })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search customers' }).fill('tanvir');
    await page.getByRole('button', { name: /^Sort:/ }).click();
    await page
      .getByRole('listbox', { name: 'Sort' })
      .getByRole('option', { name: 'Name Z–A' })
      .click();
    await expect
      .poll(() =>
        customerRequests.some(
          (r) => r.includes('sort=name') && r.includes('dir=desc') && r.includes('q=tanvir'),
        ),
      )
      .toBe(true);

    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Customer filters' });
    await panel.getByRole('button', { name: 'Tag: Any tag' }).click();
    await panel.getByRole('option', { name: 'vip' }).click();
    await expect
      .poll(() => customerRequests.some((r) => r.includes('tag=vip') && r.includes('q=tanvir')))
      .toBe(true);
    await expect(page.getByRole('button', { name: 'Filters, 1 applied' })).toBeVisible();
  });

  test('search and segment changes are sent to the server', async ({ page }) => {
    await expect(page.getByRole('row', { name: /Tanvir Hasan/ })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search customers' }).fill('tanvir');
    await expect.poll(() => customerRequests.some((r) => r.includes('q=tanvir'))).toBe(true);
    await page.getByRole('button', { name: 'Recently active' }).click();
    await expect.poll(() => customerRequests.some((r) => r.includes('segment=recent'))).toBe(true);
  });

  test('order-based segments are disabled, not faked', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'High-value' })).toBeDisabled();
  });

  test('profile drawer shows data, an Open conversation action, and closes with Escape', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /Tanvir Hasan/ }).click();
    const drawer = page.getByRole('dialog', { name: /Customer profile: Tanvir Hasan/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Open conversation' })).toBeVisible();
    await expect(drawer.getByText(/Orders, lifetime value/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('profile drawer: pinned header with actions, grouped sections, real contact links', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /Tanvir Hasan/ }).click();
    const drawer = page.getByRole('dialog', { name: /Customer profile: Tanvir Hasan/ });
    for (const h of [
      'Customer overview',
      'Contact information',
      'Ownership & details',
      'Tags',
      'Recent conversations',
    ])
      await expect(drawer.getByRole('heading', { name: h })).toBeVisible();
    // Quick actions sit in the pinned header, above the scrolling body.
    const head = drawer.locator('header');
    await expect(head.getByRole('button', { name: 'Open conversation' })).toBeVisible();
    await expect(head.getByRole('button', { name: 'Edit' })).toBeVisible();
    // Email and phone are real links with copy actions; missing values say so.
    await expect(drawer.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
    await expect(drawer.getByRole('button', { name: 'Copy email' })).toBeVisible();
    await expect(drawer.getByText('Not provided').first()).toBeVisible();
    // The owner picker is searchable and Escape closes only the drawer once the list is shut.
    await drawer.getByRole('button', { name: /^Customer owner:/ }).click();
    await expect(drawer.getByRole('combobox', { name: 'Search customer owner' })).toBeVisible();
  });

  test('add customer validates then confirms creation from the server', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Customer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add customer' });
    await dialog.getByRole('button', { name: 'Save customer' }).click();
    await expect(dialog.getByText('Full name is required')).toBeVisible();
    await dialog.getByLabel('Full name *').fill('New Person');
    await dialog.getByLabel('Email').fill('nope');
    await dialog.getByRole('button', { name: 'Save customer' }).click();
    await expect(dialog.getByText(/valid email|Invalid email/i).first()).toBeVisible();
    await dialog.getByLabel('Email').fill('new@example.test');
    await dialog.getByRole('button', { name: 'Save customer' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Customer added');
  });

  test('selection shows a bulk toolbar scoped to the selected rows', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select Tanvir Hasan' }).click();
    const bar = page.getByRole('toolbar', { name: 'Bulk actions' });
    await expect(bar).toContainText('1 selected');
    await bar.getByRole('button', { name: 'Clear selection' }).click();
    await expect(bar).toHaveCount(0);
  });

  test('no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customers');
    await expect(page.getByRole('checkbox', { name: 'Select Tanvir Hasan' }).first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});
