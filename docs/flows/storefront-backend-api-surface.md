# Storefront → backend API surface

## Context

This doc is a reference map of every network call the storefront (`storefront/`) makes to the Medusa backend (`backend/`), plus the two adjacent services (Meilisearch, the build-time `/key-exchange` route) that are easy to mistake for backend calls but aren't part of the runtime store API. It's a sibling to the user-journey docs in this directory ([`cart-promotions-flow.md`](cart-promotions-flow.md), [`checkout-flow.md`](checkout-flow.md), [`browse-search-pdp-flow.md`](browse-search-pdp-flow.md)) — those describe *flows through UI*; this doc describes *the call surface itself*, indexed by data-layer module rather than by user journey. Read this first when adding a new server action, tracing an endpoint back to its caller, or auditing what the storefront depends on the backend for.

No application code was modified to produce this doc.

## Client setup

All storefront → backend calls except one go through a single SDK instance:

- [`storefront/src/lib/config.ts`](../../storefront/src/lib/config.ts) — constructs `sdk = new Medusa({...})` (`@medusajs/js-sdk`) with `baseUrl` from `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (defaults to `http://localhost:9000`) and `publishableKey` from `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`. Every `sdk.store.*` / `sdk.auth.*` call below uses this instance.
- The one exception is [`storefront/src/middleware.ts:22`](../../storefront/src/middleware.ts#L22) — a raw `fetch(`${BACKEND_URL}/store/regions`)`, because Next.js middleware runs on the Edge runtime and the SDK needs a Node environment (comment at `middleware.ts:21` explains this explicitly).

**Auth pattern** — [`storefront/src/lib/data/cookies.ts`](../../storefront/src/lib/data/cookies.ts): a JWT lives in the httpOnly `_medusa_jwt` cookie (7-day `maxAge`), the active cart id in `_medusa_cart_id` (7-day `maxAge`). `getAuthHeaders()` reads the JWT cookie and returns `{ authorization: "Bearer <token>" }` (or `{}` if absent); it's spread into the `headers` argument of nearly every SDK call below. `setAuthToken()`/`removeAuthToken()` write/clear the cookie on login/signup/logout. All three are `async` — a prior bug (un-awaited calls to these) is documented in `docs/sessions/004-fix-customer-auth-headers-and-rerun-e2e.md`; every call site below currently awaits correctly, but it's the pattern to double-check when adding new server actions here.

**Caching pattern**: read calls tag their Next.js fetch cache with `next: { tags: [...] }` (e.g. `["cart"]`, `["customer"]`, `["products"]`, `["regions"]`); mutations call `revalidateTag(...)` on success so every surface reading that tag (there's no shared client-side store — see `cart-promotions-flow.md` §Overview) picks up fresh data on next render.

All source paths below are relative to `storefront/src/`.

---

## Cart — `lib/data/cart.ts`

| Function | SDK call | Backend endpoint | Notes |
|---|---|---|---|
| `retrieveCart()` (`cart.ts:13-26`) | `sdk.store.cart.retrieve(cartId)` | `GET /store/carts/:id` | tag `["cart"]`; swallows fetch errors → `null` |
| `getOrSetCart()` (`cart.ts:28-54`) | `sdk.store.cart.create({region_id})`, then `sdk.store.cart.update` if region changed | `POST /store/carts`, `POST /store/carts/:id` | creates a cart scoped to the region resolved from `countryCode` if none exists |
| `updateCart()` (`cart.ts:56-69`) | `sdk.store.cart.update(cartId, data)` | `POST /store/carts/:id` | generic cart-update; also used for `promo_codes` (see `cart-promotions-flow.md` §5 for why this matters) and address submission |
| `addToCart()` (`cart.ts:71-103`) | `sdk.store.cart.createLineItem` | `POST /store/carts/:id/line-items` | calls `getOrSetCart()` first |
| `updateLineItem()` (`cart.ts:105-127`) | `sdk.store.cart.updateLineItem` | `POST /store/carts/:id/line-items/:line_id` | |
| `deleteLineItem()` (`cart.ts:129-146`) | `sdk.store.cart.deleteLineItem` | `DELETE /store/carts/:id/line-items/:line_id` | |
| `setShippingMethod()` (`cart.ts:195-213`) | `sdk.store.cart.addShippingMethod` | `POST /store/carts/:id/shipping-methods` | |
| `initiatePaymentSession()` (`cart.ts:215-229`) | `sdk.store.payment.initiatePaymentSession` | `POST /store/carts/:id/payment-sessions` | |
| `applyPromotions()` (`cart.ts:231-242`) | → `updateCart({promo_codes})` | `POST /store/carts/:id` | routes through the generic cart-update call, **not** the dedicated `POST/DELETE /store/carts/:id/promotions` endpoint — flagged as unverified/possibly-buggy in `cart-promotions-flow.md` §5/§10 |
| `setAddresses()` (`cart.ts:300-350`) | → `updateCart(data)` | `POST /store/carts/:id` | server action bound to the checkout address form; see `checkout-flow.md` §1 |
| `placeOrder()` (`cart.ts:352-374`) | `sdk.store.cart.complete` | `POST /store/carts/:id/complete` | on success (`type === "order"`), redirects to `/[countryCode]/order/confirmed/[id]` |
| `updateRegion()` (`cart.ts:381-398`) | → `updateCart({region_id})` | `POST /store/carts/:id` | |

**Dead code**: `applyGiftCard`, `removeDiscount`, `removeGiftCard` (`cart.ts:244-285`) are fully commented-out stubs with no call sites anywhere in `storefront/src` — see `cart-promotions-flow.md` §7/§10 for the full gift-card gap analysis. `submitPromotionForm` (`cart.ts:287-297`) is defined but not imported anywhere outside its own file.

## Payment — `lib/data/payment.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `listCartPaymentMethods()` (`payment.ts:5-15`) | `sdk.store.payment.listPaymentProviders({region_id})` | `GET /store/payment-providers` |

## Fulfillment — `lib/data/fulfillment.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `listCartShippingMethods()` (`fulfillment.ts:5-12`) | `sdk.store.fulfillment.listCartOptions({cart_id})` | `GET /store/shipping-options?cart_id=` |

## Customer / auth — `lib/data/customer.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `getCustomer()` (`customer.ts:11-16`) | `sdk.store.customer.retrieve()` | `GET /store/customers/me` |
| `updateCustomer()` (`customer.ts:18-28`) | `sdk.store.customer.update(body)` | `POST /store/customers/me` |
| `signup()` (`customer.ts:30-65`) | `sdk.auth.register("customer","emailpass",...)`, `sdk.store.customer.create(...)`, `sdk.auth.login(...)` | `POST /auth/customer/emailpass/register`, `POST /store/customers`, `POST /auth/customer/emailpass` | three sequential calls: register auth identity → create customer record → log in to get a session token |
| `login()` (`customer.ts:67-81`) | `sdk.auth.login("customer","emailpass",...)` | `POST /auth/customer/emailpass` | |
| `signout()` (`customer.ts:83-89`) | `sdk.auth.logout()` | (session/auth logout) | also clears the `_medusa_jwt` cookie locally |
| `addCustomerAddress()` (`customer.ts:91-117`) | `sdk.store.customer.createAddress` | `POST /store/customers/me/addresses` | |
| `deleteCustomerAddress()` (`customer.ts:119-131`) | `sdk.store.customer.deleteAddress` | `DELETE /store/customers/me/addresses/:address_id` | |
| `updateCustomerAddress()` (`customer.ts:133-161`) | `sdk.store.customer.updateAddress` | `POST /store/customers/me/addresses/:address_id` | |

## Orders — `lib/data/orders.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `retrieveOrder()` (`orders.ts:8-17`) | `sdk.store.order.retrieve(id, {fields: "*payment_collections.payments"})` | `GET /store/orders/:id` |
| `listOrders()` (`orders.ts:19-30`) | `sdk.store.order.list({limit, offset})` | `GET /store/orders` |

## Products — `lib/data/products.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `getProductsById()` (`products.ts:8-25`) | `sdk.store.product.list({id, region_id, fields})` | `GET /store/products` | used by `enrichLineItems()` in `cart.ts` |
| `getProductByHandle()` (`products.ts:27-41`) | `sdk.store.product.list({handle, region_id, fields})` | `GET /store/products` | PDP lookup |
| `getProductsList()` (`products.ts:43-90`) | `sdk.store.product.list({limit, offset, region_id, fields, ...queryParams})` | `GET /store/products` | paginated listing |
| `getProductsListWithSort()` (`products.ts:96-140`) | → `getProductsList()` internally | `GET /store/products` | fetches up to 100 products, sorts/paginates client-side (see `browse-search-pdp-flow.md` for caveats) |

## Regions — `lib/data/regions.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `listRegions()` (`regions.ts:6-11`) | `sdk.store.region.list()` | `GET /store/regions` |
| `retrieveRegion()` (`regions.ts:13-18`) | `sdk.store.region.retrieve(id)` | `GET /store/regions/:id` |
| `getRegion()` (`regions.ts:22-48`) | → `listRegions()`, memoized in a module-level `Map` | `GET /store/regions` | builds a country-code → region lookup, cached in-process |

## Categories — `lib/data/categories.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `listCategories()` (`categories.ts:4-8`) | `sdk.store.category.list({fields: "+category_children"})` | `GET /store/product-categories` |
| `getCategoriesList()` (`categories.ts:10-20`) | `sdk.store.category.list({limit, offset})` | `GET /store/product-categories` |
| `getCategoryByHandle()` (`categories.ts:22-32`) | `sdk.store.category.list({handle})` | `GET /store/product-categories` |

## Collections — `lib/data/collections.ts`

| Function | SDK call | Backend endpoint |
|---|---|---|
| `retrieveCollection()` (`collections.ts:6-10`) | `sdk.store.collection.retrieve(id)` | `GET /store/collections/:id` |
| `getCollectionsList()` (`collections.ts:12-19`) | `sdk.store.collection.list({limit, offset})` | `GET /store/collections` |
| `getCollectionByHandle()` (`collections.ts:21-27`) | `sdk.store.collection.list({handle})` | `GET /store/collections` |
| `getCollectionsWithProducts()` (`collections.ts:29-62`) | → `getCollectionsList()` + `getProductsList()` | `GET /store/collections`, `GET /store/products` | composite: fetches first 3 collections, then products filtered by those collection ids |

## Middleware — `middleware.ts`

| Call site | Call | Backend endpoint | Notes |
|---|---|---|---|
| `getRegionMap()` (`middleware.ts:14-47`) | raw `fetch` (Edge runtime, no SDK) | `GET /store/regions` | only place a backend call is made without the SDK; builds the country→region map used for locale-prefix redirects, cached in a module-level object for 1h (`regionMapUpdated`) |

---

## Not backend calls (easy to mistake for one)

- **Meilisearch** — [`storefront/src/lib/search-client.ts`](../../storefront/src/lib/search-client.ts) talks directly to a Meilisearch instance (`NEXT_PUBLIC_SEARCH_ENDPOINT`, default `http://127.0.0.1:7700`) via `instantMeiliSearch`. Product search queries **never hit the Medusa backend** — they hit Meilisearch's own index, which the backend's Meilisearch plugin keeps in sync out-of-band. If search results look stale/wrong, check the sync job on the backend side, not `lib/data/products.ts`.
- **`/key-exchange`** — a custom backend route (`backend/src/api/key-exchange`, per `CLAUDE.md`) that resolves the default "Webshop" publishable API key. It is fetched only at Railway build time (per `docs/railway.md` and the comment at `storefront/Dockerfile:12-14`), not from any storefront app code at runtime — confirmed via repo-wide grep, no reference to `key-exchange` exists in `storefront/src`.
- **`backend/src/api/store/custom/route.ts`** — exists in the backend but has **zero callers** in `storefront/src` (confirmed via grep) — currently dead from the storefront's perspective.

## Open questions / things not fully verified

- Whether `sdk.store.cart.update(cartId, {promo_codes})` internally delegates to the same `updateCartPromotionsWorkflow` that backs the dedicated `/store/carts/:id/promotions` endpoint, or is separate/older logic with different add-vs-replace semantics — not verified by reading the `@medusajs/medusa` route handler. See `cart-promotions-flow.md` §5/§10 for why this matters (two suspected bugs trace back to this ambiguity).
- `sdk.auth.logout()`'s exact backend route wasn't traced into the SDK source in this pass (listed above as "(session/auth logout)" rather than a confirmed path).
