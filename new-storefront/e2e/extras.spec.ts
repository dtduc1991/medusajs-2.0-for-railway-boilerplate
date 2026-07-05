import { test, expect } from '@playwright/test';
import { snap } from './utils/screenshot';

// Requires a running Medusa backend with the coffee + extras catalog seeded
// via `pnpm seed:coffee` in backend/ (see checkout.spec.ts's header comment
// for the same caveat — no per-test DB reset in this suite).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
});

test('customizing a drink adds its pre-selected extra as a separate, linked cart line item', async ({ page }, testInfo) => {
  await page.getByTestId('featured-drink-card').click();
  await snap(page, testInfo, '01-drink-detail');

  await page.getByTestId('add-to-bag-button').click();

  await page.getByTestId('tab-bag').click();
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  await expect(page.getByTestId('cart-item-extra')).toHaveCount(1);
  await snap(page, testInfo, '02-bag-with-extra');

  // Removing the drink (qty to 0) must cascade-remove its linked extra too.
  const parentControls = page.getByTestId('cart-item').locator('button').first();
  await parentControls.click();

  await expect(page.getByTestId('cart-item')).toHaveCount(0);
  await expect(page.getByTestId('cart-item-extra')).toHaveCount(0);
  await snap(page, testInfo, '03-bag-emptied');
});
