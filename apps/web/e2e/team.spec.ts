import { expect, test } from '@playwright/test';
import { choose } from './select';
import { MEMBERS, mockApi, rolesState } from './mocks';

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
      'No email was sent',
    );
    await expect(page.getByLabel('Invitation link')).toHaveValue(/accept-invite\?token=/);
  });

  test('invitations tab lists pending invitations', async ({ page }) => {
    await page.getByRole('tab', { name: /Invitations/ }).click();
    await expect(page.getByText('pending@example.test')).toBeVisible();
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

test.describe('roles & permissions (owner)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/team');
    await page.getByRole('tab', { name: 'Roles & Permissions' }).click();
  });

  const card = (page: import('@playwright/test').Page, name: string) =>
    page.getByRole('article', { name });

  test('shows the system roles with real member counts, a permission overview, and no fake custom roles', async ({
    page,
  }) => {
    await expect(card(page, 'Owner')).toContainText('All permissions');
    await expect(card(page, 'Owner')).toContainText('Fixed');
    await expect(card(page, 'Admin')).toContainText('1 member');
    await expect(card(page, 'Agent')).toContainText('1 member');
    await expect(page.getByText('No custom roles yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create custom role' }).first()).toBeEnabled();
    const matrix = page.getByRole('table', { name: 'What each role can do' });
    await expect(matrix.getByRole('columnheader', { name: 'Agent' })).toBeVisible();
    await expect(matrix.getByRole('row', { name: /Delete workspace/ })).toContainText('Owner only');
    // an Owner has every permission, the Agent does not have billing
    const row = matrix.getByRole('row', { name: /Change plan and payment methods/ });
    await expect(row.getByLabel('Allowed', { exact: true })).toHaveCount(1);
    // the old "not supported" statement is gone
    await expect(page.getByText(/Custom roles aren.t supported/)).toHaveCount(0);
  });

  test('a template fills in the permissions, the builder validates, and the saved role holds exactly the chosen keys', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Create custom role' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Create custom role' });
    await dlg.getByRole('button', { name: 'Next' }).click();
    await expect(dlg.getByText('Role name needs at least 2 characters')).toBeVisible();
    await dlg.getByLabel(/Role name/).fill('Support lead');
    await dlg.getByRole('radio', { name: /Customer Support/ }).click();
    await dlg.getByRole('button', { name: 'Next' }).click();
    // step 2: the template's permissions are on, others off, owner-only ones can never be picked
    await dlg.getByRole('button', { name: /Inbox & Conversations/ }).click();
    await expect(dlg.getByLabel(/Reply to customers/)).toBeChecked();
    await expect(dlg.getByLabel(/Assign, snooze and resolve/)).toBeChecked();
    await expect(dlg.getByLabel(/Manage saved replies/)).not.toBeChecked();
    await expect(dlg.getByLabel(/Delete workspace/)).toBeDisabled();
    await expect(dlg.getByText('Owner only').first()).toBeVisible();
    await expect(dlg.getByLabel(/View workspace/)).toBeDisabled(); // always included
    // change it: turn saved replies on, and turn the whole Customers group off, then reset it from the template
    await dlg.getByLabel(/Manage saved replies/).check();
    await dlg.getByRole('button', { name: /^Customers/ }).click();
    await dlg.getByRole('button', { name: 'Disable all' }).nth(3).click();
    await expect(dlg.getByLabel(/View customers/)).not.toBeChecked();
    await dlg.getByRole('button', { name: 'Reset to template' }).click();
    await expect(dlg.getByLabel(/View customers/)).toBeChecked();
    await expect(dlg.getByLabel(/Manage saved replies/)).not.toBeChecked();
    await dlg.getByLabel(/Manage saved replies/).check();
    await dlg.getByRole('button', { name: 'Create role' }).click();
    await expect(page.getByText('Role “Support lead” created')).toBeVisible();
    const sent = rolesState.calls.find((c) => c.method === 'POST' && c.path === '/')!;
    const body = sent.body as { name: string; templateKey: string; permissions: string[] };
    expect(body.name).toBe('Support lead');
    expect(body.templateKey).toBe('customer_support');
    expect(body.permissions).toEqual(
      expect.arrayContaining(['conversations:reply', 'savedreplies:manage', 'customers:read']),
    );
    for (const never of ['members:manage', 'billing:read', 'workspace:delete', 'roles:manage'])
      expect(body.permissions).not.toContain(never);
    await expect(card(page, 'Support lead')).toContainText('0 members');
    await expect(page.getByText('No custom roles yet')).toHaveCount(0);
  });

  test('a refused creation shows the reason and keeps the form', async ({ page }) => {
    rolesState.failCreate = 'A role with that name already exists';
    await page.getByRole('button', { name: 'Create custom role' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'Create custom role' });
    await dlg.getByLabel(/Role name/).fill('Support');
    await dlg.getByRole('radio', { name: /Read Only/ }).click();
    await dlg.getByRole('button', { name: 'Next' }).click();
    await dlg.getByRole('button', { name: 'Create role' }).click();
    await expect(dlg.getByRole('alert')).toContainText('already exists');
    await expect(dlg).toBeVisible();
  });

  test('assign and remove members, warn before access is removed, and make deletion require a reassignment', async ({
    page,
  }) => {
    rolesState.custom.push({
      id: '99999999-0000-4000-8000-000000000001',
      name: 'Support lead',
      description: 'Answers customers',
      templateKey: 'customer_support',
      permissions: [
        'workspace:read',
        'conversations:read',
        'conversations:reply',
        'customers:read',
      ],
    });
    await page.reload();
    await page.getByRole('tab', { name: 'Roles & Permissions' }).click();
    // assign Nadia from the role's details
    await card(page, 'Support lead').getByRole('button', { name: 'View details' }).click();
    const detail = page.getByRole('dialog', { name: 'Support lead' });
    await expect(detail).toContainText('Customer Support');
    await expect(detail.getByText('No one has this role yet.')).toBeVisible();
    await choose(detail.getByRole('combobox', { name: /Assign a member/ }), MEMBERS[1]!.id);
    await detail.getByRole('button', { name: 'Assign' }).click();
    await expect(detail.getByText('Nadia Islam')).toBeVisible();
    expect(rolesState.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { customRoleId: '99999999-0000-4000-8000-000000000001' },
    });
    await detail.getByRole('button', { name: 'Edit role' }).click();
    // editing: removing a permission warns that the member loses access
    const edit = page.getByRole('dialog', { name: /Edit role: Support lead/ });
    await edit.getByRole('button', { name: /Inbox & Conversations/ }).click();
    await edit.getByLabel(/Reply to customers/).uncheck();
    await expect(edit.getByRole('status')).toContainText(
      '1 member with this role will lose that access',
    );
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Role saved. 1 member lost some access.')).toBeVisible();
    // deletion needs somewhere for the member to go
    await card(page, 'Support lead').getByRole('button', { name: 'Delete Support lead' }).click();
    const del = page.getByRole('dialog', { name: /Delete “Support lead”/ });
    await expect(del).toContainText('1 member');
    await expect(del.getByRole('button', { name: 'Reassign and delete' })).toBeDisabled();
    await choose(del.getByRole('combobox', { name: /Move members to/ }), 'AGENT');
    await del.getByRole('button', { name: 'Reassign and delete' }).click();
    await expect(page.getByText('Role “Support lead” deleted')).toBeVisible();
    expect(rolesState.calls.at(-1)).toMatchObject({
      method: 'DELETE',
      body: { reassignTo: 'AGENT' },
    });
    await expect(card(page, 'Support lead')).toHaveCount(0);
  });

  test('duplicating a custom role copies its permissions', async ({ page }) => {
    rolesState.custom.push({
      id: '99999999-0000-4000-8000-000000000001',
      name: 'Read desk',
      description: null,
      templateKey: 'read_only',
      permissions: ['workspace:read', 'conversations:read'],
    });
    await page.reload();
    await page.getByRole('tab', { name: 'Roles & Permissions' }).click();
    await page.getByRole('button', { name: 'Duplicate Read desk' }).click();
    await expect(card(page, 'Read desk copy')).toContainText('2 of');
  });

  test('the roles page fits a phone without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(card(page, 'Owner')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
});

test.describe('roles & permissions (agent)', () => {
  test('an agent can read roles but cannot create, edit or delete them', async ({ page }) => {
    await mockApi(page, { role: 'AGENT' });
    rolesState.custom.push({
      id: '99999999-0000-4000-8000-000000000001',
      name: 'Read desk',
      description: null,
      templateKey: null,
      permissions: ['workspace:read'],
    });
    await page.goto('/team');
    await page.getByRole('tab', { name: 'Roles & Permissions' }).click();
    await expect(page.getByRole('button', { name: 'Create custom role' }).first()).toBeDisabled();
    await expect(page.getByRole('article', { name: 'Read desk' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Read desk' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Read desk' })).toHaveCount(0);
  });
});
