# Ember (`new-storefront`) → Medusa backend integration map

## Status: browse + cart implemented

The "good fit" mappings below (products, categories, cart, line items, promo codes) are now
**wired up for real** — see [`src/lib/sdk.ts`](../src/lib/sdk.ts), `cartStorage.ts`, and
`backend.ts`. Screens fetch and mutate real backend state instead of `src/data.ts` mocks.
Payment/checkout and customer auth are still unimplemented (out of scope for that pass — see
"Recommended integration approach" below, which this followed). A coffee-drink catalog was
seeded via [`backend/src/scripts/seed-coffee.ts`](../../backend/src/scripts/seed-coffee.ts)
(`pnpm seed:coffee`) so Size x Milk selection has real variants to resolve against; the rest of
this doc's analysis (written before that work) is left intact as the design record, plus a few
inline notes on what actually happened where it diverged from the original plan.

**Two gotchas hit during implementation, worth knowing before touching this again:**
- The generic Medusa demo catalog (shirts etc. from `seed.ts`) coexists in the same backend as
  the coffee catalog. `listDrinks()` in `backend.ts` filters to products that resolve to at
  least one Size+Milk variant, so demo products never show up as broken zero-price "drinks."
- Running this app's Vite dev server (`localhost:5173`) against a locally-run backend needs
  `http://localhost:5173` in `STORE_CORS`. `backend/.env`/`.env.template` now include it, but
  **`docker-compose.yml`'s `backend` service hardcodes `STORE_CORS: http://localhost:8000`** in
  its `environment:` block, which overrides `env_file: ./backend/.env` — so the docker-compose
  stack's backend still won't accept requests from this app until that hardcoded value is
  updated too (not changed in this pass, since docker-compose's backend and a natively-run
  `pnpm dev` backend can't both bind port 9000 at once — pick one per session).

## Context

`new-storefront/` is a **design-handoff bundle**, not a branch of `storefront/`. It's an
unrelated React+Vite prototype called "Ember" — an order-ahead coffee app with an AI-barista
chat — dropped into this repo as a reference implementation of a new design (see
`new-storefront/README.md` and `new-storefront/docs/UX.md`). It does not share code, routing,
or a data layer with `storefront/`, and today it makes **zero network calls of any kind**:
every screen renders from the static mock objects in [`src/data.ts`](../src/data.ts), and all
mutations (`addItem`, `quickAdd`, `changeQty`) are in-memory React state in
[`src/App.tsx`](../src/App.tsx). There is no `fetch`, no SDK, no `.env`, no auth.

This doc exists for whoever wires Ember to the real Medusa backend next. It maps every mock
data source and every button in Ember to (a) the actual Medusa Store API endpoint that would
back it in production, using the verified call surface in
[`../../docs/flows/storefront-backend-api-surface.md`](../../docs/flows/storefront-backend-api-surface.md)
as ground truth, and (b) flags the parts of Ember's design that **have no first-class Medusa
equivalent** and need a custom module, a workaround, or a product decision before they can be
wired up. No application code was changed to produce this doc.

Read `new-storefront/docs/UX.md` first for *why* each screen is shaped the way it is — this
doc only covers *what data it needs and where that data would come from*.

---

## Current state: fully mocked, no backend

| Mock source | Shape | Consumed by |
|---|---|---|
| `DRINKS: Drink[]` (`data.ts:18-52`) | 4 hardcoded drinks: id, name, desc, price, tint (placeholder color), category, optional tag | `MenuScreen` (featured + popular lists), `DrinkDetailScreen` (via `byId`), `ChatScreen` (`REC = byId('bs-oat-latte')`) |
| `CATEGORIES: string[]` (`data.ts:54`) | 4 static category labels | `MenuScreen` chip row — **not wired to filter anything**, tapping a chip does nothing |
| `SIZE_DELTA`, `EXTRAS` (`data.ts:6-16`) | Size → price delta map; 2 hardcoded extras with flat prices | `DrinkDetailScreen` live price calc |
| `STORE` (`data.ts:3`) | Single hardcoded store name/location/ETA | `MenuScreen` header, `CartScreen` pickup card |
| `USER` (`data.ts:4`) | Hardcoded "Alex", 240 stars, 4/8 progress | `MenuScreen` greeting, `RewardsScreen` |
| `REWARD_ACTIVITY` (`data.ts:56-60`) | 3 hardcoded activity rows | `RewardsScreen` activity feed |
| `cart: CartItem[]` (`App.tsx:18`) | In-memory array, never persisted | `CartScreen`, tab bag-count badge |
| `INITIAL: ChatMessage[]` (`ChatScreen.tsx:10-15`) | Hardcoded canned conversation | `ChatScreen` bubbles variant on mount |

There is **no `countryCode`/region concept, no cookies, no JWT, no cart id persistence** —
refreshing the page loses the cart entirely (React state only). This is a strictly bigger gap
than anything in `storefront/`, which already has all of that plumbing built (see
`lib/data/cookies.ts`, `middleware.ts` in the sibling app).

---

## Proposed mapping: Ember concept → Medusa entity → endpoint

| Ember concept | Medusa entity | Endpoint (per `storefront-backend-api-surface.md`) | Fit |
|---|---|---|---|
| `Drink` (menu item) | Product | `GET /store/products` (`getProductsList`/`getProductByHandle` pattern in `storefront/src/lib/data/products.ts`) | **Good fit.** `name`→title, `desc`→description, `price`→variant calculated price, `tint`/photo→product images, `category`→product category or collection |
| `CATEGORIES` chip row | Product category | `GET /store/product-categories` (`storefront/src/lib/data/categories.ts`) | **Good fit**, but chips need to actually filter `getProductsList({category_id})` — currently inert in Ember |
| Size (Small/Medium/Large) | Product **option** + **variant** | variant resolved via `sdk.store.product.list` with option values; price per variant, not a flat delta | **Partial fit.** Medusa variants have one price each, not a base+delta formula — the size upcharge must be baked into each variant's price at catalog-setup time, not computed client-side like `SIZE_DELTA` does today |
| Milk (Oat/Whole/Almond/Lactose-free) | Second product option dimension | same as above — a 3(size)×4(milk) = 12-variant product | **Partial fit**, same caveat: no per-option price delta primitive, each combination needs its own variant price |
| Extras (extra shot, cold foam) | **No first-class equivalent** | — | **Gap** — see below |
| Cart / bag | Cart + line items | `POST /store/carts`, `POST /store/carts/:id/line-items` (`storefront/src/lib/data/cart.ts` `getOrSetCart`/`addToCart`) | **Good fit**, needs the cart-id-cookie pattern Ember doesn't have yet |
| Qty steppers | Line item update/delete | `POST /store/carts/:id/line-items/:line_id`, `DELETE .../:line_id` (`updateLineItem`/`deleteLineItem`) | **Good fit** |
| "Apply a promo code" row | Cart promotions | `POST /store/carts/:id` with `promo_codes` (`applyPromotions` in `cart.ts:231-242`) | **Good fit** — but see the open question already flagged in `storefront-backend-api-surface.md` about add-vs-replace semantics on that call before reusing it verbatim |
| Subtotal / tax / total | Cart totals from the API response | cart object's `subtotal`/`tax_total`/`total` fields, **not** a client-computed `TAX_RATE = 0.078` | **Gap today, easy fix** — Ember hardcodes a flat tax rate in `CartScreen.tsx:7`; real tax must come from the cart response (see `docs/sessions/010-fix-subtotal-shipping-tax-semantics.md` for exactly this class of bug already found and fixed once in `storefront/`) |
| "Pay $X.XX" button | Payment session + cart complete | `POST /store/carts/:id/payment-sessions`, `POST /store/carts/:id/complete` (`initiatePaymentSession`, `placeOrder`) | **Good fit**, currently a fully static no-op button in Ember |
| Pickup / store name / ETA | Stock location (+ maybe sales channel) | no dedicated "pickup ETA" field in core Medusa | **Gap** — see below |
| `USER` (name, greeting) | Customer | `GET /store/customers/me` (`getCustomer` in `storefront/src/lib/data/customer.ts`) | **Good fit**, but requires auth Ember has no UI for at all (no login/signup screen exists) |
| Star balance / progress / activity feed | Loyalty/points ledger | **no Medusa core module** | **Gap** — see below |
| AI barista chat (bubbles + voice) | — | not a Medusa concern | **Out of scope for the backend** — see below |
| "4.9 · 128 ratings" on drink detail | Product reviews | **no Medusa core module** | **Gap** — no reviews/ratings concept in core Medusa; would need a third-party plugin or custom module |

---

## Screen-by-screen integration notes

### Menu (`MenuScreen.tsx`)
- Replace `DRINKS`/`featured`/`popular` slicing with `getProductsList()` (or a "featured"
  collection/tag if the catalog needs to mark one product as featured deliberately, since
  `DRINKS[0]` is just "whatever is first in the array" today).
- Category chips need an `onClick` that refetches `getProductsList({category_id})` — currently
  decorative.
- Search field is visual-only; wiring it up means either `getProductsList({q: ...})` against
  Medusa or, if this repo's Meilisearch setup is reused, going through
  `storefront/src/lib/search-client.ts`'s pattern instead (**not** the Medusa backend directly
  — see the "Not backend calls" section of `storefront-backend-api-surface.md`).
