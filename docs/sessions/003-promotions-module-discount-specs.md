# Research: Medusa v2 Promotions Module (discounts/coupons) — data model, rules, computation, API surface

## Context

Repo: `medusajs-2.0-for-railway-boilerplate` (Medusa v2.13.6 backend + Next.js storefront). This repo has **no custom promotion/discount code** of its own — `backend/src` was grepped (case-insensitive, all of `backend/src`) for "promotion" and returned zero matches. Everything described below lives in vendored `node_modules` packages: `@medusajs/promotion` (the module: models + services + utils), `@medusajs/medusa` (the API routes), `@medusajs/core-flows` (workflows), `@medusajs/utils` (shared enums/types re-exported as `@medusajs/framework/utils` from app code).

This doc exists so a future agent extending discount/coupon behavior (custom rules, storefront promo UI, automatic promotions, etc.) doesn't have to re-derive the module from scratch. It is purely research — **no application code was written or changed**.

**Why this matters right now**: see [002-e2e-playwright-headed-against-docker-compose.md](002-e2e-playwright-headed-against-docker-compose.md) — the bundled Playwright e2e suite still calls v1-era `/admin/discounts` and `/admin/gift-cards` endpoints that don't exist in v2; ~20 failing tests need to be rewritten against the Promotions module described here.

### A note on paths

All paths below are vendored dependencies under `backend/node_modules/.pnpm/`, **not part of this repo's source**. pnpm hashes the folder name from the full dependency tree (e.g. `@medusajs+promotion@2.13.6_@medusajs+framework@2.13.6_@medusajs+cli@2.13.6_@types+node@20.19._wrs6u33ss6cbg62lihulbqqpxm`), so the exact hash **will change** whenever the lockfile changes, even for the same `@medusajs/promotion` version. Don't hardcode the hash in new code or scripts — instead glob for the package name pattern, e.g.:

```
backend/node_modules/.pnpm/@medusajs+promotion@*/node_modules/@medusajs/promotion/dist/**
backend/node_modules/.pnpm/@medusajs+medusa@*/node_modules/@medusajs/medusa/dist/api/admin/promotions/**
backend/node_modules/.pnpm/@medusajs+core-flows@*/node_modules/@medusajs/core-flows/dist/promotion/**
```

Only compiled output (`dist/*.js`, `dist/*.d.ts`) ships in these packages — there is no `src/` to read. The `.js` files are the ground truth for logic; `.d.ts` files are useful for type/field shapes but are extremely verbose because Medusa's DML (`@medusajs/framework/utils` `model.define(...)`) entities cross-reference each other recursively in their generated types.

Current installed version: **`@medusajs/promotion@2.13.6`**, **`@medusajs/medusa@2.13.6`**, **`@medusajs/core-flows@2.13.6`**, **`@medusajs/utils@2.13.6`** (all pinned together).

---

## 1. Core data model

Source: `@medusajs/promotion/dist/models/*.d.ts` (DML entity definitions). Table names are the DB table names (Postgres).

### `Promotion` (table: `promotion`)

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `code` | text | the coupon code customers enter; also used as the unique identifier passed around `computeActions` |
| `is_automatic` | boolean | if true, applies without a code being entered (see §4) |
| `is_tax_inclusive` | boolean | whether `application_method.value` is tax-inclusive |
| `limit` | number, nullable | *(since 2.12.0)* total usage cap across all customers |
| `used` | number | *(since 2.12.0)* running usage counter, compared against `limit` |
| `type` | enum `PromotionType` | `standard` \| `buyget` |
| `status` | enum `PromotionStatus` | `draft` \| `active` \| `inactive` |
| `campaign` | belongs-to `Campaign`, nullable | |
| `application_method` | has-one `ApplicationMethod`, nullable | |
| `rules` | many-to-many `PromotionRule` | the promotion-level eligibility rules (§2) |
| `metadata` | JSON, nullable | *(since 2.12.0)* |

### `ApplicationMethod` (table: `promotion_application_method`)

