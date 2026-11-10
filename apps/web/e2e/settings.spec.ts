import { expect, test } from '@playwright/test';
import { mockApi, resetSettings, settingsState } from './mocks';

test.describe('settings (owner)', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  });

  test('the Settings rail lists the real sections and marks what is not built yet', async ({
    page,
  }) => {
    const rail = page.getByRole('navigation', { name: 'Settings' });
    for (const t of ['General', 'Security', 'Teams', 'Channels', 'Audit Log'])
      await expect(rail.getByRole('link', { name: new RegExp(t) })).toBeVisible();
    await expect(rail.getByRole('link', { name: /Notifications/ })).toContainText('Soon');
    await expect(rail.getByRole('link', { name: /Billing & Subscriptions/ })).toBeVisible();
  });

  test('general: profile saves through the API, shows saved only after, keeps email read-only', async ({
    page,
  }) => {
    await page.goto('/settings/general');
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
    const name = page.getByLabel('Full name');
    await expect(name).toHaveValue('Farid Ahmed');
    await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await name.fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    expect(settingsState.profilePatches).toHaveLength(0);
    await name.fill('Farid A. Ahmed');
    await page.getByLabel('Phone (optional)').fill('+8801700000000');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    // Only the changed fields are sent, and the workspace endpoint is not called at all.
    expect(settingsState.profilePatches[0]).toEqual({
      name: 'Farid A. Ahmed',
      phone: '+8801700000000',
    });
    expect(settingsState.workspacePatches).toHaveLength(0);
  });

  test('general: one Save changes button saves profile, preferences and workspace together', async ({
    page,
  }) => {
    await page.goto('/settings/general');
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(1);
    await page.getByLabel('Job title (optional)').fill('Head of Support');
    await page.getByLabel('Business Name').fill('UrbanNest HQ');
    await page.getByRole('button', { name: /^Currency:/ }).click();
    await page.getByRole('combobox', { name: 'Search currency' }).fill('dollar');
    await page.getByRole('option', { name: /^USD/ }).click();
    await page.getByRole('button', { name: /^Time Zone:/ }).click();
    await page.getByRole('combobox', { name: 'Search time zone' }).fill('dubai');
    await page.getByRole('option', { name: 'Asia/Dubai' }).first().click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(settingsState.profilePatches).toHaveLength(1);
    expect(settingsState.profilePatches[0]).toEqual({ jobTitle: 'Head of Support' });
    expect(settingsState.workspacePatches).toHaveLength(1);
    expect(settingsState.workspacePatches[0]).toEqual({
      name: 'UrbanNest HQ',
      defaultCurrency: 'USD',
      reportingTimeZone: 'Asia/Dubai',
    });
  });

  test('general: validation stops everything before anything is sent', async ({ page }) => {
    await page.goto('/settings/general');
    await page.getByLabel('Job title (optional)').fill('Lead');
    await page.getByLabel('Business Name').fill('x');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('at least 2 characters')).toBeVisible();
    expect(settingsState.profilePatches).toHaveLength(0);
    expect(settingsState.workspacePatches).toHaveLength(0);
  });

  test('old My profile, Preferences and Workspace URLs land on General', async ({ page }) => {
    for (const [old, hash] of [
      ['/settings/profile', 'personal'],
      ['/settings/preferences', 'preferences'],
      ['/settings/workspace', 'workspace'],
    ] as const) {
      await page.goto(old);
      await expect(page).toHaveURL(new RegExp(`/settings/general#${hash}$`));
      await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
    }
  });

  test('unsaved edits trigger a discard confirmation when leaving through the section rail', async ({
    page,
  }) => {
    await page.goto('/settings/general');
    await page.getByLabel('Job title (optional)').fill('Head of Support');
    const crumb = page.getByRole('navigation', { name: 'Settings' }).getByRole('link', {
      name: /Security/,
    });
    await crumb.click();
    const d = page.getByRole('alertdialog');
    await expect(d).toContainText('Discard unsaved changes?');
    await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
    await crumb.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes' }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
  });

  test('security: password validation, wrong-current error from the server, device sign-out', async ({
    page,
  }) => {
    await page.goto('/settings/security');
    const change = page.getByRole('button', { name: 'Change password' });
    await change.click();
    await expect(page.getByText('Enter your current password')).toBeVisible();
    await page.locator('#pw-cur').fill('wrong');
    await page.locator('#pw-new').fill('short');
    await page.locator('#pw-confirm').fill('different');
    await change.click();
    await expect(page.getByText(/at least 10 characters/).first()).toBeVisible();
    expect(settingsState.passwords).toHaveLength(0);
    await page.locator('#pw-new').fill('Valid-pass-123');
    await page.locator('#pw-confirm').fill('Valid-pass-123');
    await change.click();
    await expect(page.getByText('Your current password is incorrect')).toBeVisible();
    await page.locator('#pw-cur').fill('Old-pass-123');
    await change.click();
    await expect.poll(() => settingsState.passwords.length).toBe(2);
    await expect(page.locator('#pw-cur')).toHaveValue('');

    await expect(page.getByText('This device', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out Safari on iOS' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('sign in again');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
    await expect.poll(() => settingsState.revoked.length).toBe(1);
    await expect(
      page.getByText('Not available. Torio signs you in with a password only', { exact: false }),
    ).toBeVisible();
  });

  test('notifications page has no fake toggles', async ({ page }) => {
    await page.goto('/settings/notifications');
    await expect(page.getByText(/doesn.t send notifications yet/)).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('members and channels pages link to the existing pages instead of duplicating them', async ({
    page,
  }) => {
    await page.goto('/settings/members');
    await expect(page.getByRole('link', { name: /Members & invitations/ })).toHaveAttribute(
      'href',
      '/team',
    );
    await page.goto('/settings/channels');
    await expect(page.getByRole('link', { name: /Open Channels/ })).toHaveAttribute(
      'href',
      '/channels',
    );
  });

  test('privacy: exports only after the server responds; deletion is not offered', async ({
    page,
  }) => {
    await page.goto('/settings/privacy');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download my data' }).click();
    expect((await dl).suggestedFilename()).toMatch(/^torio-my-data-/);
    await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0);
  });

  test('audit log lists entries for Owner', async ({ page }) => {
    await page.goto('/settings/audit');
    await expect(page.getByText('Workspace settings changed: name')).toBeVisible();
  });

  test('top-bar account menu opens real settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
    await expect(page).toHaveURL(/\/settings\/general#workspace$/);
  });

  test('no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings/general');
    await expect(page.getByLabel('Business Name')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  });
});

