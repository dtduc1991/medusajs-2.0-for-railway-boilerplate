import { test, expect } from '@playwright/test';
import { snap } from './utils/screenshot';

// Requires a running Medusa backend with the coffee catalog seeded (see
// checkout.spec.ts's header comment). Each test signs up its own unique
// customer, same convention as auth.spec.ts.

function uniqueEmail(): string {
  return `ember-e2e+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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
  await page.getByTestId('email-input').fill(uniqueEmail());
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
  await page.getByTestId('postal-code-input').fill('10115');
  await page.getByTestId('country-select').selectOption('de');
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
  await page.getByTestId('email-input').fill(uniqueEmail());
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
  await page.getByTestId('postal-code-input').fill('10115');
  await page.getByTestId('country-select').selectOption('de');
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
