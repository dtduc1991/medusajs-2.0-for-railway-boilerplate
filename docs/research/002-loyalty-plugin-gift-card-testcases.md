# Research: `@medusajs/loyalty-plugin` — gift card / store credit data model, workflows, API surface, and candidate test cases

## Context

This repo currently has **gift card e2e tests skipped** (`storefront/e2e/tests/public/giftcard.spec.ts`, wrapped in `test.describe.skip`) because Medusa v2's core Promotions module has no gift-card concept — see [003-promotions-module-discount-specs.md](003-promotions-module-discount-specs.md). The skip comment in that spec file points here.

`@medusajs/loyalty-plugin` is the official Medusa plugin that reintroduces gift cards (and store credit accounts) for v2. **It is not installed in this repo** — `backend/node_modules` has no `@medusajs/loyalty-plugin`, and `backend/medusa-config.ts` does not register it. This doc is pure research against the published package (`npm view`/`npm pack`'d version `2.17.1`, installed `@medusajs/medusa@2.13.6` family in this repo — check for compatibility before adopting), done so that whoever wires up the plugin (or writes e2e tests anticipating it) has a single reference instead of re-reading `dist/*.js` from scratch.

**If/when this plugin gets installed**, the skipped tests in `giftcard.spec.ts` should be rewritten against the routes and behaviors below instead of the v1-era admin endpoints they currently reference.

### A note on the source

Everything below comes from `npm pack @medusajs/loyalty-plugin@2.17.1`, unpacked, reading `.medusa/server/src/**/*.js` (compiled output — there's no shipped `.ts` source, but sourcemaps embed the original TS which is what the `@example` JSDoc blocks below are lifted from). No application code in this repo was touched.

---

## 1. What the plugin adds

Two new modules:

- **`loyalty`** (`PluginModule.LOYALTY`) — owns the `GiftCard` entity.
- **`store-credit`** (`PluginModule.STORE_CREDIT`) — owns `StoreCreditAccount` + `AccountTransaction`. This is the actual ledger; gift cards are a thin wrapper around an anonymous store credit account.

Key insight: **a gift card has no balance field of its own that gets debited directly.** Redeeming a gift card creates a `StoreCreditAccount` (anonymous, no `customer_id`), credits it once with the gift card's `value`, and links the two via `gift_card_store_credit_account`. All balance math (and all "does this have enough left" checks) happens against the store credit account's `credits - debits`, not against the gift card row.

## 2. Data model

### `GiftCard` (table `loyalty_gift_card`)

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `code` | text | redemption code, format `GIFT-XXXX-XXXX-XXXX-XXXX` by default (see `generateCode()`, §7) |
| `status` | enum `GiftCardStatus` | `pending` \| `redeemed` — see §3 |
| `value` | BigNumber | the face value, set once at creation |
| `currency_code` | text | |
| `expires_at` | datetime, nullable | **not enforced anywhere in the workflows read** — no step checks `expires_at` against `now()`. If you need expiry enforcement, it doesn't exist yet upstream. |
| `reference_id` / `reference` | text, nullable | polymorphic pointer, e.g. `reference: "order"`, `reference_id: order.id` |
| `line_item_id` | text, nullable | the order line item it was purchased as (when bought as a product) |
| `note` | text, nullable | |
| `metadata` | JSON, nullable | |

### `StoreCreditAccount` (table `store_credit_account`)

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `code` | text, nullable | present for anonymous/gift-card-backed accounts (claimable by code); absent once owned, or for accounts created directly for a customer |
| `currency_code` | text | |
| `customer_id` | text, nullable | null = anonymous/unclaimed account |
| `transactions` | has-many `AccountTransaction` | |
| computed: `credits`, `debits`, `balance` | BigNumber | `balance = credits - debits`, derived from transactions, not stored columns |

### `AccountTransaction` (table `store_credit_account_transaction`)

| field | notes |
|---|---|
| `amount` | BigNumber |
| `type` | enum `TransactionType` (credit/debit) |
| `reference` / `reference_id` | e.g. `reference: "gift_card"`, `reference_id: code`; or `reference: "cart"`, `reference_id: cart.id`; or `reference: "store-credit"` for account-to-account transfers |
| `note` | e.g. `"Gift card redemption"`, `"Gift card usage"` |

### Module links (cross-module joins, queryable via `query.graph`)

- `cart_gift_cards_link` — Cart ↔ GiftCard (list, list)
- `order_gift_cards_link` — Order ↔ GiftCard (list, list)
- `order_line_item_gift_card_link` — GiftCard.line_item_id ↔ OrderLineItem (read-only)
- `gift_card_store_credit` — GiftCard ↔ StoreCreditAccount (list)
- `customer_store_credit_account_link` — StoreCreditAccount.customer_id ↔ Customer (read-only)

`gift_card_store_credit_account` (entity name used in `query.graph`) is the join row exposing `gift_card_id` / `store_credit_account_id` — used constantly in the workflows to go from a gift card to its backing account.

## 3. Gift card lifecycle

```
pending ──(redeemGiftCardWorkflow OR createGiftCardsWorkflow)──> redeemed
```

Despite the enum naming suggesting "redeemed = spent", **`redeemed` actually means "activated / has a funded store credit account behind it"**. There is no third status for "fully spent" — once the backing account balance hits 0, the gift card stays `status: redeemed` forever; "spent" is just `balance === 0` on the linked account.

Two independent paths create a gift card + backing account + REDEEMED status:

1. **`redeemGiftCardWorkflow`** (`workflows/gift-cards/workflows/redeem-gift-card.js`) — takes an existing `pending` gift card by `gift_card_id`, asserts it has no store-credit account yet and isn't already redeemed, creates the account, credits it with `giftCard.value`, links them, flips status to `redeemed`. This is the path for a gift card that was created in `pending` state (e.g. manually via admin with `status: "pending"`) and needs activating later.

2. **`createGiftCardsWorkflow`** (`workflows/gift-cards/workflows/create-gift-cards.js`) — creates the gift card row AND the backing account AND credits it AND marks it `redeemed`, all in one shot. This is what both the **admin `POST /admin/gift-cards`** route and the **order-placed subscriber** (`subscribers/create-gift-card.js`) call. So a gift card created this way is born already-redeemed/funded — `redeemGiftCardWorkflow` is never needed for it.

**Auto-creation on purchase**: the `create-gift-card` subscriber listens for `OrderWorkflowEvents.PLACED`. For every order line item whose product has `is_giftcard: true`, it creates one `GiftCard` **per unit of quantity** (so buying qty 3 of a gift-card product = 3 separate gift card codes), each with `value = lineItem.subtotal / lineItem.quantity`.

**Claiming** (`claimGiftCardWorkflow` / `POST /store/store-credit-accounts/claim`): an anonymous gift card's backing account can be transferred to a logged-in customer's own store credit account (merged by currency). Requires:
- the gift card has a store credit account with a `code` (i.e. it's redeemed/funded)
- target customer `has_account: true` (no guest claiming)
- the account isn't already owned by that customer, isn't already owned by anyone else, and has balance > 0

## 4. Cart integration

Carts use **credit lines** (a Medusa v2 cart concept, `cart.credit_lines`) to represent both gift cards and store credit applied to a cart. Each gift card or store-credit application becomes a credit line with `reference: "gift-card"` or `reference: "store-credit"` and `reference_id` pointing at the gift card id / store credit account id.

### Apply a gift card — `POST /store/carts/:id/gift-cards` `{ code }`
`addGiftCardToCartWorkflow`:
- 404/`INVALID_DATA` if code doesn't resolve to a gift card
- `INVALID_DATA` "already applied to cart" if the cart already has a credit line for that gift card
- `INVALID_DATA` "currency does not match cart currency" if gift card currency ≠ cart currency
- `INVALID_DATA` "has no balance" if the backing account balance is 0
- creates a credit line for `min(account.balance, cart.total)` — **a gift card never grants more than the cart total**, leftover balance just isn't drawn down yet
- no auth middleware on this route — works on guest carts too

### Remove a gift card — `DELETE /store/carts/:id/gift-cards` `{ code }`
`removeGiftCardFromCartWorkflow`: `INVALID_DATA` if code not found in cart's gift cards or not found at all; otherwise deletes the matching credit line(s) and dismisses the cart↔gift-card link.

### Refresh — `refreshCartGiftCardsWorkflow` (internal, not a direct route)
Recomputes all gift-card credit lines on a cart from scratch — dismisses existing gift-card credit lines/links, re-fetches each applied gift card's current balance, and re-creates credit lines capped by **remaining** cart total computed by walking the gift cards in order and decrementing a running total (so if two gift cards are applied and the cart total shrinks, the second one absorbs less). This exists to keep gift card credit lines correct when the cart total changes after a gift card was applied (item added/removed, price change, etc.) — likely wired to a cart-updated subscriber/hook in real usage, though this package's bundled hooks don't appear to call it directly (only `add`/`remove` call `refreshCartItemsWorkflow`, the core-flows step, not this gift-card-specific refresh). **Worth confirming when integrating** whether something actually triggers this on cart mutation, or whether it needs to be wired manually.

### Apply store credit — `POST /store/carts/:id/store-credits` `{ amount? }` (requires customer auth)
`addStoreCreditsToCartWorkflow`:
- `INVALID_DATA` if cart has no `customer_id` or no `currency_code`
- `INVALID_DATA` "not found"/"no balance" if the customer has no store credit account in the cart's currency, or it's empty
- `INVALID_DATA` "Amount is greater than the store credit account balance" if an explicit `amount` exceeds the balance
- omitting `amount` applies the **full balance** (capped at cart total)
- replaces any existing store-credit credit line (delete-then-recreate, not additive)

### Checkout-time debit — `confirmCartCreditLinesWorkflow`
Hooked into `completeCartWorkflow.hooks.beforePaymentAuthorization`. For every credit line on the cart with `reference` of `gift-card` or `store-credit`, debits the corresponding store credit account by the credit line's amount. This is where the balance actually gets consumed — applying a gift card to a cart doesn't touch the ledger, only completing the cart does. Cancel hook reverses via `confirmCartCreditLinesWorkflow.cancel`.

### Order placement — `cloneCartGiftCardsToOrderWorkflow`
Hooked into `completeCartWorkflow.hooks.orderCreated`. Links the cart's gift cards to the resulting order (`order_gift_cards_link`), so an order retains which gift cards paid for it.

### Refunds — `refundCreditLinesWorkflow`
Hooked into `createOrderCreditLinesWorkflow.hooks.creditLinesCreated` (i.e. when an order edit/exchange creates credit lines against an order). Presumably re-credits the relevant store credit accounts — file wasn't fully read line-by-line but is wired symmetrically with the debit-at-checkout flow.

## 5. Admin API

| Route | Method | Notes |
|---|---|---|
| `/admin/gift-cards` | GET | list, filterable by `q`, `id`, `customer_id`, `reference`, `reference_id`, `status`, `created_at`, `updated_at` |
| `/admin/gift-cards` | POST | body: `currency_code` (required), `value` (required), `status` (default `pending`), `code?`, `expires_at?`, `reference?`, `reference_id?`, `line_item_id?`, `note?`, `metadata?`. Runs `createGiftCardsWorkflow` — **note: regardless of the `status` you pass, `createGiftCardsWorkflow` unconditionally sets it to `redeemed`** at the end (see §3) — this looks like a real inconsistency between the validator default/intent and the workflow; worth a test asserting actual behavior. |
| `/admin/gift-cards/:id` | GET/POST(update) | update body: `status?`, `note?`, `expires_at?`, `metadata?` — value/currency are not updatable |
| `/admin/gift-cards/:id/orders` | GET | orders this gift card was used on |
| `/admin/store-credit-accounts` | GET/POST | |
| `/admin/store-credit-accounts/:id` | GET | |
| `/admin/store-credit-accounts/:id/credit` | POST | manual credit/debit by admin |
| `/admin/store-credit-accounts/:id/transactions` | GET | ledger |

## 6. Store API

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/store/gift-cards/:idOrCode` | GET | none | despite the param name, **lookup is always by `code`**, not id — `req.params.idOrCode` is used as the `code` filter verbatim |
| `/store/carts/:id/gift-cards` | POST `{code}` | none | apply, see §4 |
| `/store/carts/:id/gift-cards` | DELETE `{code}` | none | remove, see §4 |
| `/store/carts/:id/store-credits` | POST `{amount?}` | customer (session/bearer) | see §4 |
| `/store/store-credit-accounts*` | ALL | customer (session/bearer) | every method under this prefix requires auth |
| `/store/store-credit-accounts/claim` | POST `{code}` | customer | claims an anonymous account/gift-card by code onto `req.auth_context.actor_id` |

## 7. Code format

`generateCode(prefix = "GIFT", sections = 4)` → `GIFT-XXXX-XXXX-XXXX-XXXX`, alphabet excludes visually-ambiguous chars (`0/O`, `1/I`): `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Store credit account codes presumably use the same generator with a different prefix (not confirmed by file read, but same util is shared).

---

## 8. Candidate test cases

Organized so each maps to one Playwright/integration test. "(store)" = no auth needed unless noted; "(customer)" = needs a logged-in customer; "(admin)" = admin API.

### Gift card application to cart (store)
1. Apply a valid, fully-funded gift card to a cart whose total exceeds the gift card value → credit line created for the **full gift card balance**; cart's remaining total to pay = `total - giftCardValue`.
2. Apply a gift card whose value exceeds the cart total → credit line capped at `cart.total`, not the gift card's full balance (i.e. cart total becomes 0, gift card retains leftover balance for later use).
3. Apply the same gift card code twice to the same cart → second call fails with "already applied to cart".
4. Apply a gift card whose `currency_code` differs from the cart's currency → fails with currency mismatch error.
5. Apply a nonexistent/garbage code → `INVALID_DATA`/404 "not found".
6. Apply a gift card with zero remaining balance (already fully consumed by a prior order) → fails with "has no balance".
7. Apply two different gift cards to the same cart, where their combined value exceeds the cart total → second gift card's credit line only covers the residual after the first (covers `refreshCartGiftCardsWorkflow`'s running-total logic if/when wired to cart mutations — otherwise test the **add** path twice and assert the same capping behavior independently).
8. Remove an applied gift card → credit line and link removed; cart total to pay increases back by the previously-applied amount.
9. Remove a gift card code that was never applied to this cart → `INVALID_DATA` "not found in cart".
10. Apply a gift card to a guest (unauthenticated) cart → succeeds (route has no `authenticate` middleware).

### Store credit application to cart (customer)
11. Apply full store credit balance (no `amount` passed) to a cart → credit line equals `min(balance, cart.total)`.
12. Apply a partial explicit `amount` ≤ balance → credit line for exactly `amount`.
13. Apply an `amount` greater than the account balance → `INVALID_DATA` "greater than the store credit account balance".
14. Re-apply store credit with a different amount → old store-credit credit line is replaced (delete+recreate), not stacked — verify only one store-credit credit line exists afterward.
15. Apply store credit on a cart with no `customer_id` set → `INVALID_DATA` "customer must be set".
16. Apply store credit as a customer who has no store credit account in the cart's currency → `INVALID_DATA` "not found for the customer ... in that currency".
17. Apply store credit anonymously (no auth) → 401 (route requires `authenticate("customer", ...)`).

### Checkout / order placement
18. Complete a cart with an applied gift card → on `beforePaymentAuthorization`, the backing store credit account is debited by the credit line amount; placing the order succeeds and the order total reflects the discount.
19. Complete a cart with applied store credit and gift card together → both accounts debited correctly in the same `confirmCartCreditLinesWorkflow` run.
20. Cancel/fail an order during payment authorization after gift card debit started → debit is rolled back (via the `cancel` compensation hook) and the gift card balance is restored.
21. Place an order containing a gift-card product (e.g. "Sweatshirt" replaced with a "$50 Gift Card" line item, qty 2) → exactly 2 new `GiftCard` rows are created post-purchase, each `value = subtotal/2`, each already `status: redeemed` with a funded backing account.
22. Order-placed gift cards are linked to the order (`order_gift_cards_link`) and retrievable via `/admin/gift-cards/:id/orders`.

### Claiming
23. A logged-in customer claims an unclaimed gift card by code via `POST /store/store-credit-accounts/claim` → the backing account's balance transfers to (or merges into) the customer's own store-credit account in that currency; the source account balance becomes 0.
24. Claim attempt by a guest/unauthenticated request → 401.
25. Claim attempt with a code for an account that's already owned by a customer → `INVALID_DATA` "belongs to a customer".
26. Claim attempt with a code for an account with 0 balance → `INVALID_DATA` "no balance".
27. Claim attempt by a customer without a registered account (`has_account: false`) → `INVALID_DATA` "Only customers with an account can claim...".
28. Claiming when the customer already has an existing store-credit account in that currency → balance merges into the existing account rather than creating a new one.

### Admin CRUD
29. `POST /admin/gift-cards` with `value`, `currency_code` → response gift card has `status: "redeemed"` **even if you passed `status: "pending"`** (see §5 caveat) — assert actual observed behavior here since it may contradict the validator's documented default.
30. `POST /admin/gift-cards` without an explicit `code` → server auto-generates one matching `GIFT-XXXX-XXXX-XXXX-XXXX`.
31. `GET /admin/gift-cards?status=redeemed` and `?reference_id=<order_id>` filters return the expected subset.
32. `POST /admin/gift-cards/:id` updating `note`/`metadata`/`expires_at` persists; attempting to send `value` or `currency_code` either is ignored (stripped by zod `$strict`) or rejected — confirm which.
33. `GET /admin/gift-cards/:id/orders` returns orders linked to that gift card.

### Lookup
34. `GET /store/gift-cards/:code` with a valid code → returns the gift card (verify it's looked up by **code**, not id, even though the param is named `idOrCode`).
35. `GET /store/gift-cards/:code` with an id instead of a code → 404 (confirms the route does NOT actually support id lookup despite the param name).

### Edge cases worth flagging to a human before relying on
- `expires_at` is stored but never checked by any workflow read in this package — an "expired" gift card test would currently pass as if not expired at all. Confirm whether enforcement lives elsewhere (storefront UI?) before writing a test that asserts expiry blocks redemption.
- `refreshCartGiftCardsWorkflow` exists but no hook in this package's `workflows/hooks/*` calls it — if cart totals change after a gift card is applied, confirm something actually re-runs this workflow before writing a regression test for "gift card credit line auto-adjusts when cart total drops below the gift card's covered amount".