Describes *how* the promotion's value gets applied. One per `Promotion` (has-one/belongs-to).

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `value` | BigNumber, nullable | the discount amount or percentage |
| `currency_code` | text, nullable | required when `type = fixed` (see rule-attributes-map, §5) |
| `max_quantity` | number, nullable | cap on quantity affected when `target_type = items` |
| `apply_to_quantity` | number, nullable | **buyget only** — how many target items the discount applies to |
| `buy_rules_min_quantity` | number, nullable | **buyget only** — minimum quantity required from buy_rules items |
| `type` | enum `ApplicationMethodType` | `fixed` \| `percentage` |
| `target_type` | enum `ApplicationMethodTargetType` | `order` \| `items` \| `shipping_methods` |
| `allocation` | enum `ApplicationMethodAllocation`, nullable | `each` \| `across` \| `once` |
| `promotion` | belongs-to `Promotion` | |
| `target_rules` | many-to-many `PromotionRule` (via `method_target_rules`) | which items/shipping methods are eligible to receive the discount |
| `buy_rules` | many-to-many `PromotionRule` (via `method_buy_rules`) | **buyget only** — which items count toward the "buy" condition |

### `PromotionRule` (table: `promotion_rule`)

Generic rule entity reused for three different attachment points (see §2). Self-contained: doesn't know which "kind" of rule it is — that's determined entirely by which relation FK points to it.

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `description` | text, nullable | |
| `attribute` | text | dotted path into the application context, e.g. `customer.groups.id`, `items.product.id`, `currency_code` (see §5 rule-attributes-map for the canonical list) |
| `operator` | enum `PromotionRuleOperator` | `gte` \| `lte` \| `gt` \| `lt` \| `eq` \| `ne` \| `in` |
| `values` | has-many `PromotionRuleValue` | |
| `promotions` | many-to-many `Promotion` (via `rules`) | when used as a promotion-level rule |
| `method_target_rules` | many-to-many `ApplicationMethod` (via `target_rules`) | when used as a target rule |
| `method_buy_rules` | many-to-many `ApplicationMethod` (via `buy_rules`) | when used as a buy rule |

### `PromotionRuleValue` (table: `promotion_rule_value`)

| field | type |
|---|---|
| `id` | string (PK) |
| `value` | text (always stored as string; numeric/date comparisons happen via string→BigNumber coercion at evaluation time, see §3) |
| `promotion_rule` | belongs-to `PromotionRule` |

### `Campaign` (table: `promotion_campaign`)

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `name` | text | |
| `description` | text, nullable | |
| `campaign_identifier` | text | external/human identifier |
| `starts_at` / `ends_at` | datetime, nullable | |
| `budget` | has-one `CampaignBudget`, nullable | |
| `promotions` | has-many `Promotion` | a campaign groups multiple promotions sharing one budget |

### `CampaignBudget` (table: `promotion_campaign_budget`)

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `type` | enum `CampaignBudgetType` | `spend` \| `usage` \| `use_by_attribute` \| `spend_by_attribute` |
| `currency_code` | text, nullable | required for spend-based types |
| `limit` | BigNumber, nullable | the cap; `null` = unlimited |
| `used` | BigNumber | running total |
| `campaign` | belongs-to `Campaign` | |
| `attribute` | text, nullable | *(since 2.11.0)* — for `*_by_attribute` types, which context attribute partitions the budget (e.g. per-customer) |
| `usages` | has-many `CampaignBudgetUsage` | *(since 2.11.0)* — per-attribute-value usage rows |

### `CampaignBudgetUsage` (table: `promotion_campaign_budget_usage`)

*(since 2.11.0)* — only relevant for `use_by_attribute` / `spend_by_attribute` budgets.

| field | type | notes |
|---|---|---|
| `id` | string (PK) | |
| `attribute_value` | text | the actual value of the partitioning attribute for this usage row (e.g. a specific `customer_id`) |
| `used` | BigNumber | usage accrued for this attribute value |
| `budget` | belongs-to `CampaignBudget` | |

### Enums — exact values

Source: `@medusajs/utils/dist/promotion/index.js` (re-exported as `@medusajs/framework/utils` in app code).

