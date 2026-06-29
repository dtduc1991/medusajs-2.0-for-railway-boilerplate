# Handoff: Docker Compose setup for medusajs-2.0-for-railway-boilerplate

## Context

Repo: `medusajs-2.0-for-railway-boilerplate` (Medusa v2 backend + Next.js storefront, originally designed for Railway deployment). Task: create a docker-compose stack covering backend, storefront, postgres, meilisearch (redis added per user follow-up request), and make sure all services run cleanly end-to-end.

Status: **Done and verified working.** All 5 containers came up healthy and were smoke-tested (see "Verification performed" below). No outstanding bugs known at handoff time.

## Files created/changed (see these for exact content — not duplicated here)

- `docker-compose.yml` (repo root) — full stack definition
- `backend/Dockerfile`
- `backend/.dockerignore`
- `storefront/Dockerfile`
- `storefront/.dockerignore`

No other repo files were modified. Git status at handoff: these 5 files are new/untracked, nothing staged or committed.

## Key design decisions (non-obvious, worth knowing before touching this again)

1. **Backend runtime stage reuses the build stage as-is** (`FROM build AS runtime`), rather than copying just `.medusa/server` into a slim image. Reason: `pnpm start` runs `init-backend && cd .medusa/server && medusa start`, which needs the root `node_modules` (for the `medusajs-launch-utils` CLI / `init-backend` binary) *and* `.medusa/server` (which `postBuild.js` already installed prod deps into during the build). Splitting this into a separate slim runtime stage breaks the `cd .medusa/server` path. Image is bigger than ideal as a tradeoff for correctness.

2. **`backend/.dockerignore` deliberately keeps `.env`** in the build context (unlike a typical Dockerfile). Reason: `medusa-config.js` / `src/lib/constants.ts` call `assertValue()` on `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET` at import time, and `medusa build` imports the config — so the build stage needs *some* valid values present. The local (gitignored, not committed) `backend/.env` supplies them at build time; docker-compose's `environment:` block overrides the docker-network-specific ones (`DATABASE_URL`, `REDIS_URL`, `MEILISEARCH_HOST`, etc.) at runtime. `dotenv` doesn't override already-set `process.env` vars, so this layering is safe.

3. **Storefront does NOT build in the Dockerfile.** The `medusajs-launch-utils` launcher (`launch-storefront`) calls the *live* backend's `/key-exchange` endpoint to fetch `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` and bakes it into the Next.js build — both for the `build` and `start` commands. Since the backend isn't running at `docker build` time, the storefront Dockerfile's `CMD` runs `pnpm run build && pnpm start` at *container start*, after `depends_on: backend: condition: service_healthy`. Net effect: every `docker compose up` rebuilds the Next.js app (slow, ~80s) but is correct. A future optimization could cache `.next` across runs via a volume if rebuild time becomes annoying.

4. **`storefront` uses `network_mode: "service:backend"`** instead of its own network namespace. Reason: `NEXT_PUBLIC_MEDUSA_BACKEND_URL` is used both server-side (SSR, key-exchange fetch, runs inside the container) and client-side (baked into the browser bundle) — and both need to resolve to the same value. Sharing the backend container's network namespace means `http://localhost:9000` resolves correctly from both contexts. Consequence: ports 8000 (storefront) and 7700 (meilisearch, for browser-side search) had to be published on the `backend` service block, not on `storefront` — `ports:` is invalid on a service using `network_mode: "service:x"`.

5. **Two non-obvious bugs found and fixed during verification:**
   - Alpine containers resolve bare `localhost` to `::1` (IPv6) first; Meilisearch/Medusa's health endpoints only listen on IPv4, causing `wget --spider http://localhost:PORT/health` to fail with "connection refused" in healthchecks. Fixed by using `127.0.0.1` explicitly in both the `meilisearch` and `backend` healthcheck commands.
   - Postgres connection failed with `Error: The server does not support SSL connections` during `medusa db:migrate` — Medusa's pg/MikroORM driver defaults to attempting SSL for non-`localhost` hosts. Fixed by appending `?sslmode=disable` to the `DATABASE_URL` used inside docker-compose (`postgres://postgres:postgres@postgres:5432/medusa?sslmode=disable`).

## Verification performed

Ran the actual stack with Docker Desktop on Windows (had to start it manually first — it wasn't running). Confirmed:
- `docker compose build backend` and `docker compose build storefront` succeed.
- All 5 containers (`postgres`, `redis`, `meilisearch`, `backend`, `storefront`) reach `healthy`/running state via `docker compose ps`.
- Backend auto-ran migrations, seed script, and admin user creation on first boot (via `init-backend` from `medusajs-launch-utils`), and auto-fetched/synced the Meilisearch admin key into `.env`.
- `curl http://localhost:9000/health` → `200 OK`.
- `curl http://localhost:9000/app` (admin UI) → `200`.
- `curl http://localhost:9000/key-exchange` → returned a valid `publishableApiKey`.
- `curl -L http://localhost:8000/` (storefront) → `200` after region redirect (`/us`).

## Open items / things the user may want to revisit

- The user was looking at line 97 of `docker-compose.yml` (the `MEILI_MASTER_KEY` default fallback `masterKeyChangeMe123`) at handoff time — this and the Postgres default credentials (`postgres`/`postgres`) are dev-only placeholders. Flagged to the user already but not changed. If asked to harden this, move secrets into a root `.env` file (gitignored) referenced via `${VAR}` interpolation, or generate random defaults.
- No `.env.example`/root `.env` was created for the compose file itself — all docker-compose env vars currently have inline defaults (`${MEILI_MASTER_KEY:-masterKeyChangeMe123}`). Consider adding a root `.env` for clarity if the user wants this to be more "production-like."
- Storefront rebuild-on-every-start (~80s) is a known tradeoff, not yet optimized.
- Containers were left running at handoff (`docker compose up -d` for all 5 services). Not stopped/torn down.

## Suggested skills for the next session

- **`/code-review`** — worth running on the new `docker-compose.yml` + both `Dockerfile`s before committing, since this was written and self-validated in one pass without a second opinion.
- **`/security-review`** — the compose file currently bakes default credentials and a hardcoded Meilisearch master key as fallbacks; a security review would catch this formally if the user intends to commit/share this file.
- **`/simplify`** — the backend Dockerfile's "reuse build stage as runtime" approach trades image size for correctness; if image size becomes a concern later, revisit slimming it down (would need to untangle the `cd .medusa/server` assumption in `package.json`'s `start` script first).
