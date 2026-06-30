# medusajs-2.0-for-railway-boilerplate

Monorepo: a MedusaJS 2.0 commerce backend + a Next.js storefront, originally packaged as a one-click Railway deploy template. Two independent npm/pnpm projects (`backend/`, `storefront/`) wired together for local dev via `docker-compose.yml` at the repo root.

## Repo layout

```
backend/      Medusa 2.13.6 server (API, admin dashboard, modules, workflows)
storefront/   Next.js 15 / React 19 storefront (App Router) + Playwright e2e
docs/         Hand-written research/handoff docs from past agent sessions (see below)
docker-compose.yml   postgres + redis + meilisearch + backend + storefront, for local e2e
```

## `docs/` — read before re-deriving things

This repo accumulates agent research/handoff docs instead of losing that context between sessions. **Check here first** before re-exploring something that may already be documented:

- `docs/sessions/` — numbered handoff docs in chronological order (001 docker-compose setup, 002 e2e baseline, 003 promotions module research, 004 customer-auth-header bugfix). Each ends with "Open items" for the next agent — check the latest one before starting infra/e2e work.
- `docs/flows/` — storefront user-journey deep dives grounded in actual code (checkout, cart/promotions, browse/search/PDP), each with file:line references and a "States & edge cases" section calling out real bugs found (not hypothetical).
- `docs/research/` — standalone technical research (e.g. `@medusajs/loyalty-plugin` gift-card data model — **not installed** in this repo; gift card e2e tests are skipped because v2 core has no gift-card concept).

Known open issues called out in these docs (verify currency before acting):
- `storefront` checkout/discount e2e specs expect a `us`/`usd` region but `backend/src/scripts/seed.ts` only seeds `eur`/Europe — blocks several checkout/discount tests.
- `docker-compose.yml`'s `storefront` service shares the `backend` container's network namespace (`network_mode: "service:backend"`); if `backend` restarts, `storefront` can hang waiting on a stale connection — fix is `docker compose restart storefront`, not a rebuild.
- Several `chromium auth` e2e specs (`address.spec.ts`, `orders.spec.ts`, `profile.spec.ts`) only started running after a 2026 auth-header bugfix and have pre-existing failures of their own, not yet triaged.

## Backend (`backend/`)

Medusa core `2.13.6` (`@medusajs/framework`, `@medusajs/medusa`), Node `22.x`, pnpm `9.10.0`. Config in `backend/medusa-config.js`.

**Scripts** (run from `backend/`):
- `pnpm dev` — `medusa develop`, hot-reload server + admin dashboard at `localhost:9000/app`
- `pnpm ib` — `init-backend`: runs migrations + seeds DB (`backend/src/scripts/seed.ts`) — needed once against any fresh database
- `pnpm build && pnpm start` — compile and run from `.medusa/server` (mirrors production/Railway behavior; useful for reproducing cloud-only bugs)
- `pnpm seed` — re-run just the seed script
- `pnpm email:dev` — react-email template preview server on port 3002

**Source layout** (`backend/src/`):
- `api/` — custom REST routes. Currently minimal: `admin/custom`, `store/custom`, `key-exchange` (resolves the default "Webshop" publishable API key)
- `modules/` — custom Medusa modules: `email-notifications` (Resend provider + react-email templates), `minio-file` (MinIO S3-compatible file storage provider, auto-creates the `medusa-media` bucket). Each has its own README.
- `workflows/`, `subscribers/`, `jobs/` — multi-step business logic, event handlers (e.g. order-placed), scheduled tasks
- `admin/` — admin dashboard widget/page customizations
- `scripts/` — `seed.ts` (seed data: EU region, `manual_manual` fulfillment, `pp_system_default` payment provider — no US region, no Stripe/PayPal seeded by default), `postBuild.js`

**Conditionally-activated modules** (gated on env vars present in `medusa-config.js`): MinIO file storage (`MINIO_*`) vs. local fallback; Redis-backed event bus/workflow engine (`REDIS_URL`) vs. simulated fallback; SendGrid or Resend notifications; Stripe payments (`STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET`); Meilisearch plugin (`MEILISEARCH_HOST` + key).

No backend test suite is currently wired up (Jest is a devDependency, `@medusajs/test-utils` present, but no test script/config exists yet) — testing for this repo currently lives in the storefront's Playwright e2e suite, which exercises the backend through the storefront.

## Storefront (`storefront/`)

Next.js `15.5.x` App Router, React `19`, `@medusajs/js-sdk` (preview), Tailwind (`@medusajs/ui-preset`).

**Scripts** (run from `storefront/`):
- `npm run dev` — waits for backend on `:9000`, then launches dev server (hot reload)
- `npm run build` / `npm run start` — same backend-wait pattern, then build/start
- `npm run test-e2e` — `playwright test e2e`
- `npm run lint` — `next lint`

**Routing** (`storefront/src/app/`): locale-prefixed via `[countryCode]`, split into two route groups — `(main)` (browse/cart/account/search/etc.) and `(checkout)` (the single-page checkout flow). `storefront/src/middleware.ts` resolves region from the URL or request headers and redirects accordingly (1h region-map cache).

**Source layout** (`storefront/src/`):
- `modules/` — one folder per feature area: `account`, `cart`, `checkout`, `products`, `store`, `search`, `order`, `layout`, `home`, `collections`, `categories`, `common`, `skeletons`
- `lib/data/` — server-only data-fetching functions wrapping the Medusa JS SDK (`cart.ts`, `customer.ts`, `orders.ts`, `products.ts`, `regions.ts`, etc.) — this is the layer where the auth-header bug in `docs/sessions/004-fix-customer-auth-headers-and-rerun-e2e.md` lived (un-awaited `getAuthHeaders()`/`setAuthToken()`; watch for this pattern when adding new server actions here)
- `lib/context/`, `lib/hooks/`, `lib/util/` — modal context, shared hooks, formatting/comparison utilities

**E2E tests** (`storefront/e2e/`, Playwright): `tests/public/` (cart, checkout, discount, login, register, search, giftcard[skipped]) and `tests/authenticated/` (address, orders, profile — require the `setup` project's global login to pass first). Run against a real running backend (no mocking) — typically the docker-compose stack. `playwright.config.ts` reuses an already-running server at `NEXT_PUBLIC_BASE_URL`.

**Env vars**: `storefront/check-env-variables.js` enforces `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` at startup. Template at `storefront/.env.local.template` — copy to `.env.local`. A running backend on port 9000 is required before the storefront will build/run.

## Local dev (docker-compose)

`docker-compose.yml` brings up postgres, redis, meilisearch, backend, and storefront together — this is the setup used for e2e runs against a full stack, distinct from each app's own `dev` script. `backend` and `storefront` share a network namespace (see "Known open issues" above). Requires `backend/.env` (copied from `.env.template`).
