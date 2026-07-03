import { test, expect, Page } from "@playwright/test"
import { seedDiscount, seedTax } from "../../data/seed"

// Discount / promo-code flow against a live deployed environment (e.g. Railway -
// see docs/railway.md). Run via the "chromium railway" Playwright project:
//   NEXT_PUBLIC_BASE_URL=<deployed storefront URL> \
//   CLIENT_SERVER=<deployed backend URL> \
//   MEDUSA_ADMIN_EMAIL=<admin email> MEDUSA_ADMIN_PASSWORD=<admin password> \
//   npm run test-e2e:railway -- e2e/tests/public/discount-railway.spec.ts
//
// Deliberately does NOT import `test`/`expect` from "../../index" like the other
// specs in this suite - that pulls in e2e/fixtures/index.ts's `resetDatabaseFixture`,
// an `auto: true` fixture that unconditionally runs raw SQL RENAME/DROP DATABASE
// commands (e2e/data/reset.ts) against whatever Postgres PGHOST/PGDATABASE resolve
// to before every single test. That's fine for the local docker-compose e2e harness,
// but this spec targets a real deployed backend and Postgres, so it drives the UI
// with plain Playwright locators/testids instead - same pattern as
// register-railway.spec.ts and checkout-railway.spec.ts.
//
// `seedDiscount` (from e2e/data/seed.ts) IS reused here, unlike the other
// *-railway specs need any admin-side setup - it's independent of
// fixtures/index.ts's reset fixture, only needs an Admin API session
// (`CLIENT_SERVER` + `MEDUSA_ADMIN_EMAIL`/`MEDUSA_ADMIN_PASSWORD` env vars
// pointed at the live deployment's backend) and is already idempotent (deletes
// any leftover promotion with the same code before creating a fresh one), so
// it's safe to call against a persistent deployment DB on every run. Get the
// admin credentials for this deployment via
// `railway variables --service backend --kv` - do not hardcode them here.
//
// Also unlike discount.spec.ts (written for medusa-starter-default's seed, which
// has a us/usd region and a "FakeEx Standard" shipping option), this repo's seed
// script (backend/src/scripts/seed.ts) only provisions a Europe/eur region with
// countries gb/de/dk/se/fr/es/it and shipping options "Standard Shipping"/
// "Express Shipping" - see checkout-railway.spec.ts for the same adjustment.
//
// This spec creates a real order in the target deployment's Postgres database
// each run (guest checkout with a discount applied, no cleanup) - same caveat
// as checkout-railway.spec.ts.
// The mini-cart dropdown (opened by hovering "nav-cart-link" when adding a
// product) is sticky/z-indexed above the page and does not auto-dismiss on
// navigation to the full cart page - it stays open and intercepts clicks on
// anything underneath it (e.g. "add-discount-button", which sits near the top
// of the order summary). e2e/fixtures/base/cart-dropdown.ts's `close()` works
// around this the same way: move the mouse across the dropdown's bounding box
// and then away from it, which drops its hover state.
async function closeNavCartDropdown(page: Page) {
  const dropdown = page.getByTestId("nav-cart-dropdown")
  if (await dropdown.isVisible()) {
    const box = await dropdown.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4)
      await page.mouse.move(5, 10)
    }
  }
}

