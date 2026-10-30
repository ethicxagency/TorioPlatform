import { expect, test } from '@playwright/test';
import { brainState, mockApi } from './mocks';

test.describe('brain (admin)', () => {
  test.use({ viewport: { width: 1600, height: 900 } });
  test.beforeEach(async ({ page }) => {
    brainState.version = 3;
    brainState.puts.length = 0;
    await mockApi(page, { role: 'ADMIN' });
    await page.goto('/brain');
    await expect(page.getByRole('heading', { name: 'Brain', level: 1 })).toBeVisible();
  });

  test('shows the header, readiness computed from the form, and section navigation', async ({
    page,
  }) => {
    await expect(page.getByText('Your business. Your rules. Your AI.')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Knowledge readiness' })).toBeVisible();
    await expect(page.getByText(/measures how complete your configuration is/)).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Brain sections' })
      .getByRole('button', { name: 'Knowledge Base' })
      .click();
    await expect(page.getByRole('heading', { name: 'Knowledge Base' })).toBeInViewport();
  });

  test('tracks unsaved changes, saves with the base version, and clears the indicator', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await page.getByLabel('Brand name *').fill('UrbanNest Renamed');
    await expect(page.getByRole('button', { name: /Unsaved changes \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Brain saved' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unsaved changes/ })).toHaveCount(0);
    expect((brainState.puts[0] as { baseVersion: number }).baseVersion).toBe(3);
  });

  test('blocks saving an incomplete configuration and points at the problem', async ({ page }) => {
    await page.getByLabel('Brand name *').fill('');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Business name is required' }).first(),
    ).toBeVisible();
    expect(brainState.puts).toHaveLength(0);
  });

  test('a failed save keeps the user’s edits and explains a conflict', async ({ page }) => {
    brainState.version = 9; // someone else saved
    await page.getByLabel('Brand name *').fill('My edit');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'newer Brain' })).toBeVisible();
    await expect(page.getByLabel('Brand name *')).toHaveValue('My edit');
  });

  test('discard restores the last saved configuration', async ({ page }) => {
    await page.getByLabel('Brand name *').fill('Temp');
    await page.getByRole('button', { name: /Unsaved changes/ }).click();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByLabel('Brand name *')).toHaveValue('UrbanNest (test)');
  });

  test('products: validation in the drawer, then added to the list', async ({ page }) => {
    await page.getByRole('button', { name: 'Add product' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add product' });
    await drawer.getByRole('button', { name: 'Add product' }).click();
    await expect(drawer.getByText('Product name is required.')).toBeVisible();
    await expect(drawer.getByText(/Enter a price in numbers/)).toBeVisible();
    await drawer.getByLabel('Name *').fill('Linen Cushion');
    await drawer.getByLabel('Price (৳) *').fill('650');
    await drawer.getByRole('button', { name: 'Add product' }).click();
    await expect(page.getByText('Linen Cushion')).toBeVisible();
  });

  test('FAQs: required fields, delete with undo', async ({ page }) => {
    await page.getByRole('button', { name: 'Add FAQ' }).click();
    const dlg = page.getByRole('dialog', { name: 'Add FAQ' });
    await dlg.getByRole('button', { name: 'Save FAQ' }).click();
    await expect(dlg.getByText('Question is required.')).toBeVisible();
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Delete Do you offer COD?' }).click();
    await expect(page.getByText('No FAQs yet')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Do you offer COD?').first()).toBeVisible();
  });

  test('custom fields: key uniqueness and per-type validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Add field' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add custom field' });
    await drawer.getByLabel('Field name *').fill('Warranty Period');
    await expect(drawer.getByLabel('Machine key *')).toHaveValue('warranty_period');
    await drawer.getByLabel('Type').selectOption('Single select');
    await drawer.getByRole('button', { name: 'Save field' }).click();
    await expect(drawer.getByText(/Add at least one option/)).toBeVisible();
    await drawer.getByLabel('Options *').fill('3 months, 6 months');
    await drawer.getByRole('button', { name: 'Save field' }).click();
    await expect(page.getByText('warranty_period · Single select')).toBeVisible();
  });

  test('business logic: add a rule and see WHEN/THEN summary; incomplete rules are flagged', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(page.getByText('Incomplete', { exact: true })).toBeVisible();
    await page.getByLabel('Rule name *').fill('Ask location');
    await page.getByLabel('Action text').fill('Inside or outside Dhaka?');
    await expect(page.getByText(/WHEN customer intent is/)).toBeVisible();
    await expect(
      page.getByText(/THEN reply using knowledge: Inside or outside Dhaka\?/),
    ).toBeVisible();
  });

  test('Test your AI is clearly a rule-based preview and uses unsaved edits', async ({ page }) => {
    await expect(page.getByText('Rule-based preview')).toBeVisible();
    await page.getByLabel('Brand name *').fill('Edited Name');
    await expect(page.getByText(/Testing your unsaved edits/)).toBeVisible();
    await page.getByLabel('Customer message').fill('Delivery charge koto?');
    await page.getByRole('button', { name: 'Send' }).click();
    const reply = page.getByRole('log', { name: 'Test conversation' });
    await expect(reply).toContainText('৳60');
    await expect(reply).toContainText('unsaved edits');
    await page.getByRole('button', { name: 'Why this reply?' }).click();
    await expect(reply).toContainText('Customer Policies: delivery fees');
  });

  test('the Test AI button focuses the playground', async ({ page }) => {
    await page.getByRole('button', { name: 'Test AI' }).click();
    await expect(page.getByLabel('Customer message')).toBeFocused();
  });

  test('no horizontal overflow on a phone; Test AI becomes a tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/brain');
    await expect(page.getByRole('heading', { name: 'Brain', level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.getByRole('tab', { name: 'Test AI' }).click();
    await expect(page.getByLabel('Customer message')).toBeVisible();
  });
});

test('agents can read Brain but not edit or save it', async ({ page }) => {
  await mockApi(page, { role: 'AGENT' });
  await page.goto('/brain');
  await expect(page.getByText(/only admins and owners can edit it/)).toBeVisible();
  await expect(page.getByLabel('Brand name *')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(0);
});
