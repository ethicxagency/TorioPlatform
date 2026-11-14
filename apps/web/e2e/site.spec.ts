import { expect, test } from '@playwright/test';
import { deletionState, mockApi, resetAuth, resetDeletion, trackingState } from './mocks';

test.describe('public site', () => {
  test.beforeEach(async ({ page }) => {
    resetAuth();
    resetDeletion();
    await mockApi(page, { signedOut: true });
  });

  test('the home page is server-rendered at / with SEO metadata and no client script needed for its content', async ({
    page,
    request,
  }) => {
    // Plain HTTP fetch (like a crawler): the full page is in the HTML, with metadata and structured data.
    const html = await (await request.get('/')).text();
    expect(html).toContain('Every Conversation.');
    expect(html).toContain('One Intelligent Platform.');
    expect(html).toMatch(/<title>[^<]*Torio[^<]*<\/title>/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/torio\.nextupglobal\.net\/?"/);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"SoftwareApplication"');
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    await page.goto('/');
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every Conversation.');
  });

  test('header links, CTAs and the sign in / get started routes', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const n of ['Product', 'Features', 'Integrations', 'Pricing'])
      await expect(nav.getByRole('link', { name: n })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Get started' }),
    ).toHaveAttribute('href', '/signup');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Get Started' }).first(),
    ).toHaveAttribute('href', '/signup');
    await nav.getByRole('button', { name: 'Resources' }).click();
    await expect(page.getByRole('menuitem', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy-policy',
    );
    await expect(page.getByRole('menuitem', { name: 'Account Deletion' })).toHaveAttribute(
      'href',
      '/delete-account',
    );
  });

  test('honest content: AI replies marked as not yet available, no invented numbers or customers', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('AI replies: coming soon')).toBeVisible();
    await expect(page.getByText(/not endorsed by or affiliated with Meta/)).toBeVisible();
    const body = (await page.getByRole('main').innerText()).toLowerCase();
    for (const bad of ['testimonial', '99.9', '% uptime', 'trusted by', 'customers worldwide'])
      expect(body).not.toContain(bad);
  });

  test('footer has the required links and attribution', async ({ page }) => {
    await page.goto('/');
    const f = page.getByRole('contentinfo');
    for (const [n, href] of [
      ['Privacy Policy', '/privacy-policy'],
      ['Account Deletion', '/delete-account'],
      ['Sign in', '/login'],
      ['Create account', '/signup'],
    ] as const)
      await expect(f.getByRole('link', { name: n })).toHaveAttribute('href', href);
    await expect(f).toContainText(`© ${new Date().getFullYear()} Torio. All rights reserved.`);
    await expect(f).toContainText('Powered by Nextup Global Ltd.');
  });

  test('mobile: the menu opens, links work, and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/', '/privacy-policy', '/delete-account']) {
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    }
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const m = page.getByRole('navigation', { name: 'Mobile' });
    await expect(m.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(m.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup');
    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
  });

  test('/welcome redirects to /, and a signed-in browser gets the dashboard at /', async ({
    page,
  }) => {
    await page.goto('/welcome');
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('a signed-in customer without the routing cookie is bounced from the public page to the dashboard', async ({
    page,
  }) => {
    await mockApi(page, { role: 'OWNER' });
    await page.context().clearCookies();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('robots.txt and sitemap.xml list only the public pages', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap: https://torio.nextupglobal.net/sitemap.xml');
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Disallow: \/api\//);
    const xml = await (await request.get('/sitemap.xml')).text();
    for (const u of [
      'https://torio.nextupglobal.net',
      'https://torio.nextupglobal.net/privacy-policy',
      'https://torio.nextupglobal.net/delete-account',
    ])
      expect(xml).toContain(`<loc>${u}`);
    expect(xml).not.toContain('/admin');
  });
});

test.describe('privacy policy', () => {
  test('has the required structure, a table of contents, a date, placeholders and metadata', async ({
    page,
    request,
  }) => {
    const html = await (await request.get('/privacy-policy')).text();
    expect(html).toMatch(
      /<link rel="canonical" href="https:\/\/torio\.nextupglobal\.net\/privacy-policy"/,
    );
    expect(html).toContain('<title>Privacy Policy');
    await mockApi(page, { signedOut: true });
    await page.goto('/privacy-policy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
    await expect(page.getByText(/Last updated:/)).toBeVisible();
    const toc = page.getByRole('navigation', { name: 'Table of contents' });
    await expect(toc.getByRole('link')).toHaveCount(19);
    for (const t of [
      'Introduction',
      'Who We Are',
      'AI Processing and Business Knowledge',
      'Account Deletion',
      'Contact Information',
    ])
      await expect(page.getByRole('heading', { name: new RegExp(t) })).toBeVisible();
    // unverified legal facts are visible placeholders, never invented
    expect(await page.locator('mark[data-placeholder]').count()).toBeGreaterThan(2);
    await expect(
      page.getByText(/does not send customer conversations to an external AI model provider/),
    ).toBeVisible();
    await toc.getByRole('link', { name: /Account Deletion/ }).click();
    await expect(page).toHaveURL(/#account-deletion$/);
  });
});

test.describe('account deletion page', () => {
  test.beforeEach(async ({ page }) => {
    resetAuth();
    resetDeletion();
    await mockApi(page, { signedOut: true });
  });

  test('explains deletion and requires the confirmation before anything is sent', async ({
    page,
  }) => {
    await page.goto('/delete-account');
    await expect(
      page.getByRole('heading', { name: 'Delete Your Torio Account', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/permanent deletion of your Torio account/)).toBeVisible();
    await page.getByLabel('Registered email address').fill('person@example.com');
    await page.getByRole('button', { name: 'Request Account Deletion' }).click();
    await expect(
      page.getByText('Please confirm that you understand deletion is permanent.'),
    ).toBeVisible();
    expect(deletionState.requests).toHaveLength(0);
  });

  test('a visitor gets a "check your email" notice (no reference, nothing claimed as deleted)', async ({
    page,
  }) => {
    await page.goto('/delete-account');
    await page.getByLabel('Registered email address').fill('person@example.com');
    await page.getByLabel('Reason for deletion').fill('Closing my shop');
    await page.getByLabel(/I understand that deleting my account is permanent/).check();
    await page.getByRole('button', { name: 'Request Account Deletion' }).click();
    await expect(page.getByText('Check your email.')).toBeVisible();
    await expect(page.getByText(/If an account exists for person@example.com/)).toBeVisible();
    await expect(page.getByText(/TDR-/)).toHaveCount(0);
    expect(deletionState.requests[0]).toEqual({
      email: 'person@example.com',
      reason: 'Closing my shop',
      confirm: true,
    });
  });

  test('when email delivery is not set up the page says so instead of pretending', async ({
    page,
  }) => {
    deletionState.mailConfigured = false;
    await page.goto('/delete-account');
    await page.getByLabel('Registered email address').fill('person@example.com');
    await page.getByLabel(/I understand/).check();
    await page.getByRole('button', { name: 'Request Account Deletion' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /Email delivery isn.t set up/ }),
    ).toBeVisible();
    await expect(page.getByText('Check your email.')).toHaveCount(0);
  });

  test('the emailed link confirms once and then shows the real reference and status; a bad link is refused', async ({
    page,
  }) => {
    await page.goto(`/delete-account?token=${deletionState.goodToken}`);
    await expect(page.getByText('Request received')).toBeVisible();
    await expect(page.getByText('TDR-11111-22222-33333-44444').first()).toBeVisible();
    await expect(page.getByText('Confirmed: waiting to be processed')).toBeVisible();
    expect(deletionState.verifies).toEqual([deletionState.goodToken]); // exactly one attempt
    await page.goto('/delete-account?token=bad-token-0000000000000000000000');
    await expect(
      page.getByRole('alert').filter({ hasText: /invalid, has expired, or was already used/ }),
    ).toBeVisible();
  });

  test('a signed-in customer confirms with their password and sees the reference at once', async ({
    page,
  }) => {
    await mockApi(page, { role: 'OWNER' });
    await page.goto('/delete-account');
    await page.getByLabel('Password', { exact: true }).fill('wrong');
    await page.getByLabel(/I understand/).check();
    await page.getByRole('button', { name: 'Request Account Deletion' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'That password is not correct.' }),
    ).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('Correct-pass-1');
    await page.getByRole('button', { name: 'Request Account Deletion' }).click();
    await expect(page.getByText('TDR-AAAAA-BBBBB-CCCCC-DDDDD')).toBeVisible();
    await expect(page.getByText('Confirmed: waiting to be processed')).toBeVisible();
  });

  test('status can be looked up by reference; an unknown reference says so', async ({ page }) => {
    await page.goto('/delete-account');
    await page.getByLabel('Request reference').fill('TDR-11111-22222-33333-44444');
    await page.getByRole('button', { name: 'Check status' }).click();
    await expect(page.getByText('Being processed')).toBeVisible();
    await page.getByLabel('Request reference').fill('TDR-NOPE-NOPE-NOPE-NOPE');
    await page.getByRole('button', { name: 'Check status' }).click();
    await expect(page.getByText('No request with that reference.')).toBeVisible();
  });

  test('Torio Brain page: server-rendered at /brain for visitors with SEO metadata, one h1, and the version from the release config', async ({
    page,
    request,
  }) => {
    const html = await (await request.get('/brain')).text();
    expect(html).toContain('Your Business.');
    expect(html).toContain('Understood.');
    expect(html).toMatch(/<title>Torio Brain: Your Business\. Understood\.<\/title>/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/torio\.nextupglobal\.net\/brain"/);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:card"');
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    // the internal path is not a second public address
    const r = await request.get('/torio-brain', { maxRedirects: 0 });
    expect([r.status(), r.headers().location]).toEqual([308, expect.stringContaining('/brain')]);
    await page.goto('/brain');
    await expect(page).toHaveURL(/localhost:3100\/brain$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Your Business.');
    await expect(page.getByTestId('landing-brain-version')).toHaveText(/^v\d+\.\d+\.\d+$/);
  });

  test('Torio Brain page: navigation, CTAs and every section are present', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await nav.getByRole('link', { name: 'Brain' }).click();
    await expect(page).toHaveURL(/\/brain$/);
    await expect(nav.getByRole('link', { name: 'Brain' })).toHaveAttribute('aria-current', 'page');
    const main = page.getByRole('main');
    for (const h of [
      'Not Just AI. Business Intelligence.',
      'It Knows What Your Business Knows.',
      'Generic Answers Are Not Enough.',
      'Multiple AI Perspectives. One Intelligent Response.',
      'Your Business. Your Rules.',
      'Intelligence That Evolves With Your Business.',
      'Give Your Business an Intelligence of Its Own.',
    ])
      await expect(main.getByRole('heading', { name: h })).toBeAttached();
    await expect(main.getByRole('link', { name: 'Get Started', exact: true })).toHaveAttribute(
      'href',
      '/signup',
    );
    await expect(main.getByRole('link', { name: 'Get Started with Torio' })).toHaveAttribute(
      'href',
      '/signup',
    );
    await expect(main.getByRole('link', { name: 'Explore Torio', exact: true })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(main.getByRole('link', { name: /Explore Torio Brain/ })).toHaveAttribute(
      'href',
      '#intelligence',
    );
    // only providers Torio supports are named
    await expect(main.getByText('OpenAI', { exact: true })).toBeVisible();
    await expect(main.getByText('Gemini', { exact: true })).toBeVisible();
    for (const never of ['Claude', 'Anthropic', 'Llama', 'Mistral'])
      await expect(main.getByText(never)).toHaveCount(0);
  });

  test('Torio Brain page: the interactive demos respond', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/brain');
    // intelligence map: focusing a node shows its explanation
    const node = page.getByRole('button', { name: 'Rules & Behavior' });
    await node.scrollIntoViewIfNeeded();
    await node.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: /never do/ })).toHaveCSS(
      'opacity',
      '1',
    );
    // generic vs Torio Brain: the toggle swaps the answer and labels it as an example
    const compare = page.getByRole('tablist', { name: 'Compare answers' });
    await compare.scrollIntoViewIfNeeded();
    await compare.getByRole('tab', { name: 'Torio Brain' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Chattogram in 2–3 working days');
    await compare.getByRole('tab', { name: 'Generic AI' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Please check the website');
    await expect(page.getByText(/An illustrative example/)).toBeVisible();
    // rules: choosing a rule shows the rule and a reply within it
    await page.getByRole('button', { name: 'Escalation Rules' }).click();
    await expect(page.getByText('Refund disputes go to the team.')).toBeVisible();
    await expect(page.getByText(/ask my teammate/)).toBeVisible();
    // multi-AI: the pipeline stages are described, and the page does not promise a perfect answer
    await expect(page.getByText('A draft, reviewed by a person before it is sent.')).toBeVisible();
    await expect(page.getByText(/does not guarantee a perfect answer/)).toBeVisible();
  });

  test('Torio Brain page: no horizontal overflow from phone to wide desktop, and the mobile menu lists Brain', async ({
    page,
  }) => {
    for (const [w, h] of [
      [390, 844],
      [768, 1024],
      [1280, 800],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/brain');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        w,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/brain');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Brain' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('Torio Brain page: decorative motion stops when the visitor prefers reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/brain');
    const anim = await page
      .locator('svg.bl-float')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe('none');
    // content is visible without scrolling it into view
    await expect(
      page.getByRole('heading', { name: 'Not Just AI. Business Intelligence.' }),
    ).toBeVisible();
  });

  test('Torio Meta Pixel on the public site: nothing loads without a configured Pixel, and not before the visitor accepts', async ({
    page,
  }) => {
    const meta: string[] = [];
    await page.route('https://connect.facebook.net/**', (r) => {
      meta.push(r.request().url());
      return r.fulfill({ contentType: 'application/javascript', body: '' });
    });
    // no Pixel configured: no banner, no request
    await page.goto('/brain');
    await page.waitForTimeout(600);
    await expect(page.getByRole('region', { name: 'Analytics choice' })).toHaveCount(0);
    expect(meta).toHaveLength(0);
    // configured: the visitor is asked first, and nothing is requested until they accept
    trackingState.pixelId = '1234567890';
    await page.goto('/brain');
    const banner = page.getByRole('region', { name: 'Analytics choice' });
    await expect(banner).toBeVisible();
    expect(meta).toHaveLength(0);
    await banner.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => meta.length).toBeGreaterThan(0);
    expect(meta[0]).toContain('fbevents.js');
    await expect(banner).toHaveCount(0);
    // the choice is remembered and can be reopened
    await page.reload();
    await expect(page.getByRole('region', { name: 'Analytics choice' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Analytics choice' }).click();
    await expect(page.getByRole('region', { name: 'Analytics choice' })).toBeVisible();
  });

  test('Torio Meta Pixel: declining loads nothing, and the privacy pages are never tracked', async ({
    page,
  }) => {
    const meta: string[] = [];
    await page.route('https://connect.facebook.net/**', (r) => {
      meta.push(r.request().url());
      return r.fulfill({ contentType: 'application/javascript', body: '' });
    });
    trackingState.pixelId = '1234567890';
    await page.goto('/');
    await page
      .getByRole('region', { name: 'Analytics choice' })
      .getByRole('button', { name: 'Decline' })
      .click();
    await page.goto('/brain');
    await page.waitForTimeout(600);
    expect(meta).toHaveLength(0);
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('/privacy-policy');
    await page.waitForTimeout(500);
    await expect(page.getByRole('region', { name: 'Analytics choice' })).toHaveCount(0);
    expect(meta).toHaveLength(0);
  });

  test('Torio Meta Pixel: a browser that asks not to be tracked is never asked or tracked', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: { DNT: '1' } });
    const page = await ctx.newPage();
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }),
    );
    await mockApi(page, { signedOut: true });
    trackingState.pixelId = '1234567890';
    const meta: string[] = [];
    await page.route('https://connect.facebook.net/**', (r) => {
      meta.push(r.request().url());
      return r.fulfill({ body: '' });
    });
    await page.goto('/brain');
    await page.waitForTimeout(700);
    await expect(page.getByRole('region', { name: 'Analytics choice' })).toHaveCount(0);
    expect(meta).toHaveLength(0);
    await ctx.close();
  });
});
