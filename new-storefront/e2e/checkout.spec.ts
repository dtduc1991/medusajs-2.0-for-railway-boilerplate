import { test, expect } from '@playwright/test';

// Requires a running Medusa backend (see new-storefront/.env.local /
// .env.local.template) with the coffee catalog seeded via
// `pnpm seed:coffee` in backend/ — this suite doesn't seed/reset data
// itself, unlike storefront/'s e2e suite.

/** Pulls the first decimal amount out of button text like "Pay €5.50". */
function parseAmount(text: string | null): number {
  const match = (text ?? '').match(/[\d.,]+/);
  return match ? parseFloat(match[0].replace(',', '.')) : NaN;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
});

test('guest can add a drink, check out, and land on a real order confirmation', async ({ page }) => {
  await page.getByTestId('featured-quick-add-button').click();

  await page.getByTestId('tab-bag').click();
  const payButton = page.getByTestId('pay-button');
  await expect(payButton).toBeVisible();
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  const bagTotal = parseAmount(await payButton.textContent());
  await payButton.click();

  await expect(page.getByTestId('checkout-container')).toBeVisible();
  await page.getByTestId('email-input').fill('ember-e2e@example.com');
  await page.getByTestId('first-name-input').fill('Ada');
  await page.getByTestId('last-name-input').fill('Lovelace');
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('postal-code-input').fill('10115');
  await page.getByTestId('country-select').selectOption('de');

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

  await placeOrderButton.click();

  await expect(page.getByTestId('order-confirmation')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('order-display-id')).toContainText('Order #');

  await page.getByTestId('back-to-menu-button').click();
  await page.getByTestId('tab-bag').click();
  await expect(page.getByTestId('cart-item')).toHaveCount(0);
});

test('checkout form cannot be submitted with required fields missing', async ({ page }) => {
  await page.getByTestId('featured-quick-add-button').click();
  await page.getByTestId('tab-bag').click();
  await page.getByTestId('pay-button').click();

  await expect(page.getByTestId('continue-to-delivery-button')).toBeDisabled();

  await page.getByTestId('email-input').fill('partial@example.com');
  await expect(page.getByTestId('continue-to-delivery-button')).toBeDisabled();
});