test.describe("Discount flow (Railway deployment, EU region)", () => {
  let discount = { id: "", code: "", rule_id: "", amount: 0 }

  test.beforeAll(async () => {
    discount = await seedDiscount()
  })

  test("Guest can apply a discount code in the cart and it stays applied through checkout", async ({
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

    await test.step("Go to the cart", async () => {
      await page
        .getByTestId("nav-cart-dropdown")
        .getByTestId("go-to-cart-button")
        .click()
      await page.getByTestId("cart-container").waitFor({ state: "visible" })
      await closeNavCartDropdown(page)
    })

    const cart = page.getByTestId("cart-container")
    let cartSubtotal = 0

    await test.step("Read the cart subtotal before applying the discount", async () => {
      cartSubtotal = Number(
        (await cart.getByTestId("cart-total").getAttribute("data-value")) ||
          ""
      )
    })

    await test.step("Apply the discount code and verify the cart total drops", async () => {
      await cart.getByTestId("add-discount-button").click()
      const discountInput = cart.getByTestId("discount-input")
      await expect(discountInput).toBeVisible()
      await discountInput.fill(discount.code)
      await cart.getByTestId("discount-apply-button").click()

      const discountRow = cart.getByTestId("discount-row")
      await expect(discountRow).toBeVisible()
      await expect(discountRow.getByTestId("discount-code")).toHaveText(
        discount.code
      )
      expect(
        await discountRow.getByTestId("discount-amount").getAttribute("data-value")
      ).toBe(discount.amount.toString())
      expect(
        await cart.getByTestId("cart-total").getAttribute("data-value")
      ).toBe((cartSubtotal - discount.amount).toString())
    })

    await test.step("Proceed to checkout", async () => {
      await cart.getByTestId("checkout-button").click()
      await page.getByTestId("checkout-container").waitFor({ state: "visible" })
    })

    const checkout = page.getByTestId("checkout-container")

    await test.step("Verify the discount is still applied on the checkout page", async () => {
      const discountRow = checkout.getByTestId("discount-row")
      await expect(discountRow).toBeVisible()
      await expect(discountRow.getByTestId("discount-code")).toHaveText(
        discount.code
      )
      expect(
        await checkout.getByTestId("cart-total").getAttribute("data-value")
      ).toBe((cartSubtotal - discount.amount).toString())
    })

    let shippingTotal = 0

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

      await checkout
        .getByTestId("shipping-email-input")
        .fill("dtduc1991@gmail.com")
      await checkout.getByTestId("shipping-phone-input").fill("2071234567")
      await checkout.getByTestId("submit-address-button").click()
    })

    await test.step("Select delivery, then submit payment and order", async () => {
      await checkout
        .getByTestId("delivery-option-radio")
        .filter({ hasText: "Standard Shipping" })
        .click()
      await checkout.getByTestId("submit-delivery-option-button").click()
      shippingTotal = Number(
        (await checkout.getByTestId("cart-shipping").getAttribute("data-value")) ||
          "0"
      )
      // Only one payment provider is seeded (pp_system_default, shown as "Manual
      // Payment" per storefront/src/lib/constants.tsx's paymentInfoMap) - it must
      // be selected before "submit-payment-button" becomes enabled.
      await checkout.getByText("Manual Payment").click()
      await checkout.getByTestId("submit-payment-button").click()
      await checkout.getByTestId("submit-order-button").click()
      await page
        .getByTestId("order-complete-container")
        .waitFor({ state: "visible" })
    })

    const order = page.getByTestId("order-complete-container")
    const cartTotal = cartSubtotal + shippingTotal

    await test.step("Verify the order total reflects the discount", async () => {
      expect(await order.getByTestId("cart-total").getAttribute("data-value")).toBe(
        (cartTotal - discount.amount).toString()
      )
      // order.subtotal (items + shipping, per Medusa's own field docs) is NOT
      // what's rendered here anymore - cart-totals/index.tsx was fixed to use
      // order.item_subtotal (items only) so the "Subtotal (excl. shipping and
      // taxes)" label is actually true. Expect the items-only figure, which
      // matches cartSubtotal (captured before a delivery option was selected).
      expect(
        await order.getByTestId("cart-subtotal").getAttribute("data-value")
      ).toBe(cartSubtotal.toString())
      expect(
        await order.getByTestId("cart-discount").getAttribute("data-value")
      ).toBe(discount.amount.toString())
    })
  })

  test("Fake discount code shows an error on the cart page", async ({
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

    await test.step("Select size M, add to cart, and go to the cart", async () => {
      await page.mouse.move(0, 0)
      await page
        .getByTestId("product-options")
        .getByTestId("option-button")
        .filter({ hasText: "M" })
        .click({ clickCount: 2 })
      await page.getByTestId("add-product-button").click()
      await page.getByTestId("nav-cart-dropdown").waitFor({ state: "visible" })
      await page
        .getByTestId("nav-cart-dropdown")
        .getByTestId("go-to-cart-button")
        .click()
      await page.getByTestId("cart-container").waitFor({ state: "visible" })
      await closeNavCartDropdown(page)
    })

    const cart = page.getByTestId("cart-container")

    await test.step("Enter a discount code that doesn't exist", async () => {
      await cart.getByTestId("add-discount-button").click()
      const discountInput = cart.getByTestId("discount-input")
      await expect(discountInput).toBeVisible()
      await discountInput.fill("__FAKE_DISCOUNT_RAILWAY_DNE_1111111")
      await cart.getByTestId("discount-apply-button").click()
      await expect(cart.getByTestId("discount-error-message")).toBeVisible()
    })
  })

  // Seeds a real tax rate (see seedTax's comment - this deployment's seed
  // script provisions tax regions but never attaches a rate, so tax_total is
  // 0 on every order otherwise). Deliberately the last test in this file:
  // seedTax mutates the live "gb" tax region for the whole deployment (not
  // scoped to this test/order), so running it earlier would silently break
  // the cartTotal/cartSubtotal math in the tests above, which assume 0 tax.
  test("Order subtotal excludes both shipping and taxes once a real tax rate is configured", async ({
    page,
  }) => {
    const tax = await seedTax()

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

    await test.step("Select size M, add to cart, and go to the cart", async () => {
      await page.mouse.move(0, 0)
      await page
        .getByTestId("product-options")
        .getByTestId("option-button")
        .filter({ hasText: "M" })
        .click({ clickCount: 2 })
      await page.getByTestId("add-product-button").click()
      await page.getByTestId("nav-cart-dropdown").waitFor({ state: "visible" })
      await page
        .getByTestId("nav-cart-dropdown")
        .getByTestId("go-to-cart-button")
        .click()
      await page.getByTestId("cart-container").waitFor({ state: "visible" })
      await closeNavCartDropdown(page)
    })

    const cart = page.getByTestId("cart-container")
    let itemSubtotal = 0

    await test.step("Read the item subtotal before an address/tax is known", async () => {
      // No shipping method and no address yet, so item_subtotal, subtotal,
      // and total should all agree at this point - nothing to exclude yet.
      itemSubtotal = Number(
        (await cart.getByTestId("cart-subtotal").getAttribute("data-value")) ||
          ""
      )
    })

    await test.step("Proceed to checkout", async () => {
      await cart.getByTestId("checkout-button").click()
      await page.getByTestId("checkout-container").waitFor({ state: "visible" })
    })

    const checkout = page.getByTestId("checkout-container")

    await test.step("Fill in the shipping address (UK, matches the tax rate seeded above)", async () => {
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

      await checkout
        .getByTestId("shipping-email-input")
        .fill("dtduc1991@gmail.com")
      await checkout.getByTestId("shipping-phone-input").fill("2071234567")
      await checkout.getByTestId("submit-address-button").click()
    })

    let shippingTotal = 0

    await test.step("Select delivery, then submit payment and order", async () => {
      await checkout
        .getByTestId("delivery-option-radio")
        .filter({ hasText: "Standard Shipping" })
        .click()
      await checkout.getByTestId("submit-delivery-option-button").click()
      shippingTotal = Number(
        (await checkout.getByTestId("cart-shipping").getAttribute("data-value")) ||
          "0"
      )
      await checkout.getByText("Manual Payment").click()
      await checkout.getByTestId("submit-payment-button").click()
      await checkout.getByTestId("submit-order-button").click()
      await page
        .getByTestId("order-complete-container")
        .waitFor({ state: "visible" })
    })

    const order = page.getByTestId("order-complete-container")

    await test.step("Verify the order's tax is non-zero and the subtotal display excludes both shipping and tax", async () => {
      const taxTotal = Number(
        (await order.getByTestId("cart-taxes").getAttribute("data-value")) ||
          "0"
      )
      // Sanity check that this test is actually exercising a non-zero tax -
      // otherwise the assertions below would trivially pass even with the
      // pre-fix code (subtotal only visibly differs from item_subtotal once
      // shipping or tax is non-zero).
      expect(taxTotal).toBeGreaterThan(0)
      expect(taxTotal).toBe(
        Math.round(((itemSubtotal + shippingTotal) * tax.rate) / 100)
      )

      expect(
        await order.getByTestId("cart-shipping").getAttribute("data-value")
      ).toBe(shippingTotal.toString())
      // The fix under test: cart-subtotal must equal the items-only figure,
      // not item_subtotal + shipping_total + tax_total.
      expect(
        await order.getByTestId("cart-subtotal").getAttribute("data-value")
      ).toBe(itemSubtotal.toString())
      expect(
        await order.getByTestId("cart-total").getAttribute("data-value")
      ).toBe((itemSubtotal + shippingTotal + taxTotal).toString())
    })
  })
})
