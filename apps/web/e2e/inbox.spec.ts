import { expect, test } from '@playwright/test';
import { mockApi } from './mocks';

test.describe('inbox', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto('/inbox');
  });

  test('lists conversations with real counts and no fake data labels', async ({ page }) => {
    await expect(page.getByRole('option', { name: /Tanvir Hasan/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Open/ })).toContainText('2');
    await expect(page.getByRole('tab', { name: /Snoozed/ })).toContainText('0');
  });

  test('closed chat state has no placeholder; opening shows chat without the profile', async ({
    page,
  }) => {
    await expect(page.getByText('Select a conversation')).toHaveCount(0);
    await expect(page.getByRole('region', { name: /^Chat with/ })).toHaveCount(0);
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('region', { name: 'Chat with Tanvir Hasan' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Customer profile' })).toHaveCount(0);
  });

  test('three-dot opens the profile; X closes chat and profile', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('button', { name: 'Open customer profile' }).click();
    await expect(page.getByRole('heading', { name: 'Customer', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Close chat' }).click();
    await expect(page.getByRole('region', { name: /^Chat with/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Customer', level: 2 })).toHaveCount(0);
    // The conversation itself is untouched.
    await expect(page.getByRole('tab', { name: /Open/ })).toContainText('2');
  });

  test('drafts persist per conversation', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await page.getByRole('textbox', { name: /Reply to Tanvir/ }).fill('draft one');
    await page.getByRole('option', { name: /Ayesha Siddiqua/ }).click();
    await expect(page.getByRole('textbox', { name: /Reply to Ayesha/ })).toHaveValue('');
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('textbox', { name: /Reply to Tanvir/ })).toHaveValue('draft one');
  });

  test('slash command inserts a saved reply with variables and does not send', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const box = page.getByRole('textbox', { name: /Reply to Tanvir/ });
    await box.fill('/tha');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('Thanks, Tanvir!');
  });

  test('send is disabled for an empty draft; AI Assist is honest', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'AI Assist' }).click();
    await expect(page.getByText("AI Assist isn't connected yet")).toBeVisible();
  });

  test('keyboard: ? opens shortcuts, J opens the first conversation, Escape closes the dialog', async ({
    page,
  }) => {
    await expect(page.getByRole('option', { name: /Tanvir Hasan/ })).toBeVisible(); // wait for hydration
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    await page.keyboard.press('j');
    await expect(page.getByRole('region', { name: 'Chat with Tanvir Hasan' })).toBeVisible();
  });

  test('no horizontal overflow on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/inbox');
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(page.getByRole('option', { name: /Tanvir Hasan/ })).toBeVisible();
  });

  test('filters fit the list: channel chips are labelled icons; no attachment button', async ({
    page,
  }) => {
    const views = page.getByRole('group', { name: 'Views' });
    for (const name of ['WhatsApp', 'Instagram', 'Messenger'])
      await expect(views.getByRole('button', { name })).toBeVisible();
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByRole('button', { name: /Attach file/ })).toHaveCount(0);
  });

  test('a failed reply shows its reason and can be resent', async ({ page }) => {
    await page.getByRole('option', { name: /Tanvir Hasan/ }).click();
    await expect(page.getByText('Not delivered: Outside the 24-hour window')).toBeVisible();
    const retry = page.waitForRequest((r) => r.url().endsWith('/retry') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Retry sending' }).click();
    await retry;
    await expect(page.getByText('Message sent')).toBeVisible();
  });
});
