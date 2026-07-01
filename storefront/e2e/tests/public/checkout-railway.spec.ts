import { test, expect } from "@playwright/test"

// Guest checkout flow against a live deployed environment (e.g. Railway - see
// docs/railway.md). Run via the "chromium railway" Playwright project:
//   NEXT_PUBLIC_BASE_URL=<deployed storefront URL> npm run test-e2e:railway
//
// Deliberately does NOT import `test`/`expect` from "../../index" like the other
// specs in this suite - that pulls in e2e/fixtures/index.ts's `resetDatabaseFixture`,
// an `auto: true` fixture that unconditionally runs raw SQL RENAME/DROP DATABASE
// commands (e2e/data/reset.ts) against whatever Postgres PGHOST/PGDATABASE resolve
// to before every single test. That's fine for the local docker-compose e2e harness
// (which owns a disposable "test_medusa_db"), but this spec targets a real deployed
// backend and Postgres, so it uses plain Playwright locators instead. The
// "chromium railway" project in playwright.config.ts also has no
// dependencies/teardown, so it never triggers the "public setup"/"cleanup test
// database" projects that the rest of the public/*.spec.ts files depend on.
//
// Also unlike checkout.spec.ts (written for medusa-starter-default's seed, which has
// a us/usd region and a "FakeEx Standard" shipping option), this repo's seed script
// (backend/src/scripts/seed.ts) only provisions a Europe/eur region with countries
// gb/de/dk/se/fr/es/it and shipping options "Standard Shipping"/"Express Shipping" -
// selecting "United States" or "FakeEx Standard" here would fail with no matching option.
//
// This spec creates a real order in the target deployment's Postgres database each
// run (guest checkout, no cleanup) - harmless for a demo/smoke-test deployment, but
// worth knowing before running it repeatedly or in any CI loop against a real
// customer-facing environment.
test.describe("Checkout flow (Railway deployment, EU region)", () => {
  test("Guest can complete checkout with a UK shipping address", async ({
    page,
  }) => {
    await test.step("Navigate to the store page and open a product", async () => {
      await page.goto("/")
      await page.getByTestId("nav-menu-button").click()
      const navMenu = page.getByTestId("nav-menu-popup")
      await navMenu.waitFor({ state: "visible" })
      await navMenu.getByTestId("store-link").click()
      await page.getByTestId("store-page-title").waitFor({ state: "visible" })
      await page
        .getByTestId("products-list-loader")
        .waitFor({ state: "hidden" })

      const product = page
        .getByTestId("products-list")
        .getByTestId("product-wrapper")
        .filter({ hasText: "Sweatshirt" })
      await product.click()
      await page.getByTestId("product-container").waitFor({ state: "visible" })
    })

    await test.step("Select size M and add to cart", async () => {
      await page.mouse.move(0, 0) // hides the nav cart dropdown if it's covering the option
      await page
        .getByTestId("product-options")
        .getByTestId("option-button")
        .filter({ hasText: "M" })
        .click({ clickCount: 2 })
      await page.getByTestId("add-product-button").click()
      await page.getByTestId("nav-cart-dropdown").waitFor({ state: "visible" })
    })

    await test.step("Go to cart, then checkout", async () => {
      await page.getByTestId("nav-cart-dropdown").getByTestId("go-to-cart-button").click()
      await page.getByTestId("cart-container").waitFor({ state: "visible" })
      await page.getByTestId("checkout-button").click()
      await page.getByTestId("checkout-container").waitFor({ state: "visible" })
    })

    const checkout = page.getByTestId("checkout-container")

    await test.step("Fill in the shipping address (UK, matches this repo's seeded EU region)", async () => {
      await checkout.getByTestId("shipping-first-name-input").fill("First")
      await checkout.getByTestId("shipping-last-name-input").fill("Last")
      await checkout.getByTestId("shipping-company-input").fill("MyCorp")
      await checkout
        .getByTestId("shipping-address-input")
        .fill("10 Downing Street")
      await checkout.getByTestId("shipping-postal-code-input").fill("SW1A 2AA")
      await checkout.getByTestId("shipping-city-input").fill("London")
      await checkout.getByTestId("shipping-province-input").fill("London")
      await checkout
        .getByTestId("shipping-country-select")
        .selectOption("United Kingdom")

      await checkout.getByTestId("shipping-email-input").fill("dtduc1991@gmail.com")
      await checkout.getByTestId("shipping-phone-input").fill("2071234567")
      await checkout.getByTestId("billing-address-checkbox").uncheck()

      await checkout.getByTestId("billing-first-name-input").fill("First")
      await checkout.getByTestId("billing-last-name-input").fill("Last")
      await checkout.getByTestId("billing-company-input").fill("MyCorp")
      await checkout
        .getByTestId("billing-address-input")
        .fill("10 Downing Street")
      await checkout.getByTestId("billing-postal-input").fill("SW1A 2AA")
      await checkout.getByTestId("billing-city-input").fill("London")
      await checkout.getByTestId("billing-province-input").fill("London")
      await checkout
        .getByTestId("billing-country-select")
        .selectOption("United Kingdom")
      await checkout.getByTestId("submit-address-button").click()
    })

    await test.step("Select delivery, then submit payment and order", async () => {
      await checkout
        .getByTestId("delivery-option-radio")
        .filter({ hasText: "Standard Shipping" })
        .click()
      await checkout.getByTestId("submit-delivery-option-button").click()
      // Only one payment provider is seeded (pp_system_default, shown as "Manual
      // Payment" per storefront/src/lib/constants.tsx's paymentInfoMap) - it must be
      // selected before "submit-payment-button" becomes enabled.
      await checkout.getByText("Manual Payment").click()
      await checkout.getByTestId("submit-payment-button").click()
      await checkout.getByTestId("submit-order-button").click()
      await page
        .getByTestId("order-complete-container")
        .waitFor({ state: "visible" })
    })

    const order = page.getByTestId("order-complete-container")

    await test.step("Verify the ordered product is correct", async () => {
      const productRow = order
        .getByTestId("product-row")
        .filter({ hasText: "Sweatshirt" })
        .filter({ hasText: "Variant: M" })
      await expect(productRow.getByTestId("product-name")).toContainText(
        "Sweatshirt"
      )
      await expect(productRow.getByTestId("product-variant")).toContainText("M")
      await expect(productRow.getByTestId("product-quantity")).toContainText("1")
    })

    await test.step("Verify the shipping info is correct", async () => {
      const address = order.getByTestId("shipping-address-summary")
      await expect(address).toContainText("First")
      await expect(address).toContainText("Last")
      await expect(address).toContainText("10 Downing Street")
      await expect(address).toContainText("SW1A 2AA")
      await expect(address).toContainText("London")
      await expect(address).toContainText("GB")

      const contact = order.getByTestId("shipping-contact-summary")
      await expect(contact).toContainText("dtduc1991@gmail.com")
      await expect(contact).toContainText("2071234567")

      const method = order.getByTestId("shipping-method-summary")
      await expect(method).toContainText("Standard Shipping")
    })
  })
})
