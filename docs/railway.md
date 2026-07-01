# Handoff: First Railway deployment (CLI-driven)

## Context

Repo: `medusajs-2.0-for-railway-boilerplate` (Medusa v2.13.6 backend + Next.js 15 storefront), originally packaged as a one-click Railway deploy template — see repo name and the Railway-specific env-var fallbacks already baked into the code (`RAILWAY_PUBLIC_DOMAIN_VALUE` in [backend/src/lib/constants.ts](../backend/src/lib/constants.ts#L15), Railway-flavored comments in [storefront/.env.local.template](../storefront/.env.local.template)) before this session touched anything.

Task: write `railway.json` config-as-code files and actually deploy the app to Railway, driven end-to-end via the `railway` CLI (no prior Railway project existed for this repo). User explicitly chose: CLI-driven deploy (not dashboard clicks), "core only" scope — Postgres + Redis + backend + storefront, no Meilisearch, no MinIO.

Status: **Done and verified working end-to-end** (backend health/API, storefront pages, admin dashboard all confirmed live via `curl` at handoff time). **Not committed to git** — see "Open items" below.

## Railway project topology

One Railway project, 4 services, all in the `production` environment:

| Service | Type | Notes |
|---|---|---|
| `backend` | Dockerfile (`backend/Dockerfile`) | Medusa server, root dir `backend/` |
| `storefront` | Dockerfile (`storefront/Dockerfile.railway` — see below) | Next.js, root dir `storefront/` |
| `Postgres` | Railway-managed Postgres plugin | provides `DATABASE_URL` etc. |
| `Redis` | Railway-managed Redis plugin | provides `REDIS_URL` etc. |

Project name: `medusa-railway-boilerplate`. Deployed via `railway up <dir> --path-as-root --service <name>` from repo root (not a GitHub-connected deploy — see open items). Public domains generated with `railway domain --service <name> --port <port>`.

CLI setup used this session, for reference: `npm install -g @railway/cli` (no CLI pre-installed in this environment), `railway login` (interactive browser OAuth — a human has to do this once), then `railway init`, `railway add --database postgres|redis`, `railway add --service backend|storefront` (empty shells), `railway domain`, `railway variable set`, `railway up`.

## Files created/changed this session

- **[backend/railway.json](../backend/railway.json)** (new) — config-as-code: Dockerfile builder, `healthcheckPath: /health`, `ON_FAILURE` restart policy.
- **[storefront/railway.json](../storefront/railway.json)** (new) — config-as-code, points `dockerfilePath` at `Dockerfile.railway` (not the plain `Dockerfile` — see gotcha #3).
- **[backend/Dockerfile](../backend/Dockerfile)** — added `ARG`/`ENV` for `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET` in the `build` stage. See gotcha #1.
- **[storefront/next.config.js](../storefront/next.config.js)** — added `experimental.cpus: 1, workerThreads: false` to reduce `next build` memory pressure. Kept even though it alone did not fix the OOM (gotcha #3) — it's a harmless additional safety margin.
- **[storefront/Dockerfile.railway](../storefront/Dockerfile.railway)** (new, Railway-only, not used by docker-compose) — moves `next build` into the Docker image-build stage instead of container start. See gotcha #3 for why this exists as a *separate* file rather than editing `storefront/Dockerfile` in place.

## Gotchas found while deploying (read before repeating this)

### 1. Railway doesn't inject service variables into `docker build`, only into the runtime container

First backend deploy attempt failed with a confusing error:
```
TypeError: Cannot read properties of null (reading 'admin')
    at ConfigManager.loadConfig (.../config.ts:199:28)
```
Root cause: `medusa build` (run inside `RUN pnpm build` in the Dockerfile's `build` stage) imports `medusa-config.js`, which imports [backend/src/lib/constants.ts](../backend/src/lib/constants.ts), which calls `assertValue(process.env.DATABASE_URL, ...)` and throws if unset. `@medusajs/utils`'s `getConfigFile()` ([node_modules/.../get-config-file.js](../backend/node_modules/.pnpm/@medusajs+utils@2.13.6_@types+node@20.19.25_express@4.22.1/node_modules/@medusajs/utils/dist/common/get-config-file.js)) silently swallows that thrown error into `{ configModule: null, error: e }` without logging it (`configLoader`'s `throwOnError` is `false` for build commands), and `ConfigManager.loadConfig` then crashes trying to read `.admin` off `null` — the *real* error (missing env var) never appears in the logs. If this exact null/admin crash recurs, suspect a missing required env var during a Docker build step, not an actual bug in `medusa-config.js`.

Fix: declared `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET` as `ARG`+`ENV` in `backend/Dockerfile`'s `build` stage. Railway auto-populates `ARG`s that share a name with a service variable — no need to pass `--build-arg` manually.

### 2. Generated domain port must match the port the process actually listens on — Railway does not enforce this for you

`railway domain --service X --port N` just configures the proxy; nothing validates that the container actually binds to port `N`. Both services initially bound to a different port than their domain:
- Backend: logged `Server is ready on port: 8080` even though the domain was created with `--port 9000` and no `PORT` var was set (visible in `railway variable list`). Fixed by explicitly setting `PORT=9000`.
- Storefront: `launch-storefront`'s bin script (`bin/launchStorefront.js`) reads `process.env.PORT || '8000'` — same story, fixed by explicitly setting `PORT=8000`.

Where the ambient `8080` came from isn't fully confirmed (not visible via `railway variable list`, so likely a platform-injected value invisible to the variables API) — but the takeaway is: **always explicitly set `PORT` to match whatever port you passed to `railway domain`**, don't rely on defaults.

### 3. Storefront OOM-crashed building `next build` at container start — Railway's default runtime memory limit is too small

`storefront/Dockerfile`'s existing design deliberately runs `next build` at **container start** (`CMD ["sh", "-c", "pnpm run build && pnpm start"]`), not at image-build time, because in local docker-compose the backend container isn't up yet when the storefront *image* builds (images build before any container starts) — the storefront build needs to fetch a live publishable API key from the backend first.

On Railway this repeatedly OOM-crashed:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```
consistently around 440-490MB across multiple attempts — a hard ceiling, not a fluke, and not fixable by reducing V8/webpack parallelism (tried `experimental.cpus: 1, workerThreads: false` in `next.config.js` — no change, crashed at the same ceiling). This points to Railway's default per-service runtime memory limit (trial/free tier is commonly 512MB) being too small for a Next.js 15 production build, which this CLI session has no ability to raise (no `railway service scale`-equivalent for memory; that's a dashboard/plan setting).

Fix actually applied: **`storefront/Dockerfile.railway`**, a Railway-only variant that moves `next build` into the Docker **image-build** stage (via `RUN npm run build`, which already resolves to `wait && launcher build` per `storefront/package.json`), using `ARG`s for `NEXT_PUBLIC_MEDUSA_BACKEND_URL` etc. so Railway can inject the already-deployed backend's real public URL at build time. This works *specifically because* on Railway the backend is deployed and publicly reachable before the storefront image builds (unlike local docker-compose) — and because Railway's build machines have far more RAM than the runtime container's memory limit. `storefront/railway.json`'s `build.dockerfilePath` points at this file instead of the plain `Dockerfile`, which is left untouched for local docker-compose use.

If Railway's runtime memory limit for the storefront service is raised later (dashboard → service → Settings → Resources, likely needs a paid plan), it would become possible to revert to the original `storefront/Dockerfile` and delete `Dockerfile.railway` + the `railway.json` override — but there's no strong reason to; building once at image-build time is strictly better (faster container starts, no repeated key-fetch/build cost per restart).

### 4. Admin dashboard baked in `http://localhost:9000` — same missing-build-ARG problem as gotcha #1, different variable

After the first "successful" backend deploy, admin login at `/app` failed in the browser with a generic **"Failed to fetch"** error (not a visible CORS or 4xx/5xx error — the request never left the browser meaningfully, since it was targeting an unreachable/mixed-content URL). Root cause: `medusa build` compiles the admin dashboard into a static JS bundle with `admin.backendUrl` (from `medusaConfig.admin.backendUrl` in `backend/medusa-config.js`, which reads the `BACKEND_URL` constant) **baked in at build time**. `BACKEND_PUBLIC_URL` was not declared as a Docker build `ARG` (only `DATABASE_URL`/`JWT_SECRET`/`COOKIE_SECRET` were, per gotcha #1), so at build time `BACKEND_URL` fell back to `http://localhost:9000` ([backend/src/lib/constants.ts](../backend/src/lib/constants.ts#L15)) and got compiled directly into the shipped JS (confirmed via `curl .../app/assets/index-*.js | grep -c "localhost:9000"` → 2 matches, 0 matches for the real domain). The server's own runtime config was correct the whole time (`BACKEND_PUBLIC_URL` **is** a runtime service variable) — this bug only affected the pre-built static admin bundle, which is why `curl`-ing the backend's own API endpoints directly always worked fine and gave no hint anything was wrong.

Fix: added `BACKEND_PUBLIC_URL` as an `ARG`/`ENV` in `backend/Dockerfile`'s `build` stage alongside the other three, redeployed. Verified fixed by re-`curl`-ing the new JS bundle (0 occurrences of `localhost:9000`, 2 of the real Railway domain).

**Lesson for next time**: any env var read by `medusa-config.js` (directly or via `backend/src/lib/constants.ts`) that affects **build-time-compiled output** (currently: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET` for config loading to not silently crash, plus `BACKEND_PUBLIC_URL` for the admin bundle) needs a matching Dockerfile `ARG`. If a future admin-facing "Failed to fetch" or similarly inexplicable browser-only failure shows up despite the backend's API responding fine to direct `curl`/Postman requests, suspect a stale/wrong value baked into the admin JS bundle first — check by grepping the compiled bundle for the expected domain, same as this session did.

## Environment variables set (names only — actual secret values live in Railway, not reproduced here)

**backend** service: `NODE_ENV=production`, `DATABASE_URL` (Railway variable reference `${{Postgres.DATABASE_URL}}`), `REDIS_URL` (`${{Redis.REDIS_URL}}`), `BACKEND_PUBLIC_URL`, `ADMIN_CORS`, `AUTH_CORS`, `STORE_CORS` (all set to the actual generated domains), `JWT_SECRET`, `COOKIE_SECRET` (random, generated this session), `MEDUSA_ADMIN_EMAIL`, `MEDUSA_ADMIN_PASSWORD` (random, generated this session), `PORT=9000`.

**storefront** service: `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL` (generated domains), `NEXT_PUBLIC_DEFAULT_REGION=gb` (deliberately **not** `us` — see below), `PORT=8000`.

To retrieve actual values: `railway variable list --service backend --json` (or `storefront`), from within this linked project directory.

### Why `gb`, not `us`

Known open issue from [docs/sessions/002](sessions/002-e2e-playwright-headed-against-docker-compose.md) and [004](sessions/004-fix-customer-auth-headers-and-rerun-e2e.md): `backend/src/scripts/seed.ts` only provisions a `eur`/Europe region (countries `gb, de, dk, se, fr, es, it`), no `us`/`usd` region exists. The docker-compose file sets `NEXT_PUBLIC_DEFAULT_REGION=us` anyway, which is wrong/unused there too. This deploy used `gb` (first seeded country) so the storefront's region-resolution middleware actually finds a valid region instead of silently failing over.

## Verification performed

```
curl https://backend-production-88f56.up.railway.app/health          → 200
curl https://backend-production-88f56.up.railway.app/key-exchange    → {"publishableApiKey":"pk_..."}
curl https://backend-production-88f56.up.railway.app/app             → 200 (admin dashboard)
curl https://backend-production-88f56.up.railway.app/store/products  → seeded products returned
curl https://storefront-production-4524.up.railway.app/              → 307 redirect to /gb
curl https://storefront-production-4524.up.railway.app/gb            → 200
```
Backend's `init-backend` step (via `medusajs-launch-utils`) ran migrations, seeded the DB, and created the admin user automatically on first boot — confirmed via deploy logs ("Database seeded and admin user created successfully").

## Open items / what the next agent should do

1. **Nothing committed yet.** `git status` at handoff shows `backend/Dockerfile` and `storefront/next.config.js` modified, `backend/railway.json`, `storefront/railway.json`, `storefront/Dockerfile.railway` untracked. User was asked whether to commit; check chat history / ask again if picking this up cold.
2. **No GitHub auto-deploy configured.** Both services were deployed via one-off `railway up` (local upload), not connected to the `dtduc1991/medusajs-2.0-for-railway-boilerplate` GitHub repo. Future pushes to `main` will **not** auto-deploy. To wire this up: `railway service source connect --repo dtduc1991/medusajs-2.0-for-railway-boilerplate --branch main --service backend` (and again `--service storefront`) — note this was not tested this session, and it's unclear whether Railway's GitHub-connected build path respects a per-service root directory the same way `--path-as-root` did locally; verify before assuming it "just works."
3. **Rotate the generated admin password and JWT/cookie secrets** before treating this as anything beyond a first smoke-test deploy — they were auto-generated by this session and surfaced once in chat, not treated as long-term production secrets.
4. **No Meilisearch, no MinIO** — search is disabled, and uploaded product images use local disk storage inside the backend container, which will **not persist across redeploys** (Railway's filesystem is ephemeral, no volume was attached to `backend`'s `static` dir on Railway, unlike the docker-compose setup which has a `backend_uploads` named volume). Add MinIO (there's a Railway one-click MinIO template) if persistent uploads matter.
5. **Storefront's `Dockerfile.railway` divergence from `Dockerfile` is now a maintenance surface** — any future change to `storefront/Dockerfile` (base image bump, dependency install step, etc.) should probably also be applied to `Dockerfile.railway`, since they're two independent files now, not one shared source. Worth revisiting whether to consolidate (e.g. a single Dockerfile with a build ARG toggling build-time vs. start-time `next build`) if this divergence becomes annoying.
6. **`backend/railway.json`'s `healthcheckPath: /health` has no storefront equivalent** — the storefront service currently has no healthcheck configured at all, meaning Railway marks a deploy "SUCCESS" as soon as the container starts, even if `next start` hasn't finished booting yet (this is exactly what caused confusing 502s while polling during this session — the deploy was already "SUCCESS" while the app was still starting). Consider adding a healthcheck path once the storefront exposes one, or at least a longer `healthcheckTimeout`.

## Suggested skills for the next session

- **`/code-review`** on `backend/Dockerfile` / `storefront/Dockerfile.railway` before committing — Dockerfile ARG/ENV plumbing is easy to get subtly wrong (e.g. forgetting an ARG when adding a new required env var later).
