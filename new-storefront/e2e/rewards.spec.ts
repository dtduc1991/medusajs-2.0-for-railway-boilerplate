import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { snap } from './utils/screenshot';

// Requires a running Medusa backend with the coffee catalog seeded (see
// checkout.spec.ts's header comment). Each test signs up its own unique
// customer, same convention as auth.spec.ts.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function uniquePhone(): string {
  return `+849${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
}

// Read directly from .env.local (not exposed to this Node-side test file via
// import.meta.env, which only exists in the Vite-bundled app).
function publishableKey(): string {
  const envPath = path.resolve(__dirname, '../.env.local');
  const match = fs.readFileSync(envPath, 'utf-8').match(/VITE_MEDUSA_PUBLISHABLE_KEY=(.+)/);
  if (!match) throw new Error('VITE_MEDUSA_PUBLISHABLE_KEY not found in .env.local');
  return match[1].trim();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
});

test('logged-out Rewards tab prompts to log in instead of showing stale data', async ({ page }, testInfo) => {
  await page.getByTestId('tab-rewards').click();
  await expect(page.getByTestId('rewards-login-prompt')).toBeVisible();
  await snap(page, testInfo, '01-rewards-logged-out');
});

test('placing an order while logged in earns real loyalty points', async ({ page }, testInfo) => {
  // Sign up (and therefore log in) *before* anything creates a cart, so the
  // cart this test places an order with is created while authenticated and
  // picks up customer_id from the auth context (Medusa only associates a
  // cart with a customer at cart-creation time, not retroactively).
  await page.getByTestId('tab-you').click();
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill('Rosalind');
  await page.getByTestId('last-name-input').fill('Franklin');
  await page.getByTestId('phone-input').fill(uniquePhone());
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('password-input').fill('TestPass123!');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Rosalind Franklin', { timeout: 15000 });

  await page.getByTestId('tab-menu').click();
  await page.getByTestId('featured-quick-add-button').click();
  await page.getByTestId('tab-bag').click();
  const payButton = page.getByTestId('pay-button');
  await payButton.click();

  await page.getByTestId('email-input').fill('rewards-e2e@example.com');
  await page.getByTestId('first-name-input').fill('Rosalind');
  await page.getByTestId('last-name-input').fill('Franklin');
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('continue-to-delivery-button').click();

  await expect(page.getByTestId('shipping-option').first()).toBeVisible();
  await page.getByTestId('shipping-option').first().click();
  await page.getByTestId('place-order-button').click();
  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('back-to-menu-button').click();

  await page.getByTestId('tab-rewards').click();
  await expect.poll(async () => page.getByTestId('star-balance').textContent(), { timeout: 15000 }).not.toBe('…');
  const balanceText = await page.getByTestId('star-balance').textContent();
  expect(Number(balanceText)).toBeGreaterThan(0);
  await expect(page.getByTestId('reward-activity-row')).toHaveCount(1);
  await snap(page, testInfo, '01-rewards-after-order');
});

test('an order placed from a cart started as a guest still earns loyalty points after logging in', async ({ page }, testInfo) => {
  // Opposite ordering from the test above: add to the bag *before* signing up,
  // so the cart is created guest-owned. Without transferring cart->customer on
  // login/signup, points from this order would silently accrue to a
  // never-viewed guest customer identity instead of this account.
  await page.getByTestId('featured-quick-add-button').click();

  await page.getByTestId('tab-you').click();
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill('Ada');
  await page.getByTestId('last-name-input').fill('Lovelace');
  await page.getByTestId('phone-input').fill(uniquePhone());
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('password-input').fill('TestPass123!');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Ada Lovelace', { timeout: 15000 });

  await page.getByTestId('tab-bag').click();
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  const payButton = page.getByTestId('pay-button');
  await payButton.click();

  await page.getByTestId('email-input').fill('rewards-guest-e2e@example.com');
  await page.getByTestId('first-name-input').fill('Ada');
  await page.getByTestId('last-name-input').fill('Lovelace');
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('continue-to-delivery-button').click();

  await expect(page.getByTestId('shipping-option').first()).toBeVisible();
  await page.getByTestId('shipping-option').first().click();
  await page.getByTestId('place-order-button').click();
  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('back-to-menu-button').click();

  await page.getByTestId('tab-rewards').click();
  await expect.poll(async () => page.getByTestId('star-balance').textContent(), { timeout: 15000 }).not.toBe('…');
  const balanceText = await page.getByTestId('star-balance').textContent();
  expect(Number(balanceText)).toBeGreaterThan(0);
  await expect(page.getByTestId('reward-activity-row')).toHaveCount(1);
  await snap(page, testInfo, '01-rewards-after-guest-cart-order');
});

test('redeeming a reward debits the threshold and logs an activity row', async ({ page }, testInfo) => {
  await page.getByTestId('tab-you').click();
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill('Grace');
  await page.getByTestId('last-name-input').fill('Hopper');
  await page.getByTestId('phone-input').fill(uniquePhone());
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('password-input').fill('TestPass123!');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Grace Hopper', { timeout: 15000 });

  // One quick-add order's worth of points (well over the default 8-point
  // threshold at the seeded coffee prices) so the redeem button appears.
  await page.getByTestId('tab-menu').click();
  await page.getByTestId('featured-quick-add-button').click();
  await page.getByTestId('tab-bag').click();
  // Quick-add is fire-and-forget (`void addVariantToCart(...)`) — wait for the
  // item to actually land before looking for the pay button, otherwise the
  // bag can still be empty under a slow backend.
  await expect(page.getByTestId('cart-item')).toHaveCount(1, { timeout: 15000 });
  await page.getByTestId('pay-button').click();

  await page.getByTestId('email-input').fill('rewards-redeem-e2e@example.com');
  await page.getByTestId('first-name-input').fill('Grace');
  await page.getByTestId('last-name-input').fill('Hopper');
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('continue-to-delivery-button').click();
  await expect(page.getByTestId('shipping-option').first()).toBeVisible();
  await page.getByTestId('shipping-option').first().click();
  await page.getByTestId('place-order-button').click();
  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('back-to-menu-button').click();

  await page.getByTestId('tab-rewards').click();
  await expect.poll(async () => page.getByTestId('star-balance').textContent(), { timeout: 15000 }).not.toBe('…');
  const balanceBefore = Number(await page.getByTestId('star-balance').textContent());
  await expect(page.getByTestId('redeem-reward-button')).toBeVisible();
  await snap(page, testInfo, '01-rewards-before-redeem');

  await page.getByTestId('redeem-reward-button').click();
  await expect.poll(
    async () => Number(await page.getByTestId('star-balance').textContent()),
    { timeout: 15000 }
  ).toBeLessThan(balanceBefore);
  const balanceAfter = Number(await page.getByTestId('star-balance').textContent());

  const configRes = await page.request.get('http://localhost:9000/store/loyalty/config', {
    headers: { 'x-publishable-api-key': publishableKey() },
  });
  const { rewardThreshold } = await configRes.json();
  expect(balanceBefore - balanceAfter).toBe(rewardThreshold);

  await expect(page.getByTestId('reward-activity-row').first()).toContainText('Free drink redeemed');
  await snap(page, testInfo, '02-rewards-after-redeem');
});

test('redeeming a reward with an item already in the bag applies a real discount to the cart', async ({ page }, testInfo) => {
  await snap(page, testInfo, '01-menu-initial');
  await page.getByTestId('tab-you').click();

  await snap(page, testInfo, '02-you-tab-login-form');
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill('Katherine');
  await page.getByTestId('last-name-input').fill('Johnson');
  await page.getByTestId('phone-input').fill(uniquePhone());
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('password-input').fill('TestPass123!');

  await snap(page, testInfo, '03-signup-form-filled');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Katherine Johnson', { timeout: 15000 });

  // One quick-add order's worth of points (well over the default 8-point
  // threshold at the seeded coffee prices) so the redeem button appears.
  await snap(page, testInfo, '04-you-tab-logged-in');
  await page.getByTestId('tab-menu').click();

  await snap(page, testInfo, '05-menu-before-quick-add');
  await page.getByTestId('featured-quick-add-button').click();

  // Quick-add is fire-and-forget (`void addVariantToCart(...)`) — wait for the
  // bag-count badge to actually render before snapping, otherwise this
  // screenshot is taken before the async add lands and looks unchanged.
  await expect(page.getByTestId('bag-count-badge')).toBeVisible({ timeout: 15000 });
  await snap(page, testInfo, '06-menu-after-quick-add');
  await page.getByTestId('tab-bag').click();
  // Quick-add is fire-and-forget (`void addVariantToCart(...)`) — wait for the
  // item to actually land before looking for the pay button, otherwise the
  // bag can still be empty under a slow backend.
  await expect(page.getByTestId('cart-item')).toHaveCount(1, { timeout: 15000 });

  await snap(page, testInfo, '07-bag-with-item');
  await page.getByTestId('pay-button').click();

  await page.getByTestId('email-input').fill('rewards-fulfillment-e2e@example.com');
  await page.getByTestId('first-name-input').fill('Katherine');
  await page.getByTestId('last-name-input').fill('Johnson');
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');

  await snap(page, testInfo, '08-checkout-form-filled');
  await page.getByTestId('continue-to-delivery-button').click();
  await expect(page.getByTestId('shipping-option').first()).toBeVisible();

  await snap(page, testInfo, '09-delivery-options');
  await page.getByTestId('shipping-option').first().click();

  await snap(page, testInfo, '10-shipping-selected');
  await page.getByTestId('place-order-button').click();
  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 15000 });

  await snap(page, testInfo, '11-order-confirmation');
  await page.getByTestId('back-to-menu-button').click();

  // Start a fresh bag (the order above cleared it) so there's a real cart to
  // apply the reward's discount to.
  await snap(page, testInfo, '12-menu-fresh-bag');
  await page.getByTestId('featured-quick-add-button').click();

  await snap(page, testInfo, '13-menu-after-second-quick-add');
  await page.getByTestId('tab-bag').click();
  // Quick-add is fire-and-forget in the app (`void addVariantToCart(...)`) —
  // wait for the cart item to actually render before reading localStorage,
  // otherwise the cart id may not be persisted yet.
  await expect(page.getByTestId('cart-item')).toHaveCount(1, { timeout: 15000 });
  const cartIdBefore = await page.evaluate(() => localStorage.getItem('ember_cart_id'));
  const beforeRes = await page.request.get(`http://localhost:9000/store/carts/${cartIdBefore}`, {
    headers: { 'x-publishable-api-key': publishableKey() },
    params: { fields: 'total' },
  });
  const totalBefore = (await beforeRes.json()).cart.total;

  await snap(page, testInfo, '14-bag-with-fresh-item');
  await page.getByTestId('tab-rewards').click();
  await expect.poll(async () => page.getByTestId('star-balance').textContent(), { timeout: 15000 }).not.toBe('…');
  await expect(page.getByTestId('redeem-reward-button')).toBeVisible();

  await snap(page, testInfo, '15-rewards-before-redeem');
  await page.getByTestId('redeem-reward-button').click();

  await expect(page.getByTestId('redeem-confirmation')).toHaveText(
    'Applied! Your free drink discount is in your bag.',
    { timeout: 15000 }
  );
  await snap(page, testInfo, '16-rewards-fulfillment-applied');

  const cartIdAfter = await page.evaluate(() => localStorage.getItem('ember_cart_id'));
  expect(cartIdAfter).toBe(cartIdBefore);
  const afterRes = await page.request.get(`http://localhost:9000/store/carts/${cartIdAfter}`, {
    headers: { 'x-publishable-api-key': publishableKey() },
    params: { fields: 'total,*promotions' },
  });
  const cartAfter = (await afterRes.json()).cart;
  expect(cartAfter.promotions.length).toBe(1);
  expect(cartAfter.total).toBeLessThan(totalBefore);
});
