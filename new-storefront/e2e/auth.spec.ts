import { test, expect } from '@playwright/test';
import { snap } from './utils/screenshot';

// Requires a running Medusa backend (see new-storefront/.env.local /
// .env.local.template). Each test signs up its own unique customer (phone
// keyed on Date.now() + a random suffix, since phone is the real registered
// identifier — see auth.ts's signup()) rather than relying on seeded fixture
// accounts, since there's no per-test DB reset in this suite.

function uniqueEmail(): string {
  return `ember-e2e+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

function uniquePhone(): string {
  return `+849${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
  await page.getByTestId('tab-you').click();
});

test('You tab shows a login/signup form when logged out', async ({ page }, testInfo) => {
  await expect(page.getByTestId('account-container')).toBeVisible();
  await expect(page.getByTestId('identifier-input')).toBeVisible();
  await expect(page.getByTestId('password-input')).toBeVisible();
  await expect(page.getByTestId('auth-submit-button')).toContainText('Log in');
  await snap(page, testInfo, '01-logged-out-form');
});

test('sign up with phone + address, see real order history state, log out, log back in with phone', async ({ page }, testInfo) => {
  const phone = uniquePhone();

  await snap(page, testInfo, '01-logged-out-form');
  await page.getByTestId('auth-mode-toggle').click();
  await snap(page, testInfo, '02-signup-form');
  await page.getByTestId('first-name-input').fill('Grace');
  await page.getByTestId('last-name-input').fill('Hopper');
  await page.getByTestId('phone-input').fill(phone);
  await page.getByTestId('email-input').fill(uniqueEmail());
  await page.getByTestId('address-input').fill('1 Analytical Engine Rd');
  await page.getByTestId('city-input').fill('Hanoi');
  await page.getByTestId('password-input').fill('TestPass123!');
  await snap(page, testInfo, '03-signup-form-filled');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('customer-name')).toHaveText('Grace Hopper', { timeout: 15000 });
  await expect(page.getByTestId('customer-phone')).toHaveText(phone);
  // A brand-new customer has no orders (guest checkout doesn't retroactively
  // associate past orders with a later-created account — see
  // docs/sessions/012-checkout-and-auth-for-new-storefront.md).
  await expect(page.getByTestId('no-orders-message')).toBeVisible();
  await snap(page, testInfo, '04-signed-up-profile');

  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('identifier-input')).toBeVisible();
  await snap(page, testInfo, '05-logged-out');

  await page.getByTestId('identifier-input').fill(phone);
  await page.getByTestId('password-input').fill('TestPass123!');
  await snap(page, testInfo, '06-login-form-filled');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('customer-name')).toHaveText('Grace Hopper', { timeout: 15000 });
  await snap(page, testInfo, '07-logged-back-in');
});

test('a customer can log in with their email instead of their phone', async ({ page }, testInfo) => {
  const phone = uniquePhone();
  const email = uniqueEmail();

  await snap(page, testInfo, '01-logged-out-form');
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill('Ada');
  await page.getByTestId('last-name-input').fill('Lovelace');
  await page.getByTestId('phone-input').fill(phone);
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('address-input').fill('12 Babbage St');
  await page.getByTestId('city-input').fill('Ho Chi Minh City');
  await page.getByTestId('password-input').fill('TestPass123!');
  await snap(page, testInfo, '02-signup-form-filled');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Ada Lovelace', { timeout: 15000 });
  await snap(page, testInfo, '03-signed-up-profile');

  await page.getByTestId('logout-button').click();
  await page.getByTestId('identifier-input').fill(email);
  await page.getByTestId('password-input').fill('TestPass123!');
  await snap(page, testInfo, '04-login-with-email-form-filled');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('customer-name')).toHaveText('Ada Lovelace', { timeout: 15000 });
  await snap(page, testInfo, '05-logged-in-with-email');
});

test('a customer can log in with their phone number', async ({ page }, testInfo) => {
  const phone = uniquePhone();
  const email = uniqueEmail();

  await snap(page, testInfo, '01-logged-out-form');
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill('Katherine');
  await page.getByTestId('last-name-input').fill('Johnson');
  await page.getByTestId('phone-input').fill(phone);
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('address-input').fill('1 Hidden Figures Way');
  await page.getByTestId('city-input').fill('Hampton');
  await page.getByTestId('password-input').fill('TestPass123!');
  await snap(page, testInfo, '02-signup-form-filled');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Katherine Johnson', { timeout: 15000 });
  await snap(page, testInfo, '03-signed-up-profile');

  await page.getByTestId('logout-button').click();
  await page.getByTestId('identifier-input').fill(phone);
  await page.getByTestId('password-input').fill('TestPass123!');
  await snap(page, testInfo, '04-login-with-phone-form-filled');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('customer-name')).toHaveText('Katherine Johnson', { timeout: 15000 });
  await snap(page, testInfo, '05-logged-in-with-phone');
});

test('signing up with an already-registered phone number shows a friendly error', async ({ page }, testInfo) => {
  const phone = uniquePhone();
  const signupFields = async () => {
    await page.getByTestId('first-name-input').fill('Grace');
    await page.getByTestId('last-name-input').fill('Hopper');
    await page.getByTestId('phone-input').fill(phone);
    await page.getByTestId('email-input').fill(uniqueEmail());
    await page.getByTestId('address-input').fill('1 Analytical Engine Rd');
    await page.getByTestId('city-input').fill('Hanoi');
    await page.getByTestId('password-input').fill('TestPass123!');
  };

  await snap(page, testInfo, '01-logged-out-form');
  await page.getByTestId('auth-mode-toggle').click();
  await signupFields();
  await snap(page, testInfo, '02-first-signup-form-filled');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Grace Hopper', { timeout: 15000 });
  await snap(page, testInfo, '03-first-signup-succeeded');

  await page.getByTestId('logout-button').click();
  await snap(page, testInfo, '04-logged-out');
  await page.getByTestId('auth-mode-toggle').click();
  await signupFields();
  await snap(page, testInfo, '05-duplicate-signup-form-filled');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('auth-error')).toHaveText('This phone number is already registered.', { timeout: 15000 });
  await snap(page, testInfo, '06-duplicate-phone-error');
});

test('logging in with the wrong password shows an inline error, not a silent failure', async ({ page }, testInfo) => {
  await page.getByTestId('identifier-input').fill(uniquePhone());
  await page.getByTestId('password-input').fill('definitely-wrong');
  await snap(page, testInfo, '01-wrong-password-form-filled');
  await page.getByTestId('auth-submit-button').click();

  await expect(page.getByTestId('auth-error')).toBeVisible({ timeout: 15000 });
  // Still on the logged-out form, not silently treated as a success.
  await expect(page.getByTestId('identifier-input')).toBeVisible();
  await snap(page, testInfo, '02-wrong-password-error');
});
