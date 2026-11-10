import { expect, test } from '@playwright/test';
import { authState, mockApi, resetAuth } from './mocks';

/**
 * Customer authentication pages against a mocked API. The Google and Facebook buttons are plain links to the API's
 * start endpoint; the provider round trip itself is covered by the API integration tests (with mocked providers) and
 * by the manual real-provider check in docs/CUSTOMER_AUTH.md, not here.
 */
test.beforeEach(async ({ page }) => {
  resetAuth();
  await mockApi(page, { signedOut: true });
});

test.describe('sign in', () => {
  test('has the redesigned form, both social buttons and the right links', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with Facebook' })).toBeVisible();
    await expect(page.getByText('or continue with email')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  test('wrong credentials show an error and stay on the page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('a@test.dev');
    await page.getByLabel('Password', { exact: true }).fill('nope');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Invalid email or password' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a rate-limited attempt says so', async ({ page }) => {
    authState.failLoginWith = 429;
    await page.goto('/login');
    await page.getByLabel('Email address').fill('a@test.dev');
    await page.getByLabel('Password', { exact: true }).fill('whatever');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/Too many attempts/)).toBeVisible();
  });

  test('success shows a toast and goes to the page the customer was heading to', async ({
    page,
  }) => {
    await page.goto('/login?next=%2Forders');
    await page.getByLabel('Email address').fill('a@test.dev');
    await page.getByLabel('Password', { exact: true }).fill('Correct-pass-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/orders$/);
    expect(authState.logins).toHaveLength(1);
  });

  test('an outside or admin return address is ignored', async ({ page }) => {
    for (const next of ['https://evil.example', '//evil.example', '/admin']) {
      authState.logins = [];
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await page.getByLabel('Email address').fill('a@test.dev');
      await page.getByLabel('Password', { exact: true }).fill('Correct-pass-1');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/localhost:3100\/$/);
      await mockApi(page, { signedOut: true });
    }
  });

  test('the password can be shown and hidden', async ({ page }) => {
    await page.goto('/login');
    const pw = page.getByLabel('Password', { exact: true });
    await expect(pw).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(pw).toHaveAttribute('type', 'text');
  });

  test('social buttons carry a safe return path to the API start endpoint', async ({ page }) => {
    await page.goto('/login?next=%2Fleads');
    const href = await page
      .getByRole('link', { name: 'Continue with Google' })
      .getAttribute('href');
    expect(href).toContain('/api/v1/auth/oauth/google/start');
    expect(href).toContain('returnTo=%2Fleads');
    expect(
      await page.getByRole('link', { name: 'Continue with Facebook' }).getAttribute('href'),
    ).toContain('/api/v1/auth/oauth/facebook/start');
  });

  test('providers that are not configured are disabled and explained, not faked', async ({
    page,
  }) => {
    authState.config = { google: false, facebook: false, email: false, registrationOpen: true };
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeDisabled();
    await expect(page.getByText(/aren.t set up on this deployment yet/)).toBeVisible();
  });

  test('a signed-in customer is kept away from the sign-in page', async ({ page }) => {
    await mockApi(page, { signedOut: false });
    await page.goto('/login');
    await expect(page).toHaveURL(/localhost:3100\/$/);
  });

  test('phone: no sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/login', '/signup', '/forgot-password']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    }
  });
});