- Quick-add (`+`) needs a resolved default variant (Medium/Oat) id, not just the parent
  product id, before it can call `addToCart`.

### Drink detail (`DrinkDetailScreen.tsx`)
- Size and milk selectors need to resolve to one of the product's real variants and read
  *that variant's* price, replacing the `unitPrice = drink.price + SIZE_DELTA[size] + Σextras`
  formula (`DrinkDetailScreen.tsx:29`) — that formula has no equivalent once prices live on
  variants server-side.
- Temperature toggle (Iced/Hot) isn't listed as a variable in `types.ts`'s `Drink`/`CartItem`
  at all today — decide whether it's a third option dimension (more variants) or dropped.
- Extras toggles are the biggest structural gap (below).

### Cart (`CartScreen.tsx`)
- Swap the local `items`/`onQty` props for a fetched cart (`retrieveCart`) plus
  `updateLineItem`/`deleteLineItem` calls, mirroring `storefront/src/lib/data/cart.ts`.
- Tax line must come from the cart response's `tax_total`, not `TAX_RATE = 0.078`
  (`CartScreen.tsx:7,17`).
- "Earns +{stars}" needs a real loyalty computation from the backend, not
  `Math.round(subtotal * 2)` (`CartScreen.tsx:19`) — cosmetic today, will be actively
  misleading once payments are real.
