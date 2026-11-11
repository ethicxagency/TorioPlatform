import { expect, test, type Page } from '@playwright/test';
import { mockApi, resetSettings, settingsState, storesState, STORE_2 } from './mocks';

const second = {
  id: STORE_2,
  name: 'Fashion BD',
  slug: 'fashion-bd',
  description: null,
  status: 'ACTIVE',
  reportingTimeZone: 'Asia/Dhaka',
  defaultCurrency: 'BDT',
  contactEmail: 'hello@fashion.test',
  logo: null,
  phone: '+8801712345678',
  industry: 'Fashion & Apparel',
  country: 'BD',
  addressLine: '12 Road',
  city: 'Dhaka',
  state: null,
  postalCode: '1207',
  role: 'OWNER',
  createdAt: '2026-01-01T00:00:00.000Z',
};

test.beforeEach(() => resetSettings());
// The mock state is module-wide and shared by the specs that follow in this worker, so leave it clean.
test.afterEach(() => resetSettings());

test.describe('store dropdown and Add Store (existing user)', () => {
  test.beforeEach(async ({ page }) => {
    storesState.extra = [second];
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/settings/general');
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  });

  const open = async (page: Page) => {
    await page.getByRole('button', { name: 'Store menu' }).click();
    return page.getByRole('dialog', { name: 'Store menu' });
  };

  test('lists only the stores the user can open, marks the active one, and has Add Store', async ({
    page,
  }) => {
    // Add Store lives only inside the dropdown, never as a header button.
    await expect(page.getByRole('banner').getByRole('button', { name: 'Add Store' })).toHaveCount(
      0,
    );
    const panel = await open(page);
    const list = panel.getByRole('listbox', { name: 'Stores' });
    await expect(list.getByRole('option')).toHaveCount(2);
    await expect(list.getByRole('option', { name: /UrbanNest/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(list.getByRole('option', { name: /Fashion BD/ })).toContainText('fashion-bd');
    await expect(panel.getByRole('button', { name: 'Add Store' })).toBeVisible();
  });

  test('switching persists the choice, updates the header store, and shows the new store’s own settings', async ({
    page,
  }) => {
    await expect(page.getByLabel('Business Name')).toHaveValue('UrbanNest');
    const panel = await open(page);
    await panel.getByRole('option', { name: /Fashion BD/ }).click();
    await expect.poll(() => storesState.switches).toEqual([STORE_2]);
    const trigger = page.getByRole('button', { name: 'Store menu' });
    await expect(trigger).toContainText('Fashion BD');
    await expect(trigger).toContainText('FB'); // the new store's initials, immediately
    await page.goto('/settings/general');
    await expect(page.getByLabel('Business Name')).toHaveValue('Fashion BD');
    await expect(page.getByLabel('Store URL')).toHaveValue('fashion-bd');
    await expect(page.getByLabel('City (optional)')).toHaveValue('Dhaka');
    await expect(page.getByLabel('Phone number (optional)')).toHaveValue('+8801712345678');
    expect(settingsState.workspace.name).toBe('UrbanNest');
    expect(settingsState.workspacePatches).toHaveLength(0);
  });

  test('a store logo is shown in the header when there is one', async ({ page }) => {
    storesState.extra = [
      {
        ...second,
        logo: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      },
    ];
    await page.reload();
    const panel = await open(page);
    await panel.getByRole('option', { name: /Fashion BD/ }).click();
    await expect(page.getByRole('button', { name: 'Store menu' }).locator('img')).toHaveCount(1);
  });

  test('the person’s own picture is in the account row, separate from the store avatar', async ({
    page,
  }) => {
    settingsState.profile.image =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    await page.reload();
    const panel = await open(page);
    await expect(panel.getByRole('button', { name: /agent@test\.dev/ }).locator('img')).toHaveCount(
      1,
    );
    await expect(page.getByRole('button', { name: 'Store menu' }).locator('img')).toHaveCount(0);
  });

  test('Add Store opens store setup for another store, starting at step 1', async ({ page }) => {
    await (await open(page)).getByRole('button', { name: 'Add Store' }).click();
    await expect(page).toHaveURL(/\/onboarding\?new=1$/);
    await expect(page.getByRole('heading', { name: 'Add a new store', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Let.s get to know you/ })).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue('Farid Ahmed');
  });

  test('a user who already has stores is sent away from first-time onboarding', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/localhost:3100\/$/);
  });

  test('General Settings edits go to the active store only', async ({ page }) => {
    await page.getByLabel('City (optional)').fill('Chattogram');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(settingsState.workspacePatches).toEqual([{ city: 'Chattogram' }]);
    expect(storesState.extra[0]!.city).toBe('Dhaka');
    expect(settingsState.profilePatches).toHaveLength(0);
  });
});

async function pick(page: Page, trigger: RegExp, search: string, option: RegExp | string) {
  await page.getByRole('button', { name: trigger }).click();
  await page.getByRole('combobox', { name: /^Search/ }).fill(search);
  await page.getByRole('option', { name: option }).first().click();
}

test.describe('first-time store onboarding (no store yet)', () => {
  test.beforeEach(async ({ page }) => {
    storesState.noStores = true;
    await mockApi(page, { role: 'OWNER' });
  });

  /** Step 1 with its defaults, then on to step 2. */
  const toStep2 = async (page: Page) => {
    await page.goto('/onboarding');
    await pick(page, /^Your country:/, 'bangladesh', /Bangladesh/);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
  };

  test('an account without a store is taken to onboarding and cannot use the app', async ({
    page,
  }) => {
    await page.goto('/inbox');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { name: /Let.s get to know you/ })).toBeVisible();
    await expect(
      page.getByText('Tell us a little about yourself before setting up your workspace.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Store' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('shows exactly two steps and prefills step 1 from the account, email read-only and verified', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    const steps = page.getByRole('list', { name: 'Progress' }).getByRole('listitem');
    await expect(steps).toHaveCount(2);
    await expect(steps.first()).toHaveAttribute('aria-current', 'step');
    await expect(page.getByLabel('Full name')).toHaveValue('Farid Ahmed');
    await expect(page.getByLabel('Email address')).toHaveValue('agent@test.dev');
    await expect(page.getByLabel('Email address')).toBeDisabled();
    await expect(page.getByText('Verified')).toBeVisible();
  });

  test('step 1 validates, saves the global profile only when changed, and moves on', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await page.getByLabel('Full name').fill('');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Enter your full name')).toBeVisible();
    expect(settingsState.profilePatches).toHaveLength(0);
    await page.getByLabel('Full name').fill('Farid A. Ahmed');
    await page.getByLabel('Phone number').fill('01712 345678');
    await pick(page, /^Country code:/, 'bangladesh', /Bangladesh/);
    await pick(page, /^Your country:/, 'bangladesh', /Bangladesh/);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
    expect(settingsState.profilePatches).toEqual([
      { name: 'Farid A. Ahmed', phone: '+8801712345678' },
    ]);
  });

  test('step 1 unchanged saves nothing; step 2 is prefilled from it; Back keeps every value', async ({
    page,
  }) => {
    await toStep2(page);
    expect(settingsState.profilePatches).toHaveLength(0);
    await expect(page.getByLabel(/^Business email/)).toHaveValue('agent@test.dev');
    await expect(page.getByRole('button', { name: /^Business country:/ })).toContainText(
      'Bangladesh',
    );
    await expect(page.getByRole('button', { name: /^Time Zone:/ })).toContainText('Asia/Dhaka');
    await expect(page.getByRole('button', { name: /^Currency:/ })).toContainText('BDT');
    await page.getByLabel(/^Store name/).fill('Digonto Store');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('Farid Ahmed');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByLabel(/^Store name/)).toHaveValue('Digonto Store');
    await expect(page.getByLabel(/^Store URL/)).toHaveValue('digonto-store');
  });

  test('required business fields show inline errors, optional ones do not block, and values are kept', async ({
    page,
  }) => {
    await toStep2(page);
    await page.getByLabel(/^Store name/).fill('Digonto Store');
    await page.getByRole('button', { name: 'Create Store' }).click();
    await expect(page.getByText('Choose an industry')).toBeVisible();
    await expect(page.getByLabel(/^Store name/)).toHaveValue('Digonto Store');
    expect(storesState.created).toHaveLength(0);
  });

  test('the address is suggested from the name, editable, and its availability is shown', async ({
    page,
  }) => {
    await toStep2(page);
    await page.getByLabel(/^Store name/).fill('Fresh Shop');
    await expect(page.getByLabel(/^Store URL/)).toHaveValue('fresh-shop');
    await expect(page.getByText('Available')).toBeVisible();
    await page.getByLabel(/^Store URL/).fill('taken-store');
    await expect(page.getByText(/already taken/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Use taken-store-2' }).click();
    await expect(page.getByLabel(/^Store URL/)).toHaveValue('taken-store-2');
    await expect(page.getByText('Available')).toBeVisible();
  });

  test('creating the store sends one validated request, then lands in the dashboard', async ({
    page,
  }) => {
    await toStep2(page);
    await page.getByLabel(/^Store name/).fill('Digonto Store');
    await pick(page, /^Industry:/, 'fash', 'Fashion & Apparel');
    await page.getByLabel('City').fill('Dhaka');
    await page.getByRole('button', { name: 'Create Store' }).click();
    await expect(page).toHaveURL(/localhost:3100\/$/);
    expect(storesState.created).toHaveLength(1);
    expect(storesState.created[0]).toMatchObject({
      name: 'Digonto Store',
      slug: 'digonto-store',
      industry: 'Fashion & Apparel',
      country: 'BD',
      defaultCurrency: 'BDT',
      reportingTimeZone: 'Asia/Dhaka',
      contactEmail: 'agent@test.dev',
      city: 'Dhaka',
    });
  });

  test('a rejected submission shows the reason, creates nothing, keeps the form, and allows a retry', async ({
    page,
  }) => {
    await toStep2(page);
    await page.getByLabel(/^Store name/).fill('Taken');
    await page.getByLabel(/^Store URL/).fill('taken-store');
    await pick(page, /^Industry:/, 'edu', 'Education');
    await page.getByRole('button', { name: 'Create Store' }).click();
    await expect(page.getByText(/already taken/).first()).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(storesState.created).toHaveLength(0);
    await expect(page.getByLabel(/^Store name/)).toHaveValue('Taken');
  });
});

test.describe('Add Store for an existing user', () => {
  test('uses the same two steps and leaves the global profile alone unless edited', async ({
    page,
  }) => {
    storesState.extra = [second];
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/onboarding?new=1');
    await pick(page, /^Your country:/, 'bangladesh', /Bangladesh/);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel(/^Store name/).fill('Third Store');
    await pick(page, /^Industry:/, 'edu', 'Education');
    await page.getByRole('button', { name: 'Create Store' }).click();
    await expect(page).toHaveURL(/localhost:3100\/$/);
    expect(storesState.created).toHaveLength(1);
    expect(settingsState.profilePatches).toHaveLength(0);
  });
});