test.describe('start page preference', () => {
  test('opening the app at / goes to the chosen page once per session', async ({ page }) => {
    resetSettings();
    settingsState.profile.landingPage = 'inbox';
    await mockApi(page, { role: 'AGENT' });
    await page.goto('/');
    await expect(page).toHaveURL(/\/inbox$/);
    await page.getByRole('link', { name: 'Dashboard' }).first().click();
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await expect(page.getByRole('heading', { name: /Good|Dashboard/ }).first()).toBeVisible();
  });
});

test.describe('settings (agent)', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'AGENT' });
  });

  test('workspace is read-only and the audit log is hidden', async ({ page }) => {
    await page.goto('/settings/general');
    await expect(page.getByLabel('Business Name')).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Currency:/ })).toBeDisabled();
    await expect(page.getByText(/Owner or Admin permissions/)).toBeVisible();
    // Personal fields stay editable, and an agent's save sends no workspace change.
    await page.getByLabel('Job title (optional)').fill('Agent');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(settingsState.workspacePatches).toHaveLength(0);
    await page.goto('/settings');
    await expect(
      page
        .getByRole('list', { name: 'Settings sections' })
        .getByRole('link', { name: /Audit log/ }),
    ).toHaveCount(0);
    await page.goto('/settings/audit');
    await expect(page.getByText('Only Owners and Admins can view the audit log.')).toBeVisible();
  });
});
