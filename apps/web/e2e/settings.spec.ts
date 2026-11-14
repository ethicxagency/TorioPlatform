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
    await expect(rail.getByRole('link', { name: /Subscription/ })).toBeVisible();
    await expect(rail.getByRole('link', { name: /^Billing/ })).toBeVisible();
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
    await page.getByRole('button', { name: 'Change password' }).click();
    const dlg = page.getByRole('dialog', { name: 'Change password' });
    const change = dlg.getByRole('button', { name: 'Change password' });
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
    await expect(dlg).toHaveCount(0); // the dialog closes once the password is changed

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

  test('privacy: exports only after the server responds', async ({ page }) => {
    await page.goto('/settings/privacy');
    await expect(page.getByRole('heading', { name: 'Data & Privacy' })).toBeVisible();
    await expect(page.getByText('Your data. Your privacy. Your control.')).toBeVisible();
    await expect(page.getByText('Not requested')).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Request data export' }).click();
    expect((await dl).suggestedFilename()).toMatch(/^torio-my-data-/);
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  });

  test('privacy: honest controls, policy link, and empty request history', async ({ page }) => {
    await page.goto('/settings/privacy');
    await expect(page.getByRole('link', { name: /View policy/ })).toHaveAttribute(
      'href',
      '/privacy-policy',
    );
    await expect(page.getByText('Not available yet')).toBeVisible();
    await expect(page.getByText('No privacy requests yet')).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
  });

  test('privacy: deletion needs explicit confirmation and shows up in history', async ({
    page,
  }) => {
    await page.goto('/settings/privacy');
    await page.getByRole('button', { name: 'Request deletion' }).click();
    const dlg = page.getByRole('dialog');
    const submit = dlg.getByRole('button', { name: 'Request deletion' });
    await expect(submit).toBeDisabled();
    await dlg.getByLabel('Password', { exact: true }).fill('Wrong-pass-1');
    await dlg.getByRole('checkbox').check();
    await submit.click();
    await expect(dlg.getByRole('alert')).toContainText('not correct');
    await dlg.getByLabel('Password', { exact: true }).fill('Correct-pass-1');
    await submit.click();
    await expect(dlg.getByText('TDR-AAAAA-BBBBB-CCCCC-DDDDD')).toBeVisible();
    await dlg.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('cell', { name: 'TDR-AAAAA-BBBBB-CCCCC-DDDDD' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request deletion' })).toBeDisabled();
  });

  test('privacy: no horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings/privacy');
    await expect(page.getByRole('heading', { name: 'Data & Privacy' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('audit log lists entries for Owner', async ({ page }) => {
    await page.goto('/settings/audit');
    await expect(page.getByText('Workspace settings changed: name')).toBeVisible();
  });

  test("the store menu's account row opens General", async ({ page }) => {
    await page.getByRole('button', { name: 'Store menu' }).click();
    await page.getByRole('button', { name: /agent@test\.dev/ }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
  });

  test('personal and store information are separate sections', async ({ page }) => {
    await page.goto('/settings/general');
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Business Information' })).toBeVisible();
    // sign-in methods live in Security; General only points there
    await expect(page.getByRole('link', { name: 'Security' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Brand Identity' })).toBeVisible();
    const y = async (n: string) => (await page.getByRole('heading', { name: n }).boundingBox())!.y;
    expect(await y('Your profile')).toBeLessThan(await y('Business Information'));
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

// A 2x2 PNG, so the browser can decode it and the crop step can draw it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGNkYGD4z8DAwMDEgAAAAA8AAQc0xz4AAAAASUVORK5CYII=',
  'base64',
);

test.describe('sign-in methods and pictures (owner)', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('shows each method from what the server holds: connected only when it really is', async ({
    page,
  }) => {
    Object.assign(settingsState.profile, {
      providers: ['GOOGLE'],
      identities: [
        { provider: 'GOOGLE', email: 'g@example.com', connectedAt: '2026-02-03T10:00:00.000Z' },
      ],
    });
    await page.goto('/settings/security');
    const list = page.getByRole('list', { name: 'Sign-in methods' });
    await expect(list.getByRole('listitem').filter({ hasText: 'Email & password' })).toContainText(
      'Set',
    );
    const google = list.getByRole('listitem').filter({ hasText: 'Google' });
    await expect(google).toContainText('Connected');
    await expect(google).toContainText('g@example.com');
    const fb = list.getByRole('listitem').filter({ hasText: 'Facebook' });
    await expect(fb).toContainText('Not connected');
  });

  test('a Google-only account sets a first password with an emailed code and stays connected to Google', async ({
    page,
  }) => {
    Object.assign(settingsState.profile, {
      hasPassword: false,
      passwordSetAt: null,
      providers: ['GOOGLE'],
      identities: [
        { provider: 'GOOGLE', email: 'g@example.com', connectedAt: '2026-02-03T10:00:00.000Z' },
      ],
    });
    await page.goto('/settings/security');
    const pw = page.getByRole('listitem').filter({ hasText: 'Email & password' });
    await expect(pw).toContainText('Password not set');
    await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0);
    await pw.getByRole('button', { name: 'Set password' }).click();
    const dlg = page.getByRole('dialog', { name: 'Set a password' });
    await dlg.getByRole('button', { name: 'Send code' }).click();
    await expect.poll(() => settingsState.codes).toBe(1);
    await dlg.locator('#sp-code').fill('111111');
    await dlg.locator('#sp-new').fill('Valid-pass-123');
    await dlg.locator('#sp-confirm').fill('Different-pass-1');
    await dlg.getByRole('button', { name: 'Set password' }).click();
    await expect(dlg.getByText('The passwords do not match')).toBeVisible();
    expect(settingsState.passwords).toHaveLength(0); // nothing is sent until it validates
    await dlg.locator('#sp-confirm').fill('Valid-pass-123');
    await dlg.getByRole('button', { name: 'Set password' }).click();
    await expect(dlg.getByText('That code is not right.')).toBeVisible(); // the server's answer
    await dlg.locator('#sp-code').fill('123456');
    await dlg.getByRole('button', { name: 'Set password' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(pw).toContainText('Set');
    await expect(pw.getByRole('button', { name: 'Change password' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Google' })).toContainText(
      'Connected',
    );
  });

  test('uploads a cropped profile picture, can remove it, and can restore the provider picture', async ({
    page,
  }) => {
    Object.assign(settingsState.profile, {
      providers: ['GOOGLE'],
      image: 'https://lh3.googleusercontent.com/provider',
      imageSource: 'PROVIDER',
      hasProviderImage: true,
    });
    await page.goto('/settings/general');
    const profile = page.getByRole('region', { name: 'Your profile' });
    await expect(profile.getByText(/From Google/)).toBeVisible();
    await profile
      .getByLabel('Choose a profile picture')
      .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    const crop = page.getByRole('dialog', { name: 'Adjust your picture' });
    await expect(crop.getByRole('slider', { name: 'Zoom' })).toBeVisible();
    await crop.getByRole('button', { name: 'Save picture' }).click();
    await expect(crop).toHaveCount(0);
    await expect(profile.getByText(/Your own picture/)).toBeVisible();
    expect(settingsState.uploads).toHaveLength(1);
    expect(settingsState.uploads[0]).toMatchObject({ path: '/users/me/avatar' });
    expect(settingsState.uploads[0]!.type).toMatch(/multipart\/form-data/);
    await profile.getByRole('button', { name: /Use Google picture/ }).click();
    await expect(profile.getByText(/From Google/)).toBeVisible();
    await profile.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove picture' }).click();
    await expect(profile.getByText('No picture. Your initials are shown.')).toBeVisible();
    await expect(profile.getByRole('button', { name: /Restore Google picture/ })).toBeVisible();
  });

  test('refuses a file that is not an allowed image before uploading', async ({ page }) => {
    await page.goto('/settings/general');
    const profile = page.getByRole('region', { name: 'Your profile' });
    await profile.getByLabel('Choose a profile picture').setInputFiles({
      name: 'a.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });
    await expect(profile.getByRole('alert')).toContainText('PNG, JPG or WebP');
    expect(settingsState.uploads).toHaveLength(0);
  });

  test('the brand logo is its own setting: upload, preview on light and dark, remove', async ({
    page,
  }) => {
    await page.goto('/settings/general');
    const brand = page.getByRole('region', { name: 'Brand Identity' });
    await expect(
      brand.getByText('Manage your workspace logo and brand identity across Torio.'),
    ).toBeVisible();
    await expect(brand.getByText('Where it appears')).toBeVisible();
    await brand
      .getByLabel('Choose a brand logo')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
    await expect(brand.getByRole('img', { name: 'Logo on a light background' })).toBeVisible();
    await expect(brand.getByRole('img', { name: 'Logo on a dark background' })).toBeVisible();
    expect(settingsState.uploads).toHaveLength(0); // previewing sends nothing
    await brand.getByRole('button', { name: 'Save logo' }).click();
    await expect.poll(() => settingsState.uploads.length).toBe(1);
    expect(settingsState.uploads[0]).toMatchObject({
      path: expect.stringMatching(/\/workspaces\/.+\/logo$/),
    });
    await expect(brand.getByRole('button', { name: 'Replace logo' })).toBeVisible();
    expect(settingsState.profile.image).toBeNull(); // a personal picture was not touched
    await brand.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove logo' }).click();
    await expect(brand.getByRole('button', { name: 'Upload logo' })).toBeVisible();
    expect(settingsState.workspace.logo).toBeNull();
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

  test('an agent cannot change the brand logo, but still manages their own picture', async ({
    page,
  }) => {
    await page.goto('/settings/general');
    const brand = page.getByRole('region', { name: 'Brand Identity' });
    await expect(brand.getByText('Only an Owner or Admin can change the logo.')).toBeVisible();
    await expect(brand.getByLabel('Choose a brand logo')).toHaveCount(0);
    await expect(
      brand.getByRole('button', { name: /Upload logo|Replace logo|Remove/ }),
    ).toHaveCount(0);
    const profile = page.getByRole('region', { name: 'Your profile' });
    await expect(profile.getByRole('button', { name: 'Upload picture' })).toBeVisible();
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
