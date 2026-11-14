import { expect, test } from '@playwright/test';
import { choose } from './select';
import { mockApi } from './mocks';

test.describe('team (owner)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/team');
  });

  test('shows real KPIs without placeholder labels, lists members', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
    await expect(page.getByRole('row', { name: /Nadia Islam/ })).toBeVisible();
    for (const gone of [
      "Presence isn't tracked yet",
      'Online agents',
      'Accounts with access',
      'Not yet accepted',
      'Open, no assignee',
      '0 suspended',
    ])
      await expect(page.getByText(gone)).toHaveCount(0);
    await expect(page.getByText('Total members', { exact: true })).toBeVisible();
  });

  test('member drawer offers role change only within policy and asks before applying', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /Nadia Islam/ }).click();
    const drawer = page.getByRole('dialog', { name: /Member: Nadia Islam/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel('Role')).toBeVisible();
    await expect(drawer.getByRole('option', { name: 'Owner' })).toHaveCount(0); // owner can never be granted
    await choose(drawer.getByLabel('Role'), 'ADMIN');
    await expect(page.getByRole('alertdialog')).toContainText("Change Nadia Islam's role?");
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  });

  test('a member cannot manage themself', async ({ page }) => {
    await page.getByRole('row', { name: /Farid Ahmed/ }).click();
    const drawer = page.getByRole('dialog', { name: /Member: Farid Ahmed/ });
    await expect(drawer.getByLabel('Role')).toHaveCount(0);
    await expect(drawer.getByText(/can.t change your own access/)).toBeVisible();
  });

  test('invite validates, shows the one-time link and is honest that email is not sent', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Invite Member' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invite member' });
    await dialog.getByRole('button', { name: 'Create invitation' }).click();
    await expect(dialog.getByText(/valid email|Invalid email/i).first()).toBeVisible();
    await dialog.getByLabel('Email address *').fill('new.hire@example.test');
    await dialog.getByRole('button', { name: 'Create invitation' }).click();
    await expect(page.getByRole('dialog', { name: 'Invitation created' })).toContainText(
      "Torio doesn't send email yet",
    );
    await expect(page.getByLabel('Invitation link')).toHaveValue(/accept-invite\?token=/);
  });

  test('invitations and roles tabs', async ({ page }) => {
    await page.getByRole('tab', { name: /Invitations/ }).click();
    await expect(page.getByText('pending@example.test')).toBeVisible();
    await page.getByRole('tab', { name: 'Roles & permissions' }).click();
    await expect(page.getByRole('table', { name: 'Role permissions' })).toBeVisible();
    await expect(page.getByText(/Custom roles aren.t supported/)).toBeVisible();
  });

  test('the toolbar is one compact row: search, role, status and team side by side', async ({
    page,
  }) => {
    await expect(page.getByRole('row', { name: /Nadia Islam/ })).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search members' });
    const role = page.getByRole('combobox', { name: 'Filter by role' });
    const status = page.getByRole('combobox', { name: 'Filter by status' });
    const boxes = await Promise.all([search, role, status].map((l) => l.boundingBox()));
    const [s, r, st] = boxes;
    expect(Math.abs(s!.y - r!.y)).toBeLessThan(12); // same row
    expect(Math.abs(r!.y - st!.y)).toBeLessThan(4);
    expect(r!.width).toBeGreaterThanOrEqual(180);
    expect(r!.width).toBeLessThanOrEqual(200);
    expect(r!.height).toBeGreaterThanOrEqual(40);
    expect(st!.width).toBeLessThanOrEqual(180);
  });

  test('filters ask the API, show removable chips, and Clear all resets them', async ({ page }) => {
    await expect(page.getByRole('row', { name: /Nadia Islam/ })).toBeVisible();
    await choose(page.getByRole('combobox', { name: 'Filter by role' }), 'ADMIN');
    const chips = page.getByLabel('Active filters');
    await expect(chips).toContainText('Admin');
    await expect(page.getByRole('row', { name: /Nadia Islam/ })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search members' }).fill('farid');
    await expect(chips).toContainText('“farid”');
    await expect(chips.getByRole('button', { name: 'Clear all' })).toBeVisible();
    await chips.getByRole('button', { name: 'Remove filter Admin' }).click();
    await expect(page.getByRole('row', { name: /Farid Ahmed/ })).toBeVisible();
    await expect(chips).not.toContainText('Admin');
    await chips.getByRole('button', { name: 'Remove filter “farid”' }).click();
    await expect(chips).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Nadia Islam/ })).toBeVisible();
  });

  test('empty results say what was filtered, and Clear filters brings everyone back', async ({
    page,
  }) => {
    await page.getByRole('searchbox', { name: 'Search members' }).fill('zzz');
    await expect(page.getByText('No members match “zzz”')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search members' }).fill('');
    await choose(page.getByRole('combobox', { name: 'Filter by status' }), 'SUSPENDED');
    await expect(page.getByText('No suspended members')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('row', { name: /Nadia Islam/ })).toBeVisible();
  });

  test('tabs show the pending invitation count and move with the keyboard-visible active state', async ({
    page,
  }) => {
    const tabs = page.getByRole('tablist', { name: 'Team sections' });
    await expect(tabs.getByRole('tab', { name: /Invitations/ })).toContainText('1');
    await expect(tabs.getByRole('tab', { name: 'Members' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tabs.getByRole('tab', { name: 'Teams' }).click();
    await expect(tabs.getByRole('tab', { name: 'Teams' })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.getByRole('tab', { name: 'Members' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  test('the row menu opens the member, and the table has the new columns', async ({ page }) => {
    for (const h of ['Member', 'Role', 'Team', 'Status', 'Last active'])
      await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Actions for Nadia Islam' }).click();
    await page.getByRole('menuitem', { name: 'View details' }).click();
    await expect(page.getByRole('dialog', { name: /Member: Nadia Islam/ })).toBeVisible();
  });

  test('no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/team');
    await expect(page.getByRole('button', { name: /Nadia Islam/ })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test('agents cannot invite and do not see the invitations tab', async ({ page }) => {
  await mockApi(page, { role: 'AGENT' });
  await page.goto('/team');
  await expect(page.getByRole('button', { name: 'Invite Member' })).toBeDisabled();
  await expect(page.getByRole('tab', { name: /Invitations/ })).toHaveCount(0);
});

test('accept-invite page explains an invalid link', async ({ page }) => {
  await mockApi(page);
  await page.goto('/accept-invite?token=short');
  await expect(page.getByRole('alert').filter({ hasText: 'Invitation unavailable' })).toBeVisible();
});

test.describe('teams tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto('/team');
    await page.getByRole('tab', { name: /^Teams/ }).click();
  });

  test('search and sort work on the loaded teams', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search teams' });
    await expect(search).toHaveAttribute('placeholder', 'Search team name or description');
    await search.fill('zzzz');
    await expect(page.getByText(/No teams match/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible();
    await page.getByRole('button', { name: /^Sort:/ }).click();
    await expect(page.getByRole('listbox', { name: 'Sort' }).getByRole('option')).toHaveCount(4);
  });
});
