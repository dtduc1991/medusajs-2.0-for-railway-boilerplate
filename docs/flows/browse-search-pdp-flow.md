# Research: Browse, Search & Product Detail journey (Next.js storefront, Medusa v2)

## Context

Repo: `medusajs-2.0-for-railway-boilerplate`, `storefront/` (Next.js 14 App Router, Medusa v2 Store API via `@medusajs/js-sdk`). This doc is pure research — no application code was written or changed.

This journey covers everything between "user lands on the storefront" and "user has a product variant in front of them ready to add to cart," across these routes (all under `storefront/src/app/[countryCode]/(main)/`):

| Route | File |
|---|---|
| `/` | `page.tsx` (home, featured collections) |
| `/store` | `store/page.tsx` (all-products listing) |
| `/categories/[...category]` | `categories/[...category]/page.tsx` |
| `/collections/[handle]` | `collections/[handle]/page.tsx` |
| `/products/[handle]` | `products/[handle]/page.tsx` (PDP) |
| `/search` | `search/page.tsx` (renders the search **modal** in place) |
| `/results/[query]` | `results/[query]/page.tsx` (full search results page) |

All listing pages (`store`, `categories`, `collections`, `results`) share the same building blocks: `RefinementList` (sort control) + `PaginatedProducts` (grid + pagination), both from `storefront/src/modules/store/**`. Search is a separate subsystem backed by **MeiliSearch** (not Algolia, despite the task brief's hint to check — see §Search below), wired through `react-instantsearch-hooks-web` for the live modal and a server action for the `/results/[query]` page.

Region/currency context (`getRegion(countryCode)`) is resolved per-request from the `[countryCode]` route segment and threaded into every product/price fetch; there is no client-side region switch on these pages other than navigating to a different `countryCode` prefix via `CountrySelect` in the nav side menu.

---

## Flow: Home page (featured collections)

### User steps
1. User lands on `/[countryCode]` (e.g. `/us`).
2. Sees a static hero banner (Railway/Medusa deployment congratulations copy — boilerplate placeholder content, not a CMS-driven hero).
3. Below the hero, sees up to 3 collections rendered as horizontal "rails," each showing that collection's products as preview cards.
4. Clicking "View all" on a rail navigates to `/collections/[handle]`. Clicking a product card navigates to `/products/[handle]`.

### Component map
| Step | Component/file |
|---|---|
| Route | `storefront/src/app/[countryCode]/(main)/page.tsx:14-37` |
| Data fetch | `getCollectionsWithProducts(countryCode)` — `storefront/src/lib/data/collections.ts:29-62` |
| Hero | `storefront/src/modules/home/components/hero/index.tsx:4-35` |
| Rail container | `storefront/src/modules/home/components/featured-products/index.tsx:4-16` |
| Each rail | `storefront/src/modules/home/components/featured-products/product-rail/index.tsx:7-39` |
| Product card | `storefront/src/modules/products/components/product-preview/index.tsx:10-52` |

### States & edge cases
- **No collections or no region**: `Home` returns `null` (blank page, no fallback UI) if `getCollectionsWithProducts` or `getRegion` resolves falsy — `storefront/src/app/[countryCode]/(main)/page.tsx:23-25`. There's no loading skeleton for the home page at all (no `<Suspense>` boundary), so the whole page blocks server-side until both fetches resolve.
- **`getCollectionsWithProducts`** (`storefront/src/lib/data/collections.ts:29-62`) only takes the **first 3** collections (`getCollectionsList(0, 3)`), fetches products for those collection IDs via one combined `getProductsList` call, then buckets results back onto each collection client-side by `product.collection_id`. A collection with zero products renders `null` from `ProductRail` (`storefront/src/modules/home/components/featured-products/product-rail/index.tsx:16-18`), silently disappearing from the page (no "no products" message in that case — it's the rail's parent `<li>` that ends up empty).
- The hero is 100% static JSX (`storefront/src/modules/home/components/hero/index.tsx`) — no fetched content, no loading/error state possible there.

---

## Flow: Browse store listing (`/store`)

### User steps
1. User navigates to `/store` (via nav "Store" link in the side menu, or directly).
2. Sees page title "All products," a sort control, and a responsive product grid (2/3/4 columns depending on breakpoint).
3. While the grid is loading, sees a skeleton grid instead (Suspense fallback).
4. If there are more than 12 products, sees pagination controls below the grid.

### Component map
| Step | Component/file |
|---|---|
| Route | `storefront/src/app/[countryCode]/(main)/store/page.tsx:21-31` — reads `sortBy`/`page` from `searchParams` |
| Template | `storefront/src/modules/store/templates/index.tsx:9-43` |
| Sort control | `storefront/src/modules/store/components/refinement-list/index.tsx:14-41` → `sort-products/index.tsx:28-48` |
| Grid + pagination | `storefront/src/modules/store/templates/paginated-products.tsx:17-92` |
| Skeleton | `SkeletonProductGrid` (`@modules/skeletons/templates/skeleton-product-grid`, fallback at `store/templates/index.tsx:31`) |
| Data fetch | `getProductsListWithSort` — `storefront/src/lib/data/products.ts:96-140` |
| Pagination UI | `storefront/src/modules/store/components/pagination/index.tsx:6-114` |

### States & edge cases
- **Sorting is done client-side over an over-fetched batch, not server-side.** `getProductsListWithSort` (`storefront/src/lib/data/products.ts:96-140`) always requests `limit: 100` from the Store API regardless of the page size the UI shows (12), sorts the full 100-item batch in memory via `sortProducts` (`storefront/src/lib/util/sort-products.ts`, not read in full this pass), then slices out the requested page. **This means: stores with >100 products will have incorrect sort/pagination beyond the first 100 items** (items 101+ are never fetched, so they can't appear in any page, and the "100 newest" bias depends on whatever default order the Store API returns before the in-memory sort is applied). This is a real scalability gap worth flagging, not just a stylistic choice.
- **Sort options**: `created_at` (default, "Latest Arrivals"), `price_asc`, `price_desc` — `storefront/src/modules/store/components/refinement-list/sort-products/index.tsx:13-26`. Only `created_at` is actually passed through to the Store API as an `order` query param (`storefront/src/lib/data/products.ts:48-50`); `price_asc`/`price_desc` are pure client-side array sorts after fetch (consistent with the over-fetch behavior above).
- Sort/page state is stored in the URL (`?sortBy=...&page=...`) via `router.push`, not component state — `storefront/src/modules/store/components/refinement-list/index.tsx:19-32`. Refreshing or sharing the URL preserves sort/page.
- **No region**: `PaginatedProducts` returns `null` silently if `getRegion(countryCode)` resolves falsy (`storefront/src/modules/store/templates/paginated-products.tsx:54-56`) — empty page, no error message.
- **No products at all**: the grid (`<ul data-testid="products-list">`) simply renders with zero `<li>` children; there is no explicit "no products found" empty-state message anywhere in `PaginatedProducts`. This is shared by every listing page that uses this component (store, category, collection) — only the dedicated search-results template (`SearchResultsTemplate`) has an explicit empty-state message ("No results.").
- **Pagination**: only rendered when `totalPages > 1` (`storefront/src/modules/store/templates/paginated-products.tsx:83-89`); uses a windowed page-number scheme (max 7 visible, with ellipses) for >7 pages — `storefront/src/modules/store/components/pagination/index.tsx:62-103`.

---

## Flow: Navigate a category (`/categories/[...category]`)

### User steps
1. User navigates to a category URL, e.g. `/categories/shirts` or a nested path `/categories/men/shirts` (catch-all `[...category]` segment).
2. If the handle path doesn't resolve to any category, sees the Next.js 404 page.
3. Otherwise sees breadcrumb-style parent category links (if any), the category name as `<h1>`, an optional description, an optional list of child-category links, then the same sort + paginated grid as `/store`, scoped to that category.

### Component map
| Step | Component/file |
|---|---|
| Route | `storefront/src/app/[countryCode]/(main)/categories/[...category]/page.tsx:71-90` |
| Data fetch | `getCategoryByHandle(params.category)` — `storefront/src/lib/data/categories.ts:22-32` (matches by handle **array**, i.e. supports nested category paths) |
| Template | `storefront/src/modules/categories/templates/index.tsx:12-83` |
| Breadcrumbs | inline in template, `storefront/src/modules/categories/templates/index.tsx:38-52`, using `LocalizedClientLink` |
| Child category links | `storefront/src/modules/categories/templates/index.tsx:59-71`, via `InteractiveLink` |
| Grid + pagination | shared `PaginatedProducts`, called with `categoryId={category.id}` — `storefront/src/modules/categories/templates/index.tsx:73-79` |

### States & edge cases
- **404 paths**: two separate guards. `generateMetadata` catches a thrown error from `getCategoryByHandle` and calls `notFound()` (`storefront/src/app/[countryCode]/(main)/categories/[...category]/page.tsx:46-68`); the page component itself calls `notFound()` if `product_categories` is falsy (`page.tsx:78-80`); the template also calls `notFound()` if the resolved `category` (last element of the array) or `countryCode` is missing (`storefront/src/modules/categories/templates/index.tsx:29`). Three independent checks for essentially the same failure mode — somewhat defensive/redundant, but means a bad handle reliably 404s rather than rendering a broken page.
- `categories = [product_categories]` is an **array of categories along the path** (parents + the target), per `getCategoryByHandle`'s `{ handle: categoryHandle }` filter against the Store API, which returns all categories whose handle is in the array — `category = categories[categories.length - 1]` is the leaf, `parents = categories.slice(0, -1)` are breadcrumbs (`storefront/src/modules/categories/templates/index.tsx:26-27`). This relies on Store API response ordering matching path order — not independently verified against the API's actual sort guarantee in this pass.
- `category.category_children` (subcategories) are only rendered if present and non-empty — no special empty-state, the whole block is conditionally omitted (`storefront/src/modules/categories/templates/index.tsx:59-71`).
- `generateStaticParams` (`page.tsx:18-43`) pre-builds `{countryCode, category: [handle]}` static params for **only top-level (single-segment) category handles** across all regions — nested category paths are not statically generated and would be rendered on-demand (ISR/dynamic), though this wasn't independently confirmed against the Next.js config's `dynamicParams` setting.

---

## Flow: Navigate a collection (`/collections/[handle]`)

### User steps
1. User navigates to a collection URL, e.g. `/collections/winter-2024`.
2. If the handle doesn't resolve, sees 404.
3. Otherwise sees the collection title as `<h1>`, then the same sort + paginated grid, scoped to that collection.

### Component map
| Step | Component/file |
|---|---|
| Route | `storefront/src/app/[countryCode]/(main)/collections/[handle]/page.tsx:69-88` |
| Data fetch | `getCollectionByHandle(params.handle)` — `storefront/src/lib/data/collections.ts:21-27` |
| Template | `storefront/src/modules/collections/templates/index.tsx:9-41` |
| Grid + pagination | shared `PaginatedProducts`, called with `collectionId={collection.id}` — `storefront/src/modules/collections/templates/index.tsx:31-37` |

### States & edge cases
- 404 guard happens twice: in `generateMetadata` (`page.tsx:57-59`) and in the page component (`page.tsx:76-78`) — both check `if (!collection) notFound()`. The template itself has **no** further guard (unlike `CategoryTemplate`), so it trusts the page-level check.
- This template is the simplest of the three listing templates — no breadcrumbs, no child-collection concept (collections don't nest in Medusa), no description rendering (collection has no description field used here, unlike category).
- `PRODUCT_LIMIT = 12` is exported from the route file (`page.tsx:21`) but **not actually imported or used anywhere else found in this module** — `PaginatedProducts`/`getProductsListWithSort` hardcode their own `limit`/`PRODUCT_LIMIT` constants independently (`storefront/src/modules/store/templates/paginated-products.tsx:7`). Dead/unused export — a candidate for cleanup, and a sign the 12-per-page value is duplicated in three places (`store/page.tsx` has no such constant, `paginated-products.tsx:7`, `collections/[handle]/page.tsx:21`) rather than centralized.

---

## Flow: View product detail (`/products/[handle]`)

### User steps
1. User navigates to a PDP, typically by clicking a product card from a listing/search/related-products grid, or directly via URL.
2. If the handle doesn't resolve in the current region, sees 404.
3. Sees (left column, sticky on desktop): collection link (if the product belongs to one), title, description, then an accordion with "Product Information" (material/origin/type/weight/dimensions) and "Shipping & Returns" (static copy) tabs.
4. Sees (center): an image gallery — a vertical stack of all product images (not a carousel).
5. Sees (right column, sticky on desktop): variant selectors (if multi-variant), price, and an Add to Cart button — see "Select a variant" / "Add to cart from PDP" flows below.
6. Scrolls down past the main fold to see a "Related products" grid.
7. On mobile, once the right-column actions panel scrolls out of view, a sticky bottom bar appears showing title, price, an "Select Options"/variant-summary button, and an Add to Cart button.

### Component map
| Step | Component/file |
|---|---|
| Route | `storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx:70-89` |
| Data fetch (page-level) | `getProductByHandle(handle, region.id)` — `storefront/src/lib/data/products.ts:27-41` |
| Template | `storefront/src/modules/products/templates/index.tsx:20-67` |
| Info column | `storefront/src/modules/products/templates/product-info/index.tsx:9-40` |
| Tabs | `storefront/src/modules/products/components/product-tabs/index.tsx:14-42` (uses Radix Accordion via `storefront/src/modules/products/components/product-tabs/accordion.tsx`) |
| Image gallery | `storefront/src/modules/products/components/image-gallery/index.tsx:9-39` |
| Onboarding banner | `storefront/src/modules/products/components/product-onboarding-cta/index.tsx:4-28` (dev-onboarding artifact, see below) |
| Actions (price/variant/add-to-cart) | `storefront/src/modules/products/components/product-actions/index.tsx:32-166`, fetched fresh via `storefront/src/modules/products/templates/product-actions-wrapper/index.tsx:8-25` |
| Related products | `storefront/src/modules/products/components/related-products/index.tsx:19-78` |

### States & edge cases
- **404**: `generateMetadata` calls `notFound()` if `getRegion` or `getProductByHandle` resolves falsy (`page.tsx:49-57`); the page component repeats both checks (`page.tsx:73-80`); `ProductTemplate` itself also guards `if (!product || !product.id) return notFound()` (`storefront/src/modules/products/templates/index.tsx:25-27`) — three redundant layers again, same pattern as categories.
- **Pricing is fetched twice.** The page-level `getProductByHandle` fetch (for metadata + initial render) and `ProductActionsWrapper`'s independent `getProductsById` call (`storefront/src/modules/products/templates/product-actions-wrapper/index.tsx:15-18`) both request `fields: "*variants.calculated_price..."`. The comment above `ProductActionsWrapper` says this exists explicitly "to fetch real time pricing" — i.e. it's a deliberate freshness-over-efficiency tradeoff, wrapped in its own `<Suspense>` (`storefront/src/modules/products/templates/index.tsx:44-54`) so the rest of the PDP can render before pricing/variant data resolves. While that fetch is pending, the fallback renders `ProductActions` with `disabled={true}` using the *stale* page-level product data, so the user sees an immediately-disabled, non-interactive action panel rather than a blank skeleton.
- **`ProductOnboardingCta`** (`storefront/src/modules/products/components/product-onboarding-cta/index.tsx`) reads a `_medusa_onboarding` cookie and renders a "demo product created" banner above the actions panel when present — this is leftover Medusa CLI onboarding scaffolding, not a real user-facing flow; only relevant right after running `medusa-cli` onboarding, otherwise renders `null`.
- **Image gallery**: if `product.images` is empty/undefined, renders an empty container with no placeholder/empty-state (`ImageGallery` maps over `images`, no fallback branch — `storefront/src/modules/products/components/image-gallery/index.tsx:9-39`). First three images get `priority` loading (`index <= 2`).
- **`RelatedProducts`** (`storefront/src/modules/products/components/related-products/index.tsx:19-78`) — found a **dead-code artifact**: lines 25-27 declare `if (!region) { const queryParams: StoreProductParamsWithTags = {} }` as an empty, no-op block (the inner `queryParams` is a different, block-scoped variable shadowing the real one declared two lines later at line 30 — neither read nor used). This appears to be a copy/paste leftover; it has no functional effect since `queryParams` is reassigned unconditionally right after, but it's misleading dead code worth cleaning up. Related products are filtered by same collection + same tags (when present) + `is_giftcard: false`, then the current product is excluded from the result client-side (`.filter(p => p.id !== product.id)`) rather than excluded at the query level — so if the API page of results is small and happens to be dominated by the current product's neighbors, you could in theory get a related-products section with fewer items than the page size. If the resulting list is empty, the whole "Related products" block returns `null` (`storefront/src/modules/products/components/related-products/index.tsx:54-56`) — no "nothing related" message, section just doesn't render.

---

## Flow: Select a variant

### User steps
1. If the product has exactly 1 variant, its options are auto-selected on mount — no user action needed, Add to Cart is immediately enabled (subject to stock).
2. If the product has 2+ variants, the user sees one option-group (e.g. "Select Size") per product option, each rendered as a row of buttons.
3. Clicking an option value updates that option's selection. There is no requirement to select options in a particular order; any combination not yet matching a real variant simply leaves "no variant selected."
4. Once the chosen combination of option values matches an existing variant exactly, that variant becomes the `selectedVariant`; price and stock state update accordingly.
5. While options are still incomplete (no full variant match), the price display falls back to the "cheapest variant" price prefixed with "From", and the Add to Cart button reads "Select variant" and is disabled.

### Component map
| Step | Component/file |
|---|---|
| Selection state + variant matching | `storefront/src/modules/products/components/product-actions/index.tsx:37-58` (`options` state; `selectedVariant` is a `useMemo` matching `optionsAsKeymap(v.options)` against the current `options` map via lodash `isEqual`) |
| Auto-select single variant | `storefront/src/modules/products/components/product-actions/index.tsx:42-47` |
| Option buttons (desktop) | `storefront/src/modules/products/components/product-actions/option-select.tsx:14-56` |
| Option buttons (mobile, in bottom-sheet modal) | `storefront/src/modules/products/components/product-actions/mobile-actions.tsx:170-186`, reusing the same `OptionSelect` |
| Price display | `storefront/src/modules/products/components/product-price/index.tsx:6-58`, via `getProductPrice` (`storefront/src/lib/util/get-product-price.ts:30-79`) |

### States & edge cases
- Option groups are only rendered at all if `product.variants.length > 1` (`storefront/src/modules/products/components/product-actions/index.tsx:115`) — single-variant products never show a selector, consistent with the auto-select-on-mount behavior.
- **Variant matching is exact-equality on the full option keymap** (`isEqual(variantOptions, options)`, `storefront/src/modules/products/components/product-actions/index.tsx:54-58`) — there is no partial/best-effort matching. Selecting only one of two required options leaves `selectedVariant` undefined, not a "guessed" variant.
- Option buttons have no per-value disabled/out-of-stock indication — `OptionSelect` doesn't know about inventory at all (`storefront/src/modules/products/components/product-actions/option-select.tsx`); a user could select a combination matching a variant that's out of stock and only discover this via the Add to Cart button's "Out of stock" label after the fact, not via a disabled/struck-out option chip. (No code path here computes per-option-value availability based on remaining valid combinations.)
- All option buttons are disabled together via the `disabled`/`isAdding` props (e.g. while the real-time pricing `Suspense` boundary hasn't resolved, or while an add-to-cart request is in flight) — `storefront/src/modules/products/components/product-actions/index.tsx:126`.
- Price source differs by selection state: `variant ? variantPrice : cheapestPrice` (`storefront/src/modules/products/components/product-price/index.tsx:13-18`); only the variant-specific price omits the "From " prefix (`product-price/index.tsx:31`).

---

## Flow: Add to cart from PDP

### User steps
1. With a valid variant selected and in stock, user clicks "Add to cart."
2. Button enters a loading state (`isAdding`); options remain visible but become disabled during the request.
3. On success, button returns to normal state, quantity defaults to 1 per click (no quantity selector on the PDP — repeated clicks add additional units one at a time, as exercised by the e2e cart test).
4. If no variant is fully selected, the button is disabled and reads "Select variant" — clicking does nothing (`handleAddToCart` early-returns).
5. If the selected variant is out of stock (and backorders aren't allowed), the button is disabled and reads "Out of stock."
6. On mobile, the same logic is mirrored in a sticky bottom action bar; tapping "Select Options" opens a full-screen bottom-sheet modal containing just the option pickers (the modal itself has no Add to Cart button — the user closes it and uses the bottom bar's Add to Cart button instead).

### Component map
| Step | Component/file |
|---|---|
| Click handler | `handleAddToCart` — `storefront/src/modules/products/components/product-actions/index.tsx:97-109`; early-returns `null` if `!selectedVariant?.id` |
| Server action | `addToCart({ variantId, quantity: 1, countryCode })` — imported from `@lib/data/cart` (`storefront/src/modules/products/components/product-actions/index.tsx:14,102-106`); not read in full in this pass, see Open Questions |
| Stock computation | `inStock` memo — `storefront/src/modules/products/components/product-actions/index.tsx:69-90` |
| Button (desktop) | `storefront/src/modules/products/components/product-actions/index.tsx:138-151` |
| Button + bottom sheet (mobile) | `storefront/src/modules/products/components/product-actions/mobile-actions.tsx:98-127` (sticky bar, with Add to Cart at `:114-126`) and `:131-193` (options-only modal, no add-to-cart control inside it) |
| Visibility toggle for mobile bar | `useIntersection(actionsRef, "0px")` — `storefront/src/modules/products/components/product-actions/index.tsx:92-94`; mobile bar only shows when the desktop actions panel (`actionsRef`) has scrolled out of view (`show={!inView}`) |

### States & edge cases
- **Disabled conditions on the desktop button** (`storefront/src/modules/products/components/product-actions/index.tsx:140`): `!inStock || !selectedVariant || !!disabled || isAdding` — four independent reasons collapse into the same disabled visual state, but the label text only distinguishes "Select variant" vs "Out of stock" vs the loading spinner; it never explicitly surfaces the `disabled` prop's reason (used when the real-time-pricing fetch hasn't resolved yet) or shows a distinct error if `addToCart` itself fails (no try/catch around the `await addToCart(...)` call — an exception there would propagate as an unhandled promise rejection in a client component rather than showing user-facing error text, though `isAdding` would also never reset to `false` in that path since it's set after the `await`, leaving the button stuck on "loading" — **not independently verified against `addToCart`'s actual error behavior, see Open Questions**).
- **Stock logic precedence** (`storefront/src/modules/products/components/product-actions/index.tsx:69-90`): (1) if `manage_inventory` is false → always in stock; (2) else if `allow_backorder` → always in stock; (3) else if `manage_inventory` and `inventory_quantity > 0` → in stock; (4) otherwise → out of stock. No selectedVariant at all → `inStock` is `false` (the memo returns `false` by falling through, since none of the early-return conditions match `undefined`).
- Mobile bottom-sheet modal closes via an X button only (`storefront/src/modules/products/components/product-actions/mobile-actions.tsx:160-167`) — there's no Add to Cart button inside the modal itself, so completing a purchase on mobile always requires closing the option sheet first and tapping the persistent bottom-bar button.
- Quantity is hardcoded to `1` per add-to-cart call (`storefront/src/modules/products/components/product-actions/index.tsx:104`) — there's no PDP-level quantity stepper; multiple units require multiple clicks (this matches the e2e `cart.spec.ts` test pattern of calling `addProductButton.click()` twice to reach quantity 2).

---

## Flow: Search via modal

### User steps
1. User clicks "Search" (desktop nav link, gated behind `NEXT_PUBLIC_FEATURE_SEARCH_ENABLED`) or opens the hamburger "Menu" and taps "Search" (mobile/side menu — this is the path exercised by e2e tests, see below).
2. Both routes navigate to `/search`, which renders the `SearchModal` as an overlay (intercepting the underlying page — modal is not visually "blocking" the route stack, it's literally the page content of `/search`, but appears modal-styled and is closed via `router.back()`).
3. The search input auto-focuses on mount. As the user types, results update live (debounced by MeiliSearch's InstantSearch hook internals — exact debounce timing not verified).
4. Up to 6 results render in a grid (3 visible on mobile, 6 on `sm:` and up — the 4th-6th items get a `hidden sm:block` class).
5. Below the results, a "Showing the first N results / View all" link appears once there are more than 6 hits; clicking it navigates to `/results/[query]`.
6. If there are zero hits for a non-empty query, "No results found." renders instead.
7. Clicking a result navigates straight to its PDP.
8. The modal closes on: outside click (click on the backdrop ref), Escape key, or (per e2e test) a double mouse-click at the viewport's vertical midpoint on the left edge — closing always uses `router.back()`, returning the user to whatever page they opened search from (store, PDP, login page, etc. — verified to preserve the underlying page across all three in the e2e `search.spec.ts` "Closing the search page" test).

### Component map
| Step | Component/file |
|---|---|
| Route | `storefront/src/app/[countryCode]/(main)/search/page.tsx:1-5` — trivially renders `<SearchModal />` |
| Nav trigger (desktop) | `storefront/src/modules/layout/templates/nav/index.tsx:34-43`, gated by `process.env.NEXT_PUBLIC_FEATURE_SEARCH_ENABLED` |
| Nav trigger (side menu) | `storefront/src/modules/layout/components/side-menu/index.tsx:12-18,58-73` — `SideMenuItems.Search = "/search"`, not feature-flag-gated |
| Modal shell + close behavior | `storefront/src/modules/search/templates/search-modal/index.tsx:13-83` (outside-click `storefront/src/modules/search/templates/search-modal/index.tsx:18-22`, Escape `:42-48`, both call `router.back()`) |
| Search input | `storefront/src/modules/search/components/search-box/index.tsx` + `search-box-wrapper/index.tsx:32-93` (wraps InstantSearch's `useSearchBox`) |
| Results grid | `storefront/src/modules/search/components/hits/index.tsx:17-56` — slices to first 6 (`hits.slice(0, 6)`) |
| Result card | `storefront/src/modules/search/components/hit/index.tsx:22-50` |
| "Showing first N / View all / No results" | `storefront/src/modules/search/components/show-all/index.tsx:6-33` |
| Search client/index config | `storefront/src/lib/search-client.ts:1-11` |

### States & edge cases
- **Search backend is MeiliSearch, not Algolia.** `storefront/src/lib/search-client.ts` imports `instantMeiliSearch` from `@meilisearch/instant-meilisearch`, pointed at `NEXT_PUBLIC_SEARCH_ENDPOINT` (default `http://127.0.0.1:7700`) with `NEXT_PUBLIC_SEARCH_API_KEY` (default `test_key`) and index `NEXT_PUBLIC_INDEX_NAME` (default `products`). An Algolia variant is provided but **commented out** in the same file (`storefront/src/lib/search-client.ts:13-25`) as a manual swap-in option — confirms this boilerplate supports either, but ships wired to MeiliSearch by default.
- **Empty query**: `Hits` collapses to zero height/opacity (`max-h-0 opacity-0`) when `!query && !hits.length` (`storefront/src/modules/search/components/hits/index.tsx:30-33`) — so before typing anything, the results area is present in the DOM but visually collapsed, not unmounted.
- **Zero-hit empty state**: handled entirely in `ShowAll`, not `Hits` — `ShowAll` returns the "No results found." container only when `query !== ""` and `hits.length === 0` (`storefront/src/modules/search/components/show-all/index.tsx:11,14-23`). This is the state covered by e2e `search.spec.ts` ("An erroneous search returns an empty result," asserting `noSearchResultsContainer` visibility).
- **"View all" threshold is exactly >6 hits** (`storefront/src/modules/search/components/show-all/index.tsx:12`: `if (hits.length > 0 && hits.length <= 6) return null`) — between 1 and 6 hits, no "View all" link appears even though `/results/[query]` would show the same set.
- `ShowAll`'s mobile/desktop result-count copy ("first 6" vs "first 3") is computed from `window.innerWidth` read at render time (`storefront/src/modules/search/components/show-all/index.tsx:9`), not a responsive CSS-only solution and not reactive to resize (no resize listener) — a resize after initial render won't update the displayed count text, though the actual grid visibility (`hidden sm:block`) is CSS-driven and does respond correctly to viewport changes.
- Recovering from an empty search by typing a new query works without re-opening the modal (covered explicitly by e2e test "User can search after an empty search result").

---

## Flow: Search results page (`/results/[query]`)

### User steps
1. User arrives here either via the search modal's "View all" link, or directly via URL with a query string segment.
2. Sees a header bar: "Search Results for: {decoded query} ({count})" and a "Clear" link back to `/store`.
3. If there are hits, sees the same sort control + paginated grid pattern as other listing pages, but scoped to the specific product IDs MeiliSearch returned.
4. If there are zero hits, sees a plain "No results." text — no sort control, no grid, no pagination rendered at all in this case (unlike the store/category/collection listings, which always render an empty grid container without an explicit message).

### Component map
| Step | Component/file |
|---|---|
| Route | `storefront/src/app/[countryCode]/(main)/results/[query]/page.tsx:21-42` |
| Search call (server action) | `search(query)` — `storefront/src/modules/search/actions.ts:15-30`, `"use server"` directive; queries MeiliSearch directly via `searchClient.search([{params:{query}, indexName: SEARCH_INDEX_NAME}])`, extracts `hits`, and the route then maps `hits` to an `ids` array via `h.objectID \|\| h.id` (`page.tsx:27-31`) |
| Template | `storefront/src/modules/search/templates/search-results-template/index.tsx:17-61` |
| Grid (by explicit ID list) | shared `PaginatedProducts`, called with `productsIds={ids}` (`search-results-template/index.tsx:47-52`) → passed through to the Store API as `queryParams.id` (`storefront/src/lib/data/products.ts:44-46`) |

### States & edge cases
- **No region-scoping or pagination on the MeiliSearch call itself** — `search(query)` (`storefront/src/modules/search/actions.ts:15-30`) does not pass `region_id`, `limit`/`offset`, or any filter; it fetches MeiliSearch's default result set for the raw query string and the *storefront* re-resolves those IDs against the Store API (with region pricing) afterward via `PaginatedProducts`/`getProductsListWithSort`. This means: (a) the result count shown in the header (`ids.length`) reflects MeiliSearch's hit count, which could diverge from what actually renders if a hit's ID doesn't resolve to a sellable product in the current region (no reconciliation between the two counts was found); (b) there's no MeiliSearch-side pagination — the full ID list is fetched once, then `PaginatedProducts`/`getProductsListWithSort` does its own 100-item-cap-then-slice pass over **just those IDs** (same over-fetch/in-memory-sort pattern as the main store listing, see "Browse store listing" above, but bounded by however many IDs MeiliSearch returned for the query — which has its own default cap not inspected in this pass).
- **Query decoding**: header text uses `decodeURI(query)` (`storefront/src/modules/search/templates/search-results-template/index.tsx:32`) but the `search(query)` call inside `page.tsx:25` passes the raw (still URI-encoded) `params.query` straight to MeiliSearch — worth confirming MeiliSearch's query parser tolerates URI-encoded input correctly; not verified in this pass whether multi-word/special-character queries round-trip correctly through this split encode/decode handling.
- "Clear" always links to `/store`, not back to the previous page or an empty search modal (`storefront/src/modules/search/templates/search-results-template/index.tsx:35-40`).
- Zero-hit case renders no `RefinementList`/sort control at all (`ids.length > 0` gates the whole block, `search-results-template/index.tsx:43-57`) — meaning there's no way to keep the same query and just change sort order when there are no hits (moot, since there's nothing to sort, but also means the UI doesn't offer any next action besides "Clear").

---

## Flow: Empty search results

(Cross-references both search surfaces above — consolidated here since the task calls it out as a distinct flow.)

| Surface | Trigger condition | UI shown | Source |
|---|---|---|---|
| Search modal | `query !== "" && hits.length === 0` | "No results found." inside a `Container`, `data-testid="no-search-results-container"` | `storefront/src/modules/search/components/show-all/index.tsx:14-23` |
| `/results/[query]` page | `ids.length === 0` (i.e. zero MeiliSearch hits, computed server-side before render) | Plain "No results." text, no testid | `storefront/src/modules/search/templates/search-results-template/index.tsx:56` |
| `/store`, `/categories/*`, `/collections/*` | zero products returned for the current filter/page | **No explicit empty-state message** — grid renders with zero children, pagination is simply omitted (`totalPages > 1` check still holds since `totalPages` would be 0) | `storefront/src/modules/store/templates/paginated-products.tsx:69-90` |

This is a real inconsistency: search surfaces have explicit, tested empty states; product-listing surfaces (store/category/collection) do not, despite being reachable in the same "zero matches" situation (e.g. an empty category, or a collection with no products, or a sort/filter combination yielding nothing — though there's currently no filtering UI beyond sort, see Open Questions). No e2e coverage was found for an empty store/category/collection listing.

---

## Flow: Related products discovery

(Already detailed under "View product detail" above; summarized here as its own flow since the task lists it separately.)

### User steps
1. Scrolling to the bottom of a PDP, user sees a "Related products" section (heading: "You might also want to check out these products.") with a responsive grid (2/3/4 columns).
2. Clicking any related product card navigates to that product's own PDP, restarting this entire journey.
3. If no related products are found, the entire section is omitted — no heading, no empty-state message, nothing renders.

### Component map
| Step | Component/file |
|---|---|
| Container + Suspense | `storefront/src/modules/products/templates/index.tsx:57-64` — wrapped in `Suspense` with `SkeletonRelatedProducts` fallback |
| Logic | `storefront/src/modules/products/components/related-products/index.tsx:19-78` |
| Card | shared `ProductPreview` — `storefront/src/modules/products/components/product-preview/index.tsx` |

### States & edge cases
- Matching logic, in order of construction (`storefront/src/modules/products/components/related-products/index.tsx:30-44`): same `region_id`; same `collection_id` (as a single-element array — i.e. the API call only ever asks for one collection at a time, never a broader category/tag-driven cross-collection set); same `tags` (mapped from the current product's tags, if any — note `product.tags` isn't on the typed `HttpTypes.StoreProduct` interface and is accessed via a local `StoreProductWithTags` cast, `related-products/index.tsx:15-17,37`); and unconditionally `is_giftcard: false`.
- **If the product has no collection and no tags**, the query params reduce to just `region_id` + `is_giftcard: false` — i.e. related products would essentially become "any non-gift-card product in the region," which is a very loose fallback the comment at line 29 acknowledges ("edit this function to define your related products logic") — this is explicitly boilerplate/placeholder logic, not a curated recommendation engine.
- Self-exclusion happens **after** fetch, client/server-render-side, via `.filter(p => p.id !== product.id)` (`related-products/index.tsx:49-51`) rather than as an API-level exclusion — so the requested page from the Store API could already be "full" of unrelated items before this filter even runs, in a store with many products sharing the same collection.
- Contains the dead-code block noted earlier (`storefront/src/modules/products/components/related-products/index.tsx:25-27`) — a no-op `if (!region) { ... }` whose body declares an unused, shadowed `queryParams` and has no `return`/early-exit, so it has no actual effect on control flow.

---

## Open questions / things not fully verified

- **`addToCart` implementation** (`@lib/data/cart`, imported at `storefront/src/modules/products/components/product-actions/index.tsx:14`) was not read in this pass — its error handling (network failure, stock race condition between selection and submit, region/cart mismatch) is unverified. In particular, whether a failed `addToCart` call leaves `isAdding` stuck `true` (since `setIsAdding(false)` only runs after a successful `await`, with no `try/catch`/`finally`) was inferred from reading `product-actions/index.tsx:97-109` but not confirmed by reproducing a failure.
- **`sortProducts` utility** (`storefront/src/lib/util/sort-products.ts`) was referenced but not read in full — exact sort stability/tie-breaking behavior for `price_asc`/`price_desc` not verified.
- **MeiliSearch's own result cap/pagination defaults** for the `search(query)` server action (`storefront/src/modules/search/actions.ts`) were not verified — unclear how many hits MeiliSearch returns by default when no `limit` is specified in the query params, which bounds how many IDs ever reach `/results/[query]`'s `PaginatedProducts` call.
- **Region/currency consistency** between the MeiliSearch index and the Store API re-fetch on `/results/[query]`: since `search()` doesn't pass region context to MeiliSearch, and the index presumably isn't region-partitioned, it's unverified whether a product hit in MeiliSearch could fail to resolve via `getProductsListWithSort`'s region-scoped Store API call (e.g. a product not sold in the visiting region) — this would silently shrink the rendered grid below the header's reported count, but this divergence was not reproduced/confirmed.
- **`generateStaticParams`/ISR behavior**: which of these routes are actually statically generated vs. server-rendered per-request in production (Railway deploy) was inferred from the presence of `generateStaticParams` exports, not confirmed against the Next.js config (`next.config.js` not read in this pass) for `dynamicParams`/`revalidate` settings.
- **Server vs. client component boundaries**: generally inferred from the presence/absence of `"use client"` directives at the top of each file (explicitly checked for `product-actions`, `refinement-list`, `pagination`, `search-box-wrapper`, `search-modal`, `mobile-actions`, `side-menu` — all confirmed client components; templates/pages without the directive were treated as server components), but Next.js App Router's transitive client-boundary rules (e.g. a server component importing a client component is fine, but the reverse triggers a boundary) were not exhaustively re-derived for every file in this tree.
- **`NEXT_PUBLIC_FEATURE_SEARCH_ENABLED`** gates the desktop nav search link (`storefront/src/modules/layout/templates/nav/index.tsx:34`) but **not** the mobile/side-menu search link (`storefront/src/modules/layout/components/side-menu/index.tsx:15`) or the `/search` route itself — so even with the flag unset/false, `/search` and the side-menu entry point remain fully reachable. Whether this asymmetry is intentional (flag only meant to hide the desktop nav link specifically) or an oversight was not determinable from code alone.
- **Inventory race condition**: whether `inStock` (computed from data fetched once per `Suspense` resolution) can go stale during a long PDP visit (e.g. another customer depletes stock) before the user clicks Add to Cart — not verified; there's no polling/revalidation observed on the actions panel after initial load.