```ts
enum PromotionType { STANDARD = "standard", BUYGET = "buyget" }
enum PromotionStatus { DRAFT = "draft", ACTIVE = "active", INACTIVE = "inactive" }
enum ApplicationMethodType { FIXED = "fixed", PERCENTAGE = "percentage" }
enum ApplicationMethodTargetType { ORDER = "order", SHIPPING_METHODS = "shipping_methods", ITEMS = "items" }
enum ApplicationMethodAllocation { EACH = "each", ACROSS = "across", ONCE = "once" }
enum PromotionRuleOperator { GTE = "gte", LTE = "lte", GT = "gt", LT = "lt", EQ = "eq", NE = "ne", IN = "in" }
enum CampaignBudgetType { SPEND = "spend", USAGE = "usage", USE_BY_ATTRIBUTE = "use_by_attribute", SPEND_BY_ATTRIBUTE = "spend_by_attribute" }
enum ComputedActions {
  ADD_ITEM_ADJUSTMENT = "addItemAdjustment",
  ADD_SHIPPING_METHOD_ADJUSTMENT = "addShippingMethodAdjustment",
  REMOVE_ITEM_ADJUSTMENT = "removeItemAdjustment",
  REMOVE_SHIPPING_METHOD_ADJUSTMENT = "removeShippingMethodAdjustment",
  CAMPAIGN_BUDGET_EXCEEDED = "campaignBudgetExceeded",
  PROMOTION_LIMIT_EXCEEDED = "promotionLimitExceeded",
}
enum PromotionActions { ADD = "add", REMOVE = "remove", REPLACE = "replace" }
enum RuleType { RULES = "rules", TARGET_RULES = "target_rules", BUY_RULES = "buy_rules" }
```

---

## 2. Rule system

Three attachment points, all using the same `PromotionRule` entity, distinguished only by which relation references them:

1. **`Promotion.rules`** (`RuleType.RULES`) — promotion-level eligibility. Evaluated against the whole cart/order context with `contextScope = ApplicationMethodTargetType.ORDER`. Example: "customer must be in group X", "region must be Y".
2. **`ApplicationMethod.target_rules`** (`RuleType.TARGET_RULES`) — which line items (or shipping methods) the discount value actually lands on. Evaluated per-item with `contextScope = ITEMS` (or `SHIPPING_METHODS`).
3. **`ApplicationMethod.buy_rules`** (`RuleType.BUY_RULES`) — **buyget only** — which line items count toward the "buy N" condition. Evaluated per-item with `contextScope = ITEMS`.

A rule's `attribute` is a dotted path resolved against the application context object via `pickValueFromObject` (e.g. `customer.groups.id`, `items.product.categories.id`, `shipping_address.country_code`, `sales_channel_id`, `region.id`, `currency_code`). When `contextScope` is `items` or `shipping_methods`, the leading `items.`/`shipping_methods.` prefix is stripped before lookup, because by the time per-item evaluation runs the context *is* the individual item.

The canonical, admin-UI-facing list of selectable attributes (grouped by rule type) lives in:
`@medusajs/medusa/dist/api/admin/promotions/utils/rule-attributes-map.js` — function `getRuleAttributesMap({ promotionType, applicationMethodType, applicationMethodTargetType })`. It returns three buckets:
- `rules`: `customer_group` (`customer.groups.id`), `region` (`region.id`), `country` (`shipping_address.country_code`), `sales_channel` (`sales_channel_id`), plus a synthetic, always-injected `currency_code` rule (required if `applicationMethodType === fixed`, optional otherwise).
- `target-rules` / `buy-rules`: `product` (`items.product.id`), `product_category`, `product_collection`, `product_type`, `product_tag` — or, when `applicationMethodTargetType === shipping_methods`, just `shipping_option_type`.
- For `promotionType === buyget`, two extra **disguised** rules are injected that aren't really `PromotionRule` rows pointing at arbitrary attributes but map directly onto `ApplicationMethod` fields: `buy_rules_min_quantity` (into `buy-rules`) and `apply_to_quantity` (into `target-rules`). These are admin-UI sugar, not part of the core rule evaluation engine.

### Operators — exact semantics

Source: `@medusajs/promotion/dist/utils/validations/promotion-rule.js`, function `evaluateRuleValueCondition(ruleValues, operator, ruleValuesToCheck)`:

