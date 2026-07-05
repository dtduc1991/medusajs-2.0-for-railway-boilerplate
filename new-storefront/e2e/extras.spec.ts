import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { snap } from './utils/screenshot';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Requires a running Medusa backend with the coffee + extras catalog seeded
// via `pnpm seed:coffee` in backend/ (see checkout.spec.ts's header comment
// for the same caveat — no per-test DB reset in this suite).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
});

// Read directly from .env.local (not exposed to this Node-side test file via
// import.meta.env, which only exists in the Vite-bundled app).
function publishableKey(): string {
  const envPath = path.resolve(__dirname, '../.env.local');
  const match = fs.readFileSync(envPath, 'utf-8').match(/VITE_MEDUSA_PUBLISHABLE_KEY=(.+)/);
  if (!match) throw new Error('VITE_MEDUSA_PUBLISHABLE_KEY not found in .env.local');
  return match[1].trim();
}

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

test('increasing a drink\'s cart quantity scales its linked extra\'s quantity to match', async ({ page }) => {
  await page.getByTestId('featured-drink-card').click();
  await page.getByTestId('add-to-bag-button').click();

  await page.getByTestId('tab-bag').click();
  const qtyButtons = page.getByTestId('cart-item').locator('button');
  await qtyButtons.nth(1).click(); // plus: drink qty 1 -> 2
  await expect(page.getByTestId('cart-item').locator('span').first()).toHaveText('2');

  const cartId = await page.evaluate(() => localStorage.getItem('ember_cart_id'));
  const res = await page.request.get(`http://localhost:9000/store/carts/${cartId}`, {
    headers: { 'x-publishable-api-key': publishableKey() },
    params: { fields: '*items' },
  });
  const { cart } = await res.json();
  const parent = cart.items.find((it: any) => !it.metadata?.parent_line_item_id);
  const extra = cart.items.find((it: any) => it.metadata?.parent_line_item_id === parent.id);
  expect(parent.quantity).toBe(2);
  expect(extra.quantity).toBe(2);
});
