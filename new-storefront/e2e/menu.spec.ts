import { test, expect, type Page } from '@playwright/test';
import { snap } from './utils/screenshot';

// Requires a running Medusa backend with the coffee catalog seeded (see
// checkout.spec.ts's header comment for the same caveat — no per-test DB
// reset in this suite). Covers new-storefront-high-severity-ux-fixes
// Findings 1 (silent quick-add failure), 2 (real customer greeting), and the
// Finding-4 aria-label fixes that live on MenuScreen/ChatScreen.

function uniquePhone(): string {
  return `+849${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
}

function uniqueEmail(): string {
  return `menu-e2e+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

const BACKEND_URL = 'http://localhost:9000';

function publishableKey(): string {
  return 'pk_f25a31c7d8e29806aea7f0f3a586d7037a3fb3c64d40c2b53f05535852687572';
}

/** Deliberate, scoped exception to this suite's "real backend, no mocking"
 * convention (see 00-spec.md) — only used to make a rejected quick-add
 * network call reproducible on demand. Every other assertion in this file
 * runs against the real backend. */
async function failNextLineItemCreate(page: Page) {
  await page.route('**/store/carts/*/line-items', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Simulated network failure' }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * The seeded coffee catalog has exactly one drink in most categories (see
 * backend/src/scripts/seed-coffee.ts) — "Popular today" (and therefore
 * `quick-add-button`) only renders when the selected category has 2+ drinks.
 * "Espresso" (Iced Cortado + Brown Sugar Oat Latte) is currently the only
 * such category; falls back to trying every known category chip so this
 * isn't hard-coupled to that if the seed changes.
 */
async function selectCategoryWithPopularRow(page: Page) {
  for (const category of ['Espresso', 'Cold', 'Matcha']) {
    const chip = page.getByRole('button', { name: category, exact: true });
    if ((await chip.count()) === 0) continue;
    await chip.click();
    if ((await page.getByTestId('quick-add-button').count()) > 0) return;
  }
}

async function signup(page: Page, firstName: string, lastName: string) {
  await page.getByTestId('tab-you').click();
  await page.getByTestId('auth-mode-toggle').click();
  await page.getByTestId('first-name-input').fill(firstName);
  await page.getByTestId('last-name-input').fill(lastName);
  await page.getByTestId('phone-input').fill(uniquePhone());
  await page.getByTestId('email-input').fill(uniqueEmail());
  await page.getByTestId('address-input').fill('123 Test St');
  await page.getByTestId('city-input').fill('Berlin');
  await page.getByTestId('password-input').fill('TestPass123!');
  await page.getByTestId('auth-submit-button').click();
  await expect(page.getByTestId('customer-name')).toHaveText(`${firstName} ${lastName}`, { timeout: 15000 });
}

/** Patches the just-signed-up customer directly via the real store API (not
 * mocked) so scenarios 7/8's phone/email fallback can be exercised without a
 * UI path that omits first/last name (the signup form requires them). */
async function patchCustomer(page: Page, patch: Record<string, unknown>) {
  const token = await page.evaluate(() => localStorage.getItem('medusa_auth_token'));
  const res = await page.request.post(`${BACKEND_URL}/store/customers/me`, {
    headers: {
      'x-publishable-api-key': publishableKey(),
      Authorization: `Bearer ${token}`,
    },
    data: patch,
  });
  expect(res.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=Order ahead');
});

test.describe('Finding 1 — silent quick-add failure', () => {
  test('featured quick-add: a rejected network call shows an inline error, not a false-positive checkmark', async ({ page }, testInfo) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await failNextLineItemCreate(page);

    const button = page.getByTestId('featured-quick-add-button');
    await button.click();

    await expect(page.getByTestId('quick-add-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('quick-add-error')).toHaveText("Couldn't add to bag: Simulated network failure");
    await expect(page.getByTestId('quick-add-error')).toHaveAttribute('role', 'alert');
    await snap(page, testInfo, '01-featured-quick-add-error');

    // No false-positive checkmark, and the icon stays "Plus".
    await expect(button.locator('svg.lucide-check')).toHaveCount(0);
    await expect(button.locator('svg.lucide-plus')).toHaveCount(1);

    // Bag count never incremented.
    await expect(page.getByTestId('bag-count-badge')).toHaveCount(0);

    // No unhandled promise rejection / uncaught error escaped the catch.
    expect(pageErrors).toHaveLength(0);
  });

  test('popular-row quick-add: a rejected network call shows an inline error, not a false-positive checkmark', async ({ page }, testInfo) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await selectCategoryWithPopularRow(page);
    await failNextLineItemCreate(page);

    const button = page.getByTestId('quick-add-button').first();
    await button.click();

    await expect(page.getByTestId('quick-add-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('quick-add-error')).toHaveText("Couldn't add to bag: Simulated network failure");
    await snap(page, testInfo, '01-popular-quick-add-error');

    await expect(button.locator('svg.lucide-check')).toHaveCount(0);
    await expect(button.locator('svg.lucide-plus')).toHaveCount(1);
    await expect(page.getByTestId('bag-count-badge')).toHaveCount(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('featured quick-add: a successful call still shows the checkmark and updates the bag (regression)', async ({ page }, testInfo) => {
    const button = page.getByTestId('featured-quick-add-button');
    await button.click();

    await expect(button.locator('svg.lucide-check')).toHaveCount(1, { timeout: 10000 });
    await snap(page, testInfo, '01-featured-quick-add-success');

    await expect(page.getByTestId('quick-add-error')).toHaveCount(0);
    await page.getByTestId('tab-bag').click();
    await expect(page.getByTestId('cart-item')).toHaveCount(1, { timeout: 15000 });
  });

  test('ChatScreen: a rejected quick-add call from the recommendation card is surfaced, not silently swallowed', async ({ page }, testInfo) => {
    await page.getByTestId('tab-chat').click();
    await snap(page, testInfo, '01-chat-before-add');

    await failNextLineItemCreate(page);

    await page.getByRole('button', { name: 'Add to bag' }).first().click();

    await expect(page.getByTestId('chat-quick-add-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('chat-quick-add-error')).toHaveText("Couldn't add to bag: Simulated network failure");
    await snap(page, testInfo, '02-chat-quick-add-error');

    // Must not have navigated to the Bag tab on failure.
    await expect(page.getByTestId('bag-count-badge')).toHaveCount(0);
  });
});

test.describe('Finding 2 — real customer greeting on MenuScreen', () => {
  test('guest sees a bare "GOOD MORNING" greeting, never a specific name', async ({ page }, testInfo) => {
    const greeting = page.getByTestId('menu-greeting');
    await expect(greeting).toHaveText('GOOD MORNING');
    await expect(greeting).not.toContainText('Alex');
    await snap(page, testInfo, '01-guest-greeting');
  });

  test('logged-in customer with a first_name sees their own real name, never "Alex"', async ({ page }, testInfo) => {
    await signup(page, 'Ada', 'Lovelace');
    await page.getByTestId('tab-menu').click();

    await expect(page.getByTestId('menu-greeting')).toHaveText('GOOD MORNING, ADA');
    await snap(page, testInfo, '01-logged-in-greeting');
  });

  test('logged-in customer with no first_name falls back to phone', async ({ page }) => {
    const phone = uniquePhone();
    await page.getByTestId('tab-you').click();
    await page.getByTestId('auth-mode-toggle').click();
    await page.getByTestId('first-name-input').fill('Temp');
    await page.getByTestId('last-name-input').fill('Name');
    await page.getByTestId('phone-input').fill(phone);
    await page.getByTestId('email-input').fill(uniqueEmail());
    await page.getByTestId('address-input').fill('123 Test St');
    await page.getByTestId('city-input').fill('Berlin');
    await page.getByTestId('password-input').fill('TestPass123!');
    await page.getByTestId('auth-submit-button').click();
    await expect(page.getByTestId('customer-name')).toHaveText('Temp Name', { timeout: 15000 });

    await patchCustomer(page, { first_name: null, last_name: null, phone });

    await page.reload();
    await page.waitForSelector('text=Order ahead');
    await expect(page.getByTestId('menu-greeting')).toHaveText(`GOOD MORNING, ${phone.toUpperCase()}`);
  });

  test('logged-in customer with no first_name/phone falls back to email', async ({ page }) => {
    const phone = uniquePhone();
    const email = uniqueEmail();
    await page.getByTestId('tab-you').click();
    await page.getByTestId('auth-mode-toggle').click();
    await page.getByTestId('first-name-input').fill('Temp');
    await page.getByTestId('last-name-input').fill('Name');
    await page.getByTestId('phone-input').fill(phone);
    await page.getByTestId('email-input').fill(email);
    await page.getByTestId('address-input').fill('123 Test St');
    await page.getByTestId('city-input').fill('Berlin');
    await page.getByTestId('password-input').fill('TestPass123!');
    await page.getByTestId('auth-submit-button').click();
    await expect(page.getByTestId('customer-name')).toHaveText('Temp Name', { timeout: 15000 });

    await patchCustomer(page, { first_name: null, last_name: null, phone: null });

    await page.reload();
    await page.waitForSelector('text=Order ahead');
    await expect(page.getByTestId('menu-greeting')).toHaveText(`GOOD MORNING, ${email.toUpperCase()}`);
  });

  test('two different logged-in customers see two different greetings (not a shared static constant)', async ({ page }) => {
    await signup(page, 'Grace', 'Hopper');
    await page.getByTestId('tab-menu').click();
    await expect(page.getByTestId('menu-greeting')).toHaveText('GOOD MORNING, GRACE');

    await page.getByTestId('tab-you').click();
    await page.getByTestId('logout-button').click();

    await signup(page, 'Rosalind', 'Franklin');
    await page.getByTestId('tab-menu').click();
    await expect(page.getByTestId('menu-greeting')).toHaveText('GOOD MORNING, ROSALIND');
  });
});

test.describe('Finding 4 — accessible names on icon-only controls (Menu + Chat)', () => {
  test('bell icon button has a "Notifications" aria-label', async ({ page }) => {
    await expect(page.getByRole('button', { name: /notification/i })).toBeVisible();
  });

  test('featured quick-add control has a drink-specific "add to bag" aria-label', async ({ page }) => {
    const control = page.getByTestId('featured-quick-add-button');
    const label = await control.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label).toMatch(/^Add .+ to bag$/);
  });

  test('popular-row quick-add buttons have distinct, drink-specific aria-labels', async ({ page }) => {
    await selectCategoryWithPopularRow(page);
    const buttons = page.getByTestId('quick-add-button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    const labels = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    for (const label of labels) {
      expect(label).toMatch(/^Add .+ to bag$/);
    }
    if (labels.length > 1) {
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  test('ChatScreen BubbleChat back button has an aria-label, not just a title', async ({ page }) => {
    await page.getByTestId('tab-chat').click();
    // Asserts the aria-label attribute itself, not just the role query (a
    // browser's accessible-name computation can already fall back to
    // `title` when no aria-label is present, which would make a bare
    // getByRole(...) query pass even before this fix).
    await expect(page.getByRole('button', { name: 'Back' })).toHaveAttribute('aria-label', 'Back');
  });

  test('ChatScreen VoiceChat close/history/sparkles buttons have aria-labels', async ({ page }) => {
    await page.getByTestId('tab-chat').click();
    // BubbleChat's "Switch to voice" button (title only, not in scope to relabel).
    await page.getByTitle('Switch to voice').click();

    await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-label', 'Close');
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suggestions' })).toBeVisible();
  });
});