- Promo row needs to call `applyPromotions`; empty-state "Browse the menu" button is already
  correctly wired to local nav and needs no backend change.
- "Pay" button needs `initiatePaymentSession` + `placeOrder`; there is currently no address /
  contact-info collection anywhere in Ember (`checkout-flow.md` in the sibling app's docs shows
  how much state that normally requires — Ember has none of it, not even a stub screen).

### Rewards (`RewardsScreen.tsx`)
Entirely a **backend gap**. Star balance, progress ring, and activity feed all need a loyalty
ledger Medusa core doesn't have. `docs/research/002-loyalty-plugin-gift-card-testcases.md`
already researched `@medusajs/loyalty-plugin` for the *existing* storefront's gift-card gap —
re-read that doc before building this, since it's the same class of "not installed, core has no
concept of it" problem. Until a loyalty module exists, this screen has nothing to wire up.

### Chat (`ChatScreen.tsx`)
Not a backend integration at all in the Medusa sense — canned replies
(`ChatScreen.tsx:44-50`, `setTimeout` simulating latency) would be replaced by a call to an LLM
service, not `/store/*`. The only Medusa-relevant part is the product card rendered inside a
bubble (`REC = byId('bs-oat-latte')`, `ChatScreen.tsx:8`) and its "Add to bag" button, which is
the same `addToCart` call as everywhere else. Recommending *which* product is a
prompt/retrieval concern, not a store API concern.