- `eq` — every value being checked must exist in the rule's value set (string equality, exact match)
- `ne` — every value being checked must **not** exist in the rule's value set (and if there's nothing to check, `ne` vacuously passes — every other operator fails when there's nothing to check)
- `in` — at least one value being checked must exist in the rule's value set
- `gt` / `gte` / `lt` / `lte` — numeric comparisons via `MathBN` (Medusa's BigNumber wrapper), every value-to-check must satisfy the comparison against *some* rule value

A rule only "passes" (`areRulesValidForContext`) if: it has a non-empty `attribute` and at least one string-typed `value`, AND the resolved context values satisfy `evaluateRuleValueCondition`. An empty rules array is trivially valid (`true`) — i.e. no rules attached means "always eligible."

---

## 3. Computation logic — how a promotion turns into cart adjustments

### Entry point

**`PromotionModuleService.computeActions(promotionCodes, applicationContext, options, sharedContext)`** in
`@medusajs/promotion/dist/services/promotion-module.js` (search for `async computeActions(`). This is the single function that decides, given a cart-shaped context and a list of promo codes, what line-item/shipping adjustments should exist. It does **not** mutate anything — it returns a list of `ComputedActions` objects that a workflow then applies.

High-level algorithm:

1. **Reconcile already-applied codes.** Scans `applicationContext.items[].adjustments` and `applicationContext.shipping_methods[].adjustments` for existing adjustments tagged with a promo `code`, and pre-emits `REMOVE_ITEM_ADJUSTMENT`/`REMOVE_SHIPPING_METHOD_ADJUSTMENT` actions for all of them — the whole cart's promotion state is recomputed from scratch every time, not incrementally patched.
2. **Build the candidate promotion set.** Combines explicitly-passed `promotionCodes` with codes already on the cart, then (unless `options.prevent_auto_promotions`) also pulls in all `is_automatic: true` promotions whose `rules` pre-filter-match the context (via `buildPromotionRuleQueryFilterFromContext`, a DB-query-level prefilter — an optimization, not the final eligibility check).
3. **Fetch active promotions** (`listActivePromotions_`) with all relations eager-loaded: `application_method`, `application_method.target_rules(.values)`, `application_method.buy_rules(.values)`, `rules(.values)`, `campaign.budget`.
4. **Filter to promotions actually requested or automatic**, then **sort** via `ComputeActionUtils.sortByBuyGetType` — buy-get promotions are evaluated before standard ones; ties broken by `application_method.value` descending, then (for buyget) by `buy_rules_min_quantity` and `apply_to_quantity` descending. This ordering matters because later promotions see the cumulative discount already applied via shared maps (`methodIdPromoValueMap`, `eligibleBuyItemMap`, `eligibleTargetItemMap`) passed through the loop.
5. **Per-promotion checks, in order, any of which short-circuits to the next promotion:**
   - Campaign budget of type `use_by_attribute`: looks up the relevant `CampaignBudgetUsage` row by the context's attribute value; if usage already meets/exceeds the budget, emits `CAMPAIGN_BUDGET_EXCEEDED` and skips.
   - Promotion-level `limit`/`used` check: if `used >= limit`, emits `PROMOTION_LIMIT_EXCEEDED` and skips.
   - Currency match: `application_method.currency_code` (if set) must equal `applicationContext.currency_code`.
   - **Promotion-level rule check**: `areRulesValidForContext(promotion.rules, applicationContext, ApplicationMethodTargetType.ORDER)` — if false, skip.
   - If both currency and rule checks pass, dispatch by `promotion.type`:
     - **`buyget`** → `ComputeActionUtils.getComputedActionsForBuyGet(...)` (see below)
     - **`standard`** → if `target_type` is `order` or `items`, call `getComputedActionsForItems(...)`; if `target_type` is `shipping_methods`, call `getComputedActionsForShippingMethods(...)`. When `target_type === order`, allocation is forced to `across` (the discount is spread proportionally over all eligible items) regardless of the stored `allocation` value.
6. **Spend-type campaign budgets and per-amount usage limits** are enforced inline as each item/shipping amount is computed (`ComputeActionUtils.computeActionForBudgetExceeded`, in `utils/compute-actions/usage.js`) — if applying this item's share would exceed the campaign's remaining spend budget, a `CAMPAIGN_BUDGET_EXCEEDED` action is emitted instead of the adjustment, and that item is skipped (other items/promotions continue).
7. Final amounts are normalized to BigNumber (`transformPropertiesToBigNumber`) before returning.

### Standard promotion item/shipping computation

`@medusajs/promotion/dist/utils/compute-actions/line-items.js`, function `getComputedActionsForItems` → `applyPromotionToItems`:

- Filters items to "valid" ones first (`getValidItemsForPromotion`): must be `is_discountable`, have `subtotal > 0`, have a `quantity` (unless shipping-method context), and if the application method has `target_rules`, must pass `areRulesValidForContext(target_rules, item, ITEMS)`.
- If `allocation === once`, items are sorted cheapest-first (`sortLineItemByPriceAscending`) so the discount is "used up" on the cheapest eligible units first.
- If `allocation === across`, computes a shared pool (`lineItemsAmount`) across all eligible items' subtotals (minus already-applied promo value) up front; this is the base the percentage/fixed amount gets distributed proportionally over (logic lives inside the shared `calculateAdjustmentAmountFromPromotion` utility from `@medusajs/utils`, not duplicated here — not directly inspected in this research pass).
- For each eligible item (respecting `max_quantity`/remaining quota for `once`), computes the adjustment `amount`, checks campaign/usage budget, and if not exceeded, emits `ComputedActions.ADD_ITEM_ADJUSTMENT { item_id, amount, code, is_tax_inclusive }`. Shipping-targeted promotions go through the analogous `shipping-methods.js` (not read in full this pass, but structurally mirrors line-items.js, emitting `ADD_SHIPPING_METHOD_ADJUSTMENT`).

### Buy-get promotion computation

`@medusajs/promotion/dist/utils/compute-actions/buy-get.js`, function `getComputedActionsForBuyGet`. This is the most complex path — an iterative "consume buy items, apply to target items" loop, capped at 1000 iterations as a safety valve:

1. Bail early if there's no `buy_rules_min_quantity > 0` or no `buy_rules` configured, or no items in context.
2. Build `eligibleBuyItems` / `eligibleTargetItems` by filtering+sorting (by price, all items, not just specific ones) all cart items against `buy_rules` / `target_rules` respectively (`filterItemsByPromotionRules`).
3. Track **remaining quantities** per item, subtracting quantities already consumed by *other* promotions in the same compute pass (cross-promotion coordination via `eligibleBuyItemMap`/`eligibleTargetItemMap`, which persist across the `sortedPromotionsToApply` loop in `computeActions`).
4. Loop: each iteration calls `preparePromotionApplicationState` to greedily pick enough buy-items to satisfy `buy_rules_min_quantity`, then picks target items up to `apply_to_quantity` (bounded by `max_quantity`), short-circuiting to `isValid: false` once there isn't enough remaining buy-quantity. Then `applyPromotionToTargetItems` computes the per-unit discount (`pricePerUnit * multiplier * (value / 100)`, where `value` here is the *percentage* of price applied — i.e. buyget promotions are inherently percentage-based per the formula, regardless of `application_method.type`), checks campaign budget, and accumulates into `itemIdPromotionAmountMap`. The loop repeats until either no more eligible buy items remain or target quota is filled.
5. Final pass collapses `itemIdPromotionAmountMap` into one `ADD_ITEM_ADJUSTMENT` action per item (summed across iterations).

### Where this gets invoked from a cart

The workflow that drives all of this end-to-end is:

**`updateCartPromotionsWorkflow`** in `@medusajs/core-flows/dist/cart/workflows/update-cart-promotions.js` (workflow id: `update-cart-promotions`). Steps, in order:
1. Fetch/validate the cart, acquire a per-cart lock.
2. `getPromotionCodesToApply` — reconciles the incoming `promo_codes` + `action` (`add`/`remove`/`replace`) against the cart's currently-applied codes to produce the final code list to recompute against.
3. `getActionsToComputeFromPromotionsStep` — calls into `PromotionModuleService.computeActions` (this is the step that wraps the function described above).
4. `prepareAdjustmentsFromPromotionActionsStep` — translates the raw `ComputedActions` array into concrete `lineItemAdjustmentsToCreate`, `lineItemAdjustmentIdsToRemove`, `shippingMethodAdjustmentsToCreate`, `shippingMethodAdjustmentIdsToRemove`, and the final `computedPromotionCodes` list (i.e. it's also where `CAMPAIGN_BUDGET_EXCEEDED`/`PROMOTION_LIMIT_EXCEEDED` signals presumably get filtered out of the code list — not traced in detail this pass).
5. Parallel: remove stale adjustments, create new ones, and `updateCartPromotionsStep` (replaces the cart's `promo_codes` association) — all via `parallelize`.
6. Optionally refreshes the payment collection.
7. Releases the lock.

This workflow is invoked by the **Store API** route `POST /store/carts/:id/promotions` (add) and `DELETE /store/carts/:id/promotions` (remove) — see §5.

---

## 4. Codes, automatic promotions, and campaign budgets

- **`code`**: free-text string on `Promotion`, what the customer types in. Uniqueness is enforced at the DB/service layer (not verified in this pass, but `computeActions` looks up promotions by exact `code` match).
- **`is_automatic`**: when true, the promotion is included in `computeActions`'s candidate set automatically (subject to the same rule/currency/budget checks as code-entered promotions) — no `promo_codes` entry needed. This is gated by `options.prevent_auto_promotions`; when set, only explicitly-passed codes are considered (used internally during checkout/order flows where you don't want auto-promotions silently reapplied — not confirmed exactly where this flag is set to `true` in this pass).
- **Promotion-level usage limit**: `Promotion.limit` (nullable cap) vs `Promotion.used` (counter). Checked first in the per-promotion loop in `computeActions`; exceeding it emits `PROMOTION_LIMIT_EXCEEDED` and the promotion contributes no adjustments. The actual increment of `used` happens elsewhere (workflow step `register-usage` in `core-flows/dist/promotion/steps/register-usage.js`, presumably called on order completion — not traced in this pass).
- **Campaign budgets** (`CampaignBudget.type`):
  - `spend` — limit is a currency amount; enforced per-item/shipping-amount as adjustments are computed (`computeActionForBudgetExceeded` in `utils/compute-actions/usage.js`), comparing `budget.used + this adjustment's amount` against `budget.limit`.
  - `usage` — limit is a count of promotion applications (not a currency amount); same enforcement point, different comparison basis.
  - `spend_by_attribute` / `use_by_attribute` — *(since 2.11.0)* same as above but partitioned by `CampaignBudget.attribute` (a dotted path into context, e.g. could partition per-customer) via per-partition `CampaignBudgetUsage` rows. The `use_by_attribute` case is checked **before** the promotion-level `limit` check, at the very top of the per-promotion loop in `computeActions`, using `ComputeActionUtils.getBudgetUsageContextFromComputeActionContext` to extract the attribute value from the application context.
  - Exceeding any budget type emits `ComputedActions.CAMPAIGN_BUDGET_EXCEEDED` instead of an adjustment — the promotion silently contributes nothing further for that cart, rather than throwing.
- A `Campaign` can hold multiple `Promotion`s sharing one `CampaignBudget` — i.e. budget exhaustion from one promotion in a campaign blocks the others sharing that budget too, since the budget lookup is via `promotion.campaign.budget`.

---

## 5. Admin & Store API surface

All routes below are HTTP route handlers shipped inside `@medusajs/medusa`, registered automatically by the Medusa framework's file-based router — they are not things this repo defines. Glob pattern to relocate them after a lockfile change:
`backend/node_modules/.pnpm/@medusajs+medusa@*/node_modules/@medusajs/medusa/dist/api/{admin,store}/**`

### Admin — Promotions (`/admin/promotions`)

| route file | methods (inferred from `exports`) |
|---|---|
| `admin/promotions/route.js` | list/create promotions |
| `admin/promotions/[id]/route.js` | get/update/delete a promotion |
| `admin/promotions/[id]/[rule_type]/route.js` | generic handler parameterized by `rule_type` (`rules` \| `target-rules` \| `buy-rules`) |
| `admin/promotions/[id]/rules/batch/route.js` | batch add/remove/replace promotion-level rules |
| `admin/promotions/[id]/target-rules/batch/route.js` | batch add/remove/replace `application_method.target_rules` |
| `admin/promotions/[id]/buy-rules/batch/route.js` | batch add/remove/replace `application_method.buy_rules` (buyget only) |
| `admin/promotions/rule-attribute-options/[rule_type]/route.js` | returns the available rule **attributes** for a given rule type (backs `rule-attributes-map.js`, §2) — drives the admin dashboard's rule-builder dropdown |
| `admin/promotions/rule-value-options/[rule_type]/[rule_attribute_id]/route.js` | returns valid **values** for a chosen attribute (e.g. lists actual customer groups/regions/products to pick from) |

Supporting non-route files in the same tree: `helpers.js`, `middlewares.js`, `validators.js`, `query-config.js`, and an `utils/` folder containing `operators-map.js` (maps `PromotionRuleOperator` → admin-facing operator metadata/labels), `rule-attributes-map.js` (§2), `rule-query-configuration.js`, `validate-rule-attribute.js`, `validate-rule-type.js`.

### Admin — Campaigns (`/admin/campaigns`)

| route file | purpose |
|---|---|
| `admin/campaigns/route.js` | list/create campaigns |
| `admin/campaigns/[id]/route.js` | get/update/delete a campaign |
| `admin/campaigns/[id]/promotions/route.js` | add/remove promotions from a campaign (confirmed used by the `add-or-remove-campaign-promotions` workflow, §6) |

### Store — Cart promotions (`/store/carts/:id/promotions`)

Single route file: `store/carts/[id]/promotions/route.js`, exports `POST` and `DELETE`:

- **`POST /store/carts/:id/promotions`** — body `{ promo_codes: string[] }`. Runs `updateCartPromotionsWorkflowId` with `action = PromotionActions.ADD` if codes were provided, else `PromotionActions.REPLACE` (i.e. posting an empty array clears all codes). Always passes `force_refresh_payment_collection: true`. Returns the refetched cart.
- **`DELETE /store/carts/:id/promotions`** — body `{ promo_codes: string[] }`. Runs the same workflow with `action = PromotionActions.REMOVE`. Returns the refetched cart.

This is the endpoint the storefront must call instead of the v1-era discount endpoints referenced in the e2e suite's `seed.ts`/`reset.ts` (see Context above).

---

## 6. Workflows (`@medusajs/core-flows`)

Glob: `backend/node_modules/.pnpm/@medusajs+core-flows@*/node_modules/@medusajs/core-flows/dist/promotion/**` and `.../dist/cart/workflows/update-cart-promotions.js`.

CRUD-ish workflows under `promotion/workflows/`:
`create-promotions`, `update-promotions`, `delete-promotions`, `update-promotions-status`, `create-promotion-rules`, `update-promotion-rules`, `delete-promotion-rules`, `batch-promotion-rules`, `create-campaigns`, `update-campaigns`, `delete-campaigns`, `add-or-remove-campaign-promotions`.

Corresponding steps under `promotion/steps/`: `create-promotions`, `update-promotions`, `delete-promotions`, `add-rules-to-promotions`, `remove-rules-from-promotions`, `update-promotion-rules`, `create-campaigns`, `update-campaigns`, `delete-campaigns`, `add-campaign-promotions`, `remove-campaign-promotions`, `add-or-remove-campaign-promotions`, `register-usage` (increments `Promotion.used` / budget `used` — presumably invoked from order-completion workflows, not traced into in this pass), `delete-promotion-rules-workflow`.

**The one workflow that actually matters for cart/checkout behavior** is `updateCartPromotionsWorkflow` (`cart/workflows/update-cart-promotions.js`, id `update-cart-promotions`) — fully described in §3. It is the only workflow that calls into `computeActions` and is wired to the store API route in §5. It exposes a `validate` hook (`createHook("validate", { input, cart })`) that custom code can tap into to add validation before the workflow proceeds — useful extension point if a future feature needs to reject certain promo codes under custom conditions without forking the workflow.

---

## 7. Open questions / not verified in this pass

- Exact mechanics of `calculateAdjustmentAmountFromPromotion` (shared utility in `@medusajs/utils`, used by `line-items.js`) — how percentage vs fixed amounts are actually split across `each`/`across` allocations. Worth reading directly if implementing custom allocation logic.
- `shipping-methods.js` compute-actions file (`@medusajs/promotion/dist/utils/compute-actions/shipping-methods.js`) was not read in full — assumed structurally analogous to `line-items.js` based on shared usage patterns, but not confirmed line-by-line.
- Where exactly `options.prevent_auto_promotions` and `options.skip_usage_limit_checks` get set to `true` by calling workflows (e.g. during order placement vs. cart preview) was not traced.
- `register-usage` step's exact trigger point (which order/payment workflow calls it) was not traced.
- HTTP method exports (GET/POST/PUT/DELETE) for each admin route file were inferred from file/folder naming conventions, not individually opened and grep'd for `exports.GET`/`exports.POST` etc. — confirm before building admin UI integrations against a specific verb.
- The exact validator schemas (`admin/promotions/validators.js`) defining required/optional request body fields were not read — needed before writing any new admin route caller code.
