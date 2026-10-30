import { expect, test } from '@playwright/test';
import { autoState, mockApi, resetAutomation } from './mocks';

test.describe('automation (owner)', () => {
  test.beforeEach(async ({ page }) => {
    resetAutomation();
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/automation');
    await expect(page.getByRole('heading', { name: 'Automation', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Flag large orders' })).toBeVisible();
  });

  test('shows persisted metrics and workflow rows with real status', async ({ page }) => {
    const k = page.getByRole('region', { name: 'Automation metrics' });
    await expect(k.getByText('Total automations')).toBeVisible();
    await expect(k.getByText('Failed runs')).toBeVisible();
    await expect(page.getByText(/Last run \d/).first()).toBeVisible();
    await expect(page.getByText('1 failed').first()).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  });

  test('tabs filter by status; search and trigger filters work', async ({ page }) => {
    await page.getByRole('tab', { name: 'Drafts' }).click();
    await expect(page.getByRole('link', { name: 'Tag Instagram customers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Flag large orders' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Active' }).click();
    await expect(page.getByRole('link', { name: 'Flag large orders' })).toBeVisible();
    await page.getByRole('tab', { name: 'All automations' }).click();
    await page.getByLabel('Search automations').fill('zzz');
    await expect(page.getByText('No automations match your filters')).toBeVisible();
  });

  test('templates create a draft only after you choose; nothing is activated', async ({ page }) => {
    await page.getByRole('tab', { name: 'Templates' }).click();
    await expect(page.getByText(/nothing runs automatically/)).toBeVisible();
    await page
      .getByRole('button', { name: /Flag large orders|Flag large orders/ })
      .first()
      .click();
    const d = page.getByRole('dialog', { name: 'Flag large orders' });
    await expect(d.getByText('None required')).toBeVisible();
    await d.getByRole('button', { name: 'Create draft' }).click();
    await expect.poll(() => autoState.created.length).toBe(1);
    expect(autoState.created[0]).toMatchObject({ templateKey: 'flag-large-orders' });
    expect(autoState.published).toHaveLength(0);
    await expect(page).toHaveURL(/\/automation\/a1a1a1a1/);
  });

  test('create dialog needs a name and creates an empty draft', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Automation' }).click();
    const d = page.getByRole('dialog', { name: 'Create automation' });
    await d.getByRole('button', { name: 'Create draft' }).click();
    await expect(d.getByText('Name is required')).toBeVisible();
    await d.getByLabel('Name').fill('Welcome');
    await d.getByLabel('When this happens').selectOption('lead.created');
    await d.getByRole('button', { name: 'Create draft' }).click();
    await expect.poll(() => autoState.created.length).toBe(1);
    expect(autoState.created[0]).toMatchObject({ name: 'Welcome', trigger: 'lead.created' });
  });

  test('enable fails with the server reason when the draft is invalid; disable and delete are confirmed', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Actions for Tag Instagram customers' }).click();
    await page.getByRole('menuitem', { name: 'Enable' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'tag is required' })).toBeVisible();
    expect(autoState.published).toHaveLength(0);
    await page.getByRole('button', { name: 'Actions for Tag Instagram customers' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const c = page.getByRole('alertdialog');
    await expect(c).toContainText('permanently deleted');
    await c.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => autoState.deleted.length).toBe(1);
    await page.getByRole('button', { name: 'Actions for Flag large orders' }).click();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeDisabled();
    await page.getByRole('menuitem', { name: 'Disable' }).click();
    await expect.poll(() => autoState.deactivated.length).toBe(1);
  });

  test('execution history lists real runs and opens a step timeline with retry for failures', async ({
    page,
  }) => {
    await page.getByRole('tab', { name: 'Execution history' }).click();
    await expect(page.getByText('Production runs only')).toBeVisible();
    await page.getByRole('button', { name: /Flag large orders.*Succeeded/ }).click();
    const d = page.getByRole('dialog', { name: 'Run details' });
    await expect(d.getByText('Added an internal note to the order')).toBeVisible();
    await expect(d.getByText(/never stored with a run/)).toBeVisible();
    await expect(d.getByRole('button', { name: /Retry/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Flag large orders.*Failed/ }).click();
    await expect(d.getByText('The order no longer exists').first()).toBeVisible();
    await d.getByRole('button', { name: 'Retry from the failed step' }).click();
    await expect.poll(() => autoState.retried.length).toBe(1);
  });

  test('editor: edit a step, see validation, save, test with sample data, publish after confirmation', async ({
    page,
  }) => {
    await page.getByRole('link', { name: 'Flag large orders' }).click();
    await expect(page.getByLabel('Automation name')).toHaveValue('Flag large orders');
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(page.getByText('No problems found')).toBeVisible();
    // select the note step and clear its text → validation points at it
    await page
      .getByRole('button', { name: /Add internal note to order/ })
      .first()
      .click();
    const panel = page.getByRole('region', { name: 'Step settings' }).first();
    await panel.getByLabel('Note text').fill('');
    await expect(page.getByText('Unsaved changes').first()).toBeVisible();
    await expect(page.getByText(/1 problem to fix/)).toBeVisible();
    await expect(page.getByText('Needs attention')).toBeVisible();
    await panel.getByLabel('Note text').fill('Check {{customer.name}}');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect.poll(() => autoState.patches.length).toBe(1);
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(page.getByText('Unpublished changes').first()).toBeVisible();

    await page.getByRole('button', { name: 'Test workflow' }).click();
    const t = page.getByRole('dialog', { name: 'Test workflow' });
    await expect(t.getByText(/Nothing is sent/)).toBeVisible();
    await t.getByRole('button', { name: 'Run test' }).click();
    await expect(t.getByRole('region', { name: 'Test result' })).toContainText(
      'Nothing was changed',
    );
    await t.getByRole('button', { name: 'Close' }).first().click();

    await page.getByRole('button', { name: 'Publish changes' }).click();
    const c = page.getByRole('alertdialog');
    await expect(c).toContainText('No messages are sent to customers');
    await c.getByRole('button', { name: 'Publish' }).click();
    await expect.poll(() => autoState.published.length).toBe(1);
  });

  test('editor: adding steps from the library, reordering and deleting; invalid triggers are not offered', async ({
    page,
  }) => {
    await page.goto(`/automation/${autoState.list[1]!.id}`);
    await expect(page.getByLabel('Automation name')).toHaveValue('Tag Instagram customers');
    await expect(page.getByText(/1 problem to fix/)).toBeVisible();
    await page.getByRole('button', { name: 'Wait', exact: false }).first().click();
    await expect(page.getByRole('button', { name: /Wait 1 hour/ })).toBeVisible();
    await page.getByRole('button', { name: 'Move step 2 up' }).click();
    await page.getByRole('button', { name: 'Delete step 1' }).click();
    await expect(page.getByRole('button', { name: /Wait 1 hour/ })).toHaveCount(0);
    // conversation actions are unavailable for a customer trigger
    await expect(page.getByRole('button', { name: /^Assign conversation/ }).first()).toBeDisabled();
    await expect(
      page.getByText(/Sending customer messages, branching and external calls/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to Automation' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Discard unsaved changes?');
  });

  test('no horizontal overflow on a phone; settings open as a full-screen sheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/automation');
    await expect(page.getByRole('link', { name: 'Flag large orders' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
    await page.goto(`/automation/${autoState.list[0]!.id}`);
    await page
      .getByRole('button', { name: /Add internal note to order/ })
      .first()
      .click();
    const sheet = page.getByRole('dialog', { name: 'Step settings' });
    await expect(sheet.getByLabel('Note text')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test.describe('automation (agent)', () => {
  test('agents can view but not create, activate or edit', async ({ page }) => {
    resetAutomation();
    await mockApi(page, { role: 'AGENT' });
    await page.goto('/automation');
    await expect(page.getByRole('button', { name: 'Create Automation' })).toBeDisabled();
    await page.getByRole('link', { name: 'Flag large orders' }).click();
    await expect(page.getByText(/Editing needs Owner or Admin access/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Test workflow' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Publish changes' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
  });
});
