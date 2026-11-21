import { expect, test } from '@playwright/test';

/**
 * The public site's routes. The e2e server has no API behind it, so pricing renders its honest "could not load" state:
 * these tests prove the page is reachable and never shows made-up prices. Live plans are covered by the API tests
 * (published-only feed) and the pricing component's unit tests.
 */
test.describe('public site', () => {
  test('/pricing is public, and without the plan feed it shows no made-up prices', async ({
    page,
  }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /Simple pricing/ })).toBeVisible();
    await expect(page.getByText(/Pricing couldn.t be loaded/)).toBeVisible();
    await expect(page.getByText(/৳\s?\d/)).toHaveCount(0);
  });

  test('the home page is the public landing page for visitors, with the pricing section', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Every Conversation/ }).first()).toBeVisible();
    await expect(page.locator('#pricing')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pricing' }).first()).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  test('/app sends a visitor to sign in; /privacy reaches the policy', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy-policy$/);
  });

  test('/login and /signup are the existing customer pages and keep a chosen plan in the URL', async ({
    page,
  }) => {
    await page.goto('/login?plan=growth&interval=YEAR');
    await expect(page.getByRole('button', { name: /Sign in|Log in/i }).first()).toBeVisible();
    await page.goto('/signup?plan=growth&interval=YEAR');
    await expect(page.getByRole('heading', { name: /Create your account/ })).toBeVisible();
    await expect(page).toHaveURL(/plan=growth&interval=YEAR/);
  });

  test('the revalidation endpoint refuses a caller without the shared secret', async ({
    request,
  }) => {
    expect((await request.post('/revalidate/plans')).status()).toBe(403);
    expect(
      (
        await request.post('/revalidate/plans', { headers: { 'x-revalidate-secret': 'wrong' } })
      ).status(),
    ).toBe(403);
  });

  test('sitemap lists pricing and robots allows it', async ({ request }) => {
    expect(await (await request.get('/sitemap.xml')).text()).toContain('/pricing');
    expect(await (await request.get('/robots.txt')).text()).toContain('Allow: /pricing');
  });
});
