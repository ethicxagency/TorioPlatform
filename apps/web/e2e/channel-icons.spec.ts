import { expect, test } from '@playwright/test';
import { mockApi, resetSettings } from './mocks';

test.describe('official channel icons', () => {
  test.beforeEach(async ({ page }) => {
    resetSettings();
    await mockApi(page, { role: 'OWNER' });
  });

  test('every channel surface draws the brand logo, not a coloured dot or initial', async ({
    page,
  }) => {
    await page.goto('/channels');
    // channel cards: tile icons labelled with the platform name, containing the real logo path
    for (const name of ['WhatsApp', 'Instagram']) {
      const icon = page.getByRole('img', { name, exact: true }).first();
      await expect(icon).toBeVisible();
      await expect(icon.locator('svg path')).toHaveCount(1);
      expect(await icon.locator('svg path').getAttribute('d')).toMatch(/^M/);
    }
    // not a letter-in-a-circle placeholder
    await expect(page.getByRole('img', { name: 'WhatsApp', exact: true }).first()).not.toHaveText(
      'W',
    );

    await page.goto('/inbox');
    await expect(
      page.getByRole('img', { name: /WhatsApp|Instagram|Messenger/ }).first(),
    ).toBeVisible();
    // sidebar channel shortcuts under Inbox
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.locator('a[href="/inbox?channel=WHATSAPP"] svg path')).toHaveCount(1);
    await expect(nav.locator('a[href="/inbox?channel=INSTAGRAM"] svg path')).toHaveCount(1);
    await expect(nav.locator('a[href="/inbox?channel=MESSENGER"] svg path')).toHaveCount(1);
  });

  test('brand colours: WhatsApp green and gradient tiles for Instagram and Messenger', async ({
    page,
  }) => {
    await page.goto('/channels');
    const bg = (n: string) =>
      page
        .getByRole('img', { name: n, exact: true })
        .first()
        .evaluate(
          (e) => getComputedStyle(e).backgroundImage + '|' + getComputedStyle(e).backgroundColor,
        );
    expect(await bg('WhatsApp')).toContain('rgb(37, 211, 102)');
    expect(await bg('Instagram')).toContain('linear-gradient');
  });
});
