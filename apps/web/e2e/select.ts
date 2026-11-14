import type { Locator } from '@playwright/test';

/** Picks a value in the app's custom select (the list opens in a portal, so it is found from the page). */
export async function choose(trigger: Locator, value: string) {
  await trigger.click();
  await trigger.page().locator(`[role="option"][data-value="${value}"]`).click();
}
