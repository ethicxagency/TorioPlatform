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

test.describe('store switcher and Add Store (existing user)', () => {
  test.beforeEach(async ({ page }) => {
    storesState.extra = [second];
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/settings/general');
    await expect(page.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  });

  test('lists only the stores the user can open, marks the active one, and has Add Store', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Add Store' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch store' }).click();
    const list = page.getByRole('listbox', { name: 'Stores' });
    await expect(list.getByRole('option')).toHaveCount(2);
    await expect(list.getByRole('option', { name: /UrbanNest/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(list.getByRole('option', { name: /Fashion BD/ })).toContainText('fashion-bd');
    await expect(page.getByRole('button', { name: 'Add New Store' })).toBeVisible();
  });

  test('switching persists the choice, drops the old store, and shows the new store’s own settings', async ({
    page,
  }) => {
    await expect(page.getByLabel('Business Name')).toHaveValue('UrbanNest');
    await page.getByRole('button', { name: 'Switch store' }).click();
    await page.getByRole('option', { name: /Fashion BD/ }).click();
    await expect.poll(() => storesState.switches).toEqual([STORE_2]);
    await expect(page.getByRole('button', { name: 'Switch store' })).toContainText('Fashion BD');
    await page.goto('/settings/general');
    await expect(page.getByLabel('Business Name')).toHaveValue('Fashion BD');
    await expect(page.getByLabel('Store URL')).toHaveValue('fashion-bd');
    await expect(page.getByLabel('City (optional)')).toHaveValue('Dhaka');
    await expect(page.getByLabel('Phone number (optional)')).toHaveValue('+8801712345678');
    // the first store's record was not touched
    expect(settingsState.workspace.name).toBe('UrbanNest');
    expect(settingsState.workspacePatches).toHaveLength(0);
  });

  test('Add Store opens store setup for another store, with a Back action', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Store' }).click();
    await expect(page).toHaveURL(/\/onboarding\?new=1$/);
    await expect(page.getByRole('heading', { name: 'Add a new store', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
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
  });
});

async function pick(page: Page, trigger: RegExp, search: string, option: RegExp | string) {
  await page.getByRole('button', { name: trigger }).click();
  await page.getByRole('combobox').fill(search);
  await page.getByRole('option', { name: option }).first().click();
}

test.describe('first-time store onboarding (no store yet)', () => {
  test.beforeEach(async ({ page }) => {
    storesState.noStores = true;
    await mockApi(page, { role: 'OWNER' });
  });

  test('an account without a store is taken to onboarding and cannot use the app', async ({
    page,
  }) => {
    await page.goto('/inbox');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole('heading', { name: 'Let’s set up your store', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Tell us a little about your business to personalize your Torio workspace.'),
    ).toBeVisible();
    // no way out: no header, no Back
    await expect(page.getByRole('button', { name: 'Add Store' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('required fields show inline errors, optional ones do not block, and the entered values are kept', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await page.getByLabel(/^Store name/).fill('Digonto Store');
    await expect(page.getByLabel(/^Store URL/)).toHaveValue('digonto-store');
    await page.getByRole('button', { name: 'Create Store' }).click();
    await expect(page.getByText('Choose an industry')).toBeVisible();
    await expect(page.getByLabel(/^Store name/)).toHaveValue('Digonto Store');
    expect(storesState.created).toHaveLength(0);
    await expect(page.getByLabel(/^Phone number/)).toHaveValue('');
  });

  test('the address is suggested from the name, editable, and its availability is shown', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await page.getByLabel(/^Store name/).fill('Fresh Shop');
    await expect(page.getByLabel(/^Store URL/)).toHaveValue('fresh-shop');
    await expect(page.getByText('Available')).toBeVisible();
    await page.getByLabel(/^Store URL/).fill('taken-store');
    await expect(page.getByText(/already taken/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Use taken-store-2' }).click();
    await expect(page.getByLabel(/^Store URL/)).toHaveValue('taken-store-2');
    await expect(page.getByText('Available')).toBeVisible();
  });

  test('creating the store sends one validated request, then lands in the dashboard with the new store active', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await page.getByLabel(/^Store name/).fill('Digonto Store');
    await pick(page, /^Industry:/, 'fash', 'Fashion & Apparel');
    await pick(page, /^Country:/, 'bangladesh', /Bangladesh/);
    await page.getByLabel(/^Business email/).fill('Hello@Digonto.test');
    await page.getByLabel(/^Phone number/).fill('01712 345678');
    await pick(page, /^Country code:/, 'bangladesh', /Bangladesh/);
    await page.getByLabel('City').fill('Dhaka');
    await page.getByRole('button', { name: 'Create Store' }).click();
    await expect(page).toHaveURL(/localhost:3100\/$/);
    expect(storesState.created).toHaveLength(1);
    expect(storesState.created[0]).toMatchObject({
      name: 'Digonto Store',
      slug: 'digonto-store',
      industry: 'Fashion & Apparel',
      country: 'BD',
      phone: '+8801712345678',
      city: 'Dhaka',
      contactEmail: 'hello@digonto.test',
    });
    expect(storesState.created[0]).toHaveProperty('defaultCurrency');
    expect(storesState.created[0]).toHaveProperty('reportingTimeZone');
  });

  test('a rejected submission shows the reason, creates nothing, keeps the form, and allows a retry', async ({
    page,
  }) => {
    await page.goto('/onboarding');
    await page.getByLabel(/^Store name/).fill('Taken');
    await page.getByLabel(/^Store URL/).fill('taken-store');
    await pick(page, /^Industry:/, 'edu', 'Education');
    await pick(page, /^Country:/, 'bangladesh', /Bangladesh/);
    await page.getByLabel(/^Business email/).fill('a@b.test');
    await page.getByRole('button', { name: 'Create Store' }).click();
    await expect(page.getByText(/already taken/).first()).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(storesState.created).toHaveLength(0);
    await expect(page.getByLabel(/^Store name/)).toHaveValue('Taken');
  });
});
