import { test, expect } from "@playwright/test"

// Customer registration flow against a live deployed environment (e.g. Railway -
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
// checkout-railway.spec.ts and docs/sessions/005-checkout-e2e-against-railway-deploy.md
// for the full rationale.
//
// Unlike register.spec.ts (which reuses fixed emails like "test-reg@example.com" -
// safe there because the DB is reset before every test), this spec generates a
// unique email per run: the target deployment's Postgres persists across runs, so a
// fixed email would only succeed once and then fail every subsequent run with
// "customer already exists".
//
// This spec creates a real customer account in the target deployment's Postgres
// database each run (no cleanup) - harmless for a demo/smoke-test deployment, but
// worth knowing before running it repeatedly or in any CI loop against a real
// customer-facing environment.
test.describe("Customer registration (Railway deployment)", () => {
  test("Guest can register a new account and lands on account overview", async ({
    page,
  }) => {
    const email = `test-reg-railway-${Date.now()}@example.com`

    await test.step("Navigate to the account page", async () => {
      await page.goto("/")
      await page.getByTestId("nav-account-link").click()
      await page.getByTestId("login-page").waitFor({ state: "visible" })
    })

    const loginPage = page.getByTestId("login-page")

    await test.step("Switch to the registration form", async () => {
      await loginPage.getByTestId("register-button").click()
      await page.getByTestId("register-page").waitFor({ state: "visible" })
    })

    const registerPage = page.getByTestId("register-page")

    await test.step("Fill in registration details and submit", async () => {
      await registerPage.getByTestId("first-name-input").fill("First")
      await registerPage.getByTestId("last-name-input").fill("Last")
      await registerPage.getByTestId("email-input").fill(email)
      await registerPage.getByTestId("password-input").fill("password")
      await registerPage.getByTestId("register-button").click()
    })

    await test.step("Verify account overview shows the new customer", async () => {
      await page
        .getByTestId("overview-page-wrapper")
        .waitFor({ state: "visible" })
      await expect(page.getByTestId("welcome-message")).toBeVisible()
      await expect(page.getByTestId("customer-email")).toContainText(email)
    })
  })
})
