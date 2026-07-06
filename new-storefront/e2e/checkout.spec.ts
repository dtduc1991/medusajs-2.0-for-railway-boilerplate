import { test, expect } from '@playwright/test';
import { snap } from './utils/screenshot';

// Requires a running Medusa backend (see new-storefront/.env.local /
// .env.local.template) with the coffee catalog seeded via
// `pnpm seed:coffee` in backend/ — this suite doesn't seed/reset data
// itself, unlike storefront/'s e2e suite.

/** Pulls the first decimal amount out of button text like "Pay €5.50". */
function parseAmount(text: string | null): number {
  const match = (text ?? '').match(/[\d.,]+/);
  return match ? parseFloat(match[0].replace(',', '.')) : NaN;
}

function uniquePhone(): string {
  return `+849${Math.floor(10000000 + Math.random() * 89999999)}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
});

test('guest can add a drink, check out, and land on a real order confirmation', async ({ page }, testInfo) => {
  await snap(page, testInfo, '01-menu');

  await page.getByTestId('featured-quick-add-button').click();

  await page.getByTestId('tab-bag').click();
  const payButton = page.getByTestId('pay-button');
  await expect(payButton).toBeVisible();
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  const bagTotal = parseAmount(await payButton.textContent());
  await snap(page, testInfo, '02-bag');
  await payButton.click();

  await expect(page.getByTestId('checkout-container')).toBeVisible();
  // Logged-out nudge: visible, dismissible, and never blocks guest checkout.
  await expect(page.getByTestId('checkout-login-nudge')).toBeVisible();
  await page.getByTestId('checkout-login-nudge-dismiss').click();
  await expect(page.getByTestId('checkout-login-nudge')).toHaveCount(0);

  await page.getByTestId('email-input').fill('ember-e2e@example.com');
  await page.getByTestId('phone-input').fill(uniquePhone());
  await page.getByTestId('first-name-input').fill('Ada');
  await page.getByTestId('last-name-input').fill('Lovelace');
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await snap(page, testInfo, '03-checkout-address-filled');

  await page.getByTestId('continue-to-delivery-button').click();

  const shippingOptions = page.getByTestId('shipping-option');
  await expect(shippingOptions.first()).toBeVisible();
  await expect(shippingOptions).toHaveCount(2);

  const placeOrderButton = page.getByTestId('place-order-button');
  await expect(placeOrderButton).toContainText('Place order');
  // Selecting a shipping option commits it to the cart and asynchronously
  // refetches the total — regression test for a bug caught during manual
  // verification, where the button kept showing the pre-shipping bag total
  // right up until the order was placed. expect.poll retries until the
  // refetch lands rather than racing it with a single read.
  await expect.poll(async () => parseAmount(await placeOrderButton.textContent()), { timeout: 10000 }).toBeGreaterThan(bagTotal);
  await snap(page, testInfo, '04-checkout-shipping-selected');

  await placeOrderButton.click();

  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('order-display-id')).toContainText('Order #');
  await snap(page, testInfo, '05-order-confirmation');

  await page.getByTestId('back-to-menu-button').click();
  await page.getByTestId('tab-bag').click();
  await expect(page.getByTestId('cart-item')).toHaveCount(0);
  await snap(page, testInfo, '06-bag-emptied');
});

test('logged-in checkout prefills from the persisted default address and can be overridden for a different receiver', async ({
  page,
}, testInfo) => {
  const phone = uniquePhone();

  await page.getByTestId('tab-you').click();
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill('Grace');
  await page.getByTestId('last-name-input').fill('Hopper');
  await page.getByTestId('phone-input').fill(phone);
  await page.getByTestId('address-input').fill('1 Signup Way');
  await page.getByTestId('city-input').fill('Hanoi');
  await page.getByTestId('password-input').fill('TestPass123!');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Grace Hopper', { timeout: 15000 });

  await page.getByTestId('tab-menu').click();
  await page.getByTestId('featured-quick-add-button').click();
  await page.getByTestId('tab-bag').click();
  await expect(page.getByTestId('cart-item')).toHaveCount(1, { timeout: 15000 });
  await page.getByTestId('pay-button').click();

  await expect(page.getByTestId('checkout-container')).toBeVisible();
  // Logged in: no login nudge, and the real signup-time default address
  // (name, phone, address, city) is prefilled — not just name/email.
  await expect(page.getByTestId('checkout-login-nudge')).toHaveCount(0);
  await expect(page.getByTestId('first-name-input')).toHaveValue('Grace');
  await expect(page.getByTestId('last-name-input')).toHaveValue('Hopper');
  await expect(page.getByTestId('phone-input')).toHaveValue(phone);
  await expect(page.getByTestId('address-input')).toHaveValue('1 Signup Way');
  await expect(page.getByTestId('city-input')).toHaveValue('Hanoi');
  await snap(page, testInfo, '01-checkout-prefilled');

  await page.getByTestId('use-different-address-button').click();
  await expect(page.getByTestId('first-name-input')).toHaveValue('');
  await expect(page.getByTestId('last-name-input')).toHaveValue('');
  await expect(page.getByTestId('phone-input')).toHaveValue('');
  await expect(page.getByTestId('address-input')).toHaveValue('');
  await expect(page.getByTestId('city-input')).toHaveValue('');
  await expect(page.getByTestId('use-different-address-button')).toHaveCount(0);
  await snap(page, testInfo, '02-checkout-cleared-for-different-receiver');

  await page.getByTestId('email-input').fill('ember-e2e-receiver@example.com');
  await page.getByTestId('phone-input').fill(uniquePhone());
  await page.getByTestId('first-name-input').fill('Ada');
  await page.getByTestId('last-name-input').fill('Lovelace');
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Ho Chi Minh City');
  await page.getByTestId('continue-to-delivery-button').click();

  const shippingOptions = page.getByTestId('shipping-option');
  await expect(shippingOptions.first()).toBeVisible();
  await page.getByTestId('place-order-button').click();
  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 15000 });
  await snap(page, testInfo, '03-order-confirmation-different-receiver');
});

test('checkout form cannot be submitted with required fields missing', async ({ page }, testInfo) => {
  await page.getByTestId('featured-quick-add-button').click();
  await page.getByTestId('tab-bag').click();
  await page.getByTestId('pay-button').click();

  await expect(page.getByTestId('continue-to-delivery-button')).toBeDisabled();
  await snap(page, testInfo, '01-continue-disabled-empty-form');

  await page.getByTestId('email-input').fill('partial@example.com');
  await expect(page.getByTestId('continue-to-delivery-button')).toBeDisabled();
  await snap(page, testInfo, '02-continue-disabled-partial-form');
});
