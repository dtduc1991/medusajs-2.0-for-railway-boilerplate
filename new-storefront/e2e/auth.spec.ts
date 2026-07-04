import { test, expect } from '@playwright/test';
import { snap } from './utils/screenshot';

// Requires a running Medusa backend (see new-storefront/.env.local /
// .env.local.template). Each test signs up its own unique customer (email
// keyed on Date.now() + a random suffix) rather than relying on seeded
// fixture accounts, since there's no per-test DB reset in this suite.

function uniqueEmail(): string {
  return `ember-e2e+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
  await page.getByTestId('tab-you').click();
});

test('You tab shows a login/signup form when logged out', async ({ page }, testInfo) => {
  await expect(page.getByTestId('account-container')).toBeVisible();
  await expect(page.getByTestId('email-input')).toBeVisible();
  await expect(page.getByTestId('password-input')).toBeVisible();
  await expect(page.getByTestId('auth-submit-button')).toContainText('Log in');
  await snap(page, testInfo, '01-logged-out-form');
});

test('sign up, see real order history state, log out, log back in', async ({ page }, testInfo) => {
  const email = uniqueEmail();

  await page.getByTestId('auth-mode-toggle').click();
  await snap(page, testInfo, '01-signup-form');
  await page.getByTestId('first-name-input').fill('Grace');
  await page.getByTestId('last-name-input').fill('Hopper');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill('TestPass123!');
  await snap(page, testInfo, '02-signup-form-filled');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('customer-name')).toHaveText('Grace Hopper', { timeout: 15000 });
  await expect(page.getByTestId('customer-email')).toHaveText(email);
  // A brand-new customer has no orders (guest checkout doesn't retroactively
  // associate past orders with a later-created account — see
  // docs/sessions/012-checkout-and-auth-for-new-storefront.md).
  await expect(page.getByTestId('no-orders-message')).toBeVisible();
  await snap(page, testInfo, '03-signed-up-profile');

  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('email-input')).toBeVisible();
  await snap(page, testInfo, '04-logged-out');

  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill('TestPass123!');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('customer-name')).toHaveText('Grace Hopper', { timeout: 15000 });
  await snap(page, testInfo, '05-logged-back-in');
});

test('logging in with the wrong password shows an inline error, not a silent failure', async ({ page }, testInfo) => {
  await page.getByTestId('email-input').fill(uniqueEmail());
  await page.getByTestId('password-input').fill('definitely-wrong');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('auth-error')).toBeVisible({ timeout: 15000 });
  // Still on the logged-out form, not silently treated as a success.
  await expect(page.getByTestId('email-input')).toBeVisible();
  await snap(page, testInfo, '01-wrong-password-error');
});