test.describe('sign up', () => {
  const fill = async (
    page: import('@playwright/test').Page,
    email = 'new@test.dev',
    confirm = 'Strong-pass-1',
  ) => {
    await page.getByLabel('Full name').fill('New Person');
    await page.getByLabel('Business name').fill('New Co');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Strong-pass-1');
    await page.getByLabel('Confirm password').fill(confirm);
  };

  test('shows the strength meter and validates before sending anything', async ({ page }) => {
    await page.goto('/signup');
    await expect(
      page.getByRole('heading', { name: 'Create your account', level: 1 }),
    ).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('short');
    await expect(page.getByText('Too weak')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('Strong-pass-1');
    await expect(page.getByText('Strong', { exact: true })).toBeVisible();
    await fill(page, 'new@test.dev', 'different');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Passwords don’t match')).toBeVisible();
    expect(authState.registers).toHaveLength(0);
  });

  test('a registered email is reported on the field', async ({ page }) => {
    await page.goto('/signup');
    await fill(page, 'taken@test.dev');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/account with this email already exists/)).toBeVisible();
  });

  test('success sends only the supported fields and goes to email verification', async ({
    page,
  }) => {
    await page.goto('/signup');
    await fill(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/verify-email$/);
    expect(authState.registers[0]).toEqual({
      name: 'New Person',
      workspaceName: 'New Co',
      email: 'new@test.dev',
      password: 'Strong-pass-1',
    });
  });

  test('closed registration blocks the form with a reason', async ({ page }) => {
    authState.config = { ...authState.config, registrationOpen: false };
    await page.goto('/signup');
    await expect(page.getByText(/sign-ups are closed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });
});

test.describe('password recovery', () => {
  test('forgot password always answers the same way', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill('anyone@test.dev');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(/If an account exists for anyone@test.dev/)).toBeVisible();
    expect(authState.forgots).toHaveLength(1);
  });

  test('says plainly when email delivery is not set up', async ({ page }) => {
    authState.config = { ...authState.config, email: false };
    await page.goto('/forgot-password');
    await expect(page.getByText(/Email delivery isn.t set up/)).toBeVisible();
  });

  test('a good reset link sets the password and returns to sign-in with a notice', async ({
    page,
  }) => {
    await page.goto('/reset-password?token=good-token-0000000000000000000');
    await page.getByLabel('New password', { exact: true }).fill('Brand-new-pass-2');
    await page.getByLabel('Confirm new password').fill('Brand-new-pass-2');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText(/Your password was changed/)).toBeVisible();
    expect(authState.resets).toHaveLength(1);
  });

  test('a bad or missing reset link is explained', async ({ page }) => {
    await page.goto('/reset-password?token=bad-token-00000000000000000000');
    await page.getByLabel('New password', { exact: true }).fill('Brand-new-pass-2');
    await page.getByLabel('Confirm new password').fill('Brand-new-pass-2');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('heading', { name: 'This link can’t be used' })).toBeVisible();
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'This link can’t be used' })).toBeVisible();
  });
});

test.describe('email verification', () => {
  test('a good link verifies once; a bad one is refused', async ({ page }) => {
    await page.goto('/verify-email?token=good-token-0000000000000000000');
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
    await page.goto('/verify-email?token=bad-token-00000000000000000000');
    await expect(page.getByRole('heading', { name: 'This link can’t be used' })).toBeVisible();
  });

  test('the pending page offers a resend after a cooldown', async ({ page }) => {
    await mockApi(page, { signedOut: false });
    await page.goto('/verify-email');
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend email in \d+s/ })).toBeDisabled();
  });
});

test.describe('social sign-in results', () => {
  for (const [reason, title] of [
    ['cancelled', 'Sign-in cancelled'],
    ['invalid_state', 'That sign-in link expired'],
    ['account_exists', 'An account with this email already exists'],
    ['provider_not_configured', 'This sign-in method isn’t set up'],
    ['mail_not_configured', 'We can’t confirm your email yet'],
  ]) {
    test(`the ${reason} error page explains itself`, async ({ page }) => {
      await page.goto(`/auth/callback?status=error&reason=${reason}`);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
    });
  }

  test('an unknown reason falls back to a generic provider error', async ({ page }) => {
    await page.goto('/auth/callback?status=error&reason=%3Cscript%3E');
    await expect(page.getByRole('heading', { name: /couldn.t sign you in/ })).toBeVisible();
  });

  test('a successful callback adopts the session and lands on the safe destination', async ({
    page,
  }) => {
    await mockApi(page, { signedOut: false });
    await page.goto('/auth/callback?status=ok&next=%2Fcustomers');
    await expect(page).toHaveURL(/\/customers$/);
  });

  test('a callback that carries no session cookie says so instead of pretending', async ({
    page,
  }) => {
    await page.goto('/auth/callback?status=ok&next=%2Fcustomers');
    await expect(page.getByRole('heading', { name: 'That sign-in link expired' })).toBeVisible();
  });

  test('the email step for a provider that gave no address', async ({ page }) => {
    await page.goto('/auth/complete?step=email');
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
    await page.goto('/auth/complete?step=check-email');
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  });
});
