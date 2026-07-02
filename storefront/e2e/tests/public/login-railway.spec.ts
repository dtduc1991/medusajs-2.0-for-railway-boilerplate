import { test, expect } from "@playwright/test"

// Customer login flow against a live deployed environment (e.g. Railway -
// see docs/railway.md). Run via the "chromium railway" Playwright project:
//   NEXT_PUBLIC_BASE_URL=<deployed storefront URL> npm run test-e2e:railway
//
// Deliberately does NOT import `test`/`expect` from "../../index" like the other
// specs in this suite - that pulls in e2e/fixtures/index.ts's `resetDatabaseFixture`,
// an `auto: true` fixture that unconditionally runs raw SQL RENAME/DROP DATABASE
// commands (e2e/data/reset.ts) against whatever Postgres PGHOST/PGDATABASE resolve
// to before every single test. That's fine for the local docker-compose e2e harness
// (which owns a disposable "test_medusa_db"), but this spec targets a real deployed
// backend and Postgres, so it uses plain Playwright locators instead. See
// register-railway.spec.ts, checkout-railway.spec.ts and
// docs/sessions/005-checkout-e2e-against-railway-deploy.md for the full rationale.
//
// Unlike login.spec.ts (which relies on the DB being reset and a fixture-seeded
// "test@example.com" account before every test), this spec logs into a fixed,
// pre-existing account created directly via the Store API against this specific
// deployment - see docs/sessions/008-register-e2e-against-railway-and-db-verification.md
// ("Stable test account created for a future login-railway.spec.ts"). This is a
// throwaway demo-deployment account, not a real customer.
const EMAIL = "e2e-login-railway@example.com"
const PASSWORD = "TestPassword123!"

test.describe("Customer login (Railway deployment)", () => {
  test("Registered customer can log in and see their account overview", async ({
    page,
  }) => {
    await test.step("Navigate to the account page", async () => {
      await page.goto("/")
      await page.getByTestId("nav-account-link").click()
      await page.getByTestId("login-page").waitFor({ state: "visible" })
    })

    const loginPage = page.getByTestId("login-page")

    await test.step("Fill in login details and submit", async () => {
      await loginPage.getByTestId("email-input").fill(EMAIL)
      await loginPage.getByTestId("password-input").fill(PASSWORD)
      await loginPage.getByTestId("sign-in-button").click()
    })

    await test.step("Verify account overview shows the logged-in customer", async () => {
      await page
        .getByTestId("overview-page-wrapper")
        .waitFor({ state: "visible" })
      await expect(page.getByTestId("welcome-message")).toBeVisible()
      await expect(page.getByTestId("customer-email")).toContainText(EMAIL)
    })
  })

  test("Incorrect password shows an error and does not log in", async ({
    page,
  }) => {
    await test.step("Navigate to the account page", async () => {
      await page.goto("/")
      await page.getByTestId("nav-account-link").click()
      await page.getByTestId("login-page").waitFor({ state: "visible" })
    })

    const loginPage = page.getByTestId("login-page")

    await test.step("Submit with wrong password", async () => {
      await loginPage.getByTestId("email-input").fill(EMAIL)
      await loginPage.getByTestId("password-input").fill("wrong-password")
      await loginPage.getByTestId("sign-in-button").click()
    })

    await test.step("Verify the login error message is shown", async () => {
      await expect(loginPage.getByTestId("login-error-message")).toBeVisible()
    })
  })
})