### "You" tab
Explicit stub (`ComingSoon`, `App.tsx:80,91-97`) — no backend work implied until a real screen
exists. Whatever replaces it will need the customer auth Ember currently has zero UI for
(no login, no signup, no session — contrast with `storefront/src/lib/data/customer.ts`'s
`signup`/`login`/`getCustomer`).

---

## Gaps with no first-class Medusa equivalent

- **Extras/add-ons with a flat price delta** (`EXTRAS` — extra shot, cold foam). Medusa has no
  "modifier" primitive layered on top of a variant. Options are: (1) model each extra as its
  own purchasable product/variant and add it as a second line item linked by metadata to the
  drink's line item, or (2) a custom pricing/line-item-adjustment workflow. Either needs a
  deliberate decision before `DrinkDetailScreen`'s extras toggles can call anything real.
- **Loyalty stars** (`USER.stars`, `RewardsScreen`, "Earns +N ★" on cart). No ledger in core
  Medusa; see `docs/research/002-loyalty-plugin-gift-card-testcases.md` for the prior research
  into `@medusajs/loyalty-plugin`, not currently installed in this repo.
- **Single-store pickup framing with an ETA** (`STORE`, cart pickup card). Medusa's closest
  primitive is a stock location (for inventory) or a sales channel, neither of which carries a
  "ready in ~8 min" field — this is presentation-layer data with no backend home yet.
- **Product ratings** ("4.9 · 128 ratings" on drink detail). No reviews module in Medusa core.
- **AI barista chat**. Entirely outside the Medusa store API's scope — needs its own LLM
  integration (and, per `CLAUDE.md`'s guidance elsewhere in this repo, that integration should
  default to a current Claude model if this repo ends up building it).

## The auth gap

Ember has **no login/signup/session UI anywhere** — `USER` is just a hardcoded object, not a
logged-in customer. Every backend-fitting item above that references "the customer" (rewards,
saved addresses for checkout, order history for a future "You" tab) is blocked on porting the
auth pattern that already exists in `storefront/src/lib/data/customer.ts` and
`storefront/src/lib/data/cookies.ts` (JWT in an httpOnly cookie, `getAuthHeaders()` spread into
every authenticated call) — see `storefront-backend-api-surface.md`'s "Client setup" section
and `docs/sessions/004-fix-customer-auth-headers-and-rerun-e2e.md` for the async-footgun to
avoid when re-implementing it (`getAuthHeaders()`/`setAuthToken()` must be awaited).

## Recommended integration approach

1. **Reuse, don't reinvent, the existing SDK/auth/cart plumbing.** `storefront/src/lib/`
   already solves cart-id cookies, JWT auth headers, and Next.js cache tagging for this exact
   backend. Ember is a Vite SPA, not Next.js, so the *server actions* can't be copied verbatim,
   but the **SDK client construction** (`storefront/src/lib/config.ts`), the **auth-header
   pattern**, and the **cart-endpoint call shapes** in `cart.ts` are directly portable logic —
   only the transport (Next server action vs. client-side fetch/SDK call) differs.
2. **Resolve the variant model before wiring `DrinkDetailScreen`.** Nothing else in the cart/
   checkout chain works until Size×Milk maps to real variant ids with real per-combination
   prices, replacing `SIZE_DELTA`/`EXTRAS` math.
3. **Decide the extras and loyalty gaps as product questions, not engineering ones**, before
   writing code against them — both require catalog/data-model decisions upstream of any API
   call.
4. **Treat chat as a separate integration surface** from the Medusa work — it can be built and
   demoed against the real product catalog (via `GET /store/products`) without waiting on
   loyalty, extras, or payment being solved.
