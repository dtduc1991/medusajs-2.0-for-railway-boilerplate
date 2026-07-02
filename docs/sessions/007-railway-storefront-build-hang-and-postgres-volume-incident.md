# Handoff: Fixed storefront build hang (missing Terraform vars) + a live Postgres volume incident that had the backend serving from an empty database

## Context

Repo: `medusajs-2.0-for-railway-boilerplate`. Follow-up to the Terraform work in [railway.md](../railway.md) (which documents the original CLI-driven deploy) — this session is the first to run against the **Terraform-managed** deployment introduced by commits `fe64104` ("Added Terraform") and `25f0ed4` ("deploy railway using terraform"), neither of which is covered by `docs/railway.md` (that doc predates Terraform entirely).

Task started as "check storefront logs in Railway for build errors" and escalated into a live production incident: the backend's Postgres service was found running against a completely empty volume, with the real seeded data orphaned on detached volumes (one scheduled for auto-deletion within 48 hours).

Status: **Both issues fixed and verified.** Root cause of the Terraform-tracked part is understood and documented in `terraform/postgres.tf`. One part of the incident (a volume swap that happened *outside* any tracked `terraform apply`) remains unexplained — see Open items.

## Issue 1: storefront stuck "Failed" — missing Terraform variable collection

`railway status` showed `storefront: ● Failed`. `railway logs --service storefront --build` showed no compile error — it was hung indefinitely on:

```
[INFO] Waiting for a medusajs backend to be available on http://localhost:9000/key-exchange... Elapsed time: 1181 seconds
```

Root cause: `storefront/Dockerfile.railway`'s `RUN npm run build` invokes `medusajs-launch-utils`'s `await-backend` step (`storefront/node_modules/.../bin/awaitBackendReady.js`), which reads `NEXT_PUBLIC_MEDUSA_BACKEND_URL` and falls back to `http://localhost:9000` if unset — a URL that's never reachable inside a Railway build container. `railway variables --service storefront --kv` showed **only** Railway's auto-injected `RAILWAY_*` vars; none of the app vars (`NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `PORT`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`) were present.

Cause: `terraform/storefront.tf`'s `railway_variable_collection.storefront` resource had never actually been applied — absent from `terraform/terraform.tfstate` entirely (only `backend` and `postgres` variable collections existed there), despite `terraform plan` showing it as a clean 1-resource add with no other diffs.

Fix: `terraform apply` (needs `RAILWAY_TOKEN` exported — not present in this environment by default, user supplied one from https://railway.app/account/tokens for this session only). Creating the variable collection auto-triggered a new storefront build/deploy, which completed successfully. Verified via `curl`: `GET /` → 307 to `/gb`, `GET /gb` → 200.

## Issue 2: backend serving 500s from an empty database (found while re-checking storefront runtime logs)

`railway logs --service storefront` (runtime, not build) showed opaque production Next.js errors (`Error setting up the request: An unknown error occurred`, digest-only, no message text since it's a minified prod build). Traced upstream: `curl`-ing the backend's own `/store/products` and `/store/regions` directly also returned `500 {"code":"unknown_error", ...}`.

`railway logs --service backend` showed the real error:

```
Connection Error: Connection ended unexpectedly
Connection Error: Connection ended unexpectedly
[ERRO] select ... from "api_key" ... - relation "api_key" does not exist
```

— starting at `2026-07-02T05:48:47Z`, every request failed identically. `relation does not exist` on a table that must exist for the app to function at all means the backend was talking to an **unmigrated/empty** database, not a query bug.

`railway volume list --json` explained it:

| Volume | ID | Size | Attached to | Notes |
|---|---|---|---|---|
| `postgres-data` | `e5ab7781-9d0c-4d5d-804d-8fe53fd7425d` | 49MB | N/A (detached) | `isPendingDeletion: true`, `deletedAt: 2026-07-04T01:32:14Z` |
| `pg-data` | `f09552e2-4502-4d31-b013-a0e6fe948dee` | 97MB | N/A (detached) | matches `terraform.tfstate`'s recorded volume for `railway_service.postgres` exactly |
| `postgres-volume` | `09daac72-753d-4a30-96a8-33b850267d42` | 0MB | **`postgres`** (live) | empty, not in Terraform state at all |
| `redis-data` | — | 49MB | `redis` | unaffected, fine |

The live `postgres` service was attached to the empty `postgres-volume`, while the two volumes with real data sat orphaned — one of them two days from permanent deletion.

### Root cause (confirmed)

```diff
# fe64104 "Added Terraform" → 25f0ed4 "deploy railway using terraform", terraform/postgres.tf
resource "railway_service" "postgres" {
  volume = {
-   name       = "postgres-data"
+   name       = "pg-data"
    mount_path = "/var/lib/postgresql/data"
  }
}
```

Checked the provider schema (`terraform providers schema -json`, `terraform-community-providers/railway` ~> 0.6): `railway_service.volume.id` is **computed-only** — there is no way to pin/adopt an existing volume by ID via this attribute, only by `name` + `mount_path`. When `name` changed between those two commits, the provider did not rename the volume in place; it detached the old one (orphaning `postgres-data` with all its data, but not deleting it — Railway does not auto-delete detached volumes immediately, it schedules them, hence the 2-day countdown found on `postgres-data`) and created a brand-new empty volume under the new name (`pg-data`), which then received fresh migrations/seed data over subsequent use (explaining its 97MB, larger than `postgres-data`'s 49MB — more accumulated usage before or after this session's checkout e2e testing per [006](006-verify-railway-checkout-order-in-db-and-logs.md)).

**This explains generation 1 → 2 (`postgres-data` → `pg-data`) fully.** It does **not** explain generation 2 → 3 (`pg-data` → the empty `postgres-volume` found live at the start of this session) — no further commit touches `terraform/postgres.tf` after `25f0ed4`, and both `terraform.tfstate` and `terraform.tfstate.backup` already recorded `pg-data` as the tracked volume before this session's own `terraform apply` ran (which only added `railway_variable_collection.storefront`, confirmed via `terraform plan`'s "1 to add, 0 to change, 0 to destroy"). This session's own actions did not cause the 2→3 swap — it was already in that state when investigation started. Likely a manual Railway dashboard action or a CLI session outside this repo's Terraform, but unconfirmed — see Open items.

### Fix applied

```bash
railway volume detach -v 09daac72-753d-4a30-96a8-33b850267d42 -y --json   # detach empty postgres-volume
railway volume --service bc7f7f7e-50f9-4308-8e67-be561321bb6d attach -v f09552e2-4502-4d31-b013-a0e6fe948dee -y --json  # attach pg-data (matches terraform state)
```

Note the `volume attach` CLI subcommand's `--service` flag must be passed **before** the subcommand (`railway volume --service <id> attach ...`, not `railway volume attach --service ...`), and needs the actual service ID, not the name (`postgres` as a bare name was rejected with "The service linked/provided doesn't exist").

Verified via direct `curl` against the backend (`/store/regions` returned the real seeded Europe region with all 7 countries; `/store/products` returned the real seeded catalog e.g. "Medusa Shorts") and against the storefront (`GET /gb` → 200, page HTML contains real product names like "Sweatshirt", no error boundary markers).

Added a warning comment directly in [terraform/postgres.tf](../../terraform/postgres.tf) documenting this exact gotcha, so a future edit to `volume.name`/`mount_path` doesn't repeat it silently.

## Open items / what the next agent should do

1. **Unexplained 2→3 volume swap.** `pg-data` → empty `postgres-volume` happened outside any `terraform apply` tracked in this repo's git history or state files. Check Railway's dashboard project activity/audit log for the `postgres` service (`bc7f7f7e-50f9-4308-8e67-be561321bb6d`) around whatever time gap makes sense — not narrowed down this session.
2. **No remote Terraform state backend.** `terraform/versions.tf` has no `backend` block — state is a local file. `railway list` shows **three** projects all named `medusa-railway-boilerplate` in this account/workspace; only `49ffc893-2f78-4506-83d5-eb950df80647` is the live one this session worked against (confirmed by domains matching `backend-b0c498...`/`storefront-86798e...`). This is consistent with more than one machine/session having run `terraform apply` against this config with no shared state, each creating an independent duplicate project. If more than one person applies this Terraform, set up a shared remote backend (Terraform Cloud, or an S3-compatible one) before it happens again — not done this session, out of scope for what was asked.
3. **`postgres-data` volume (49MB, id `e5ab7781-9d0c-4d5d-804d-8fe53fd7425d`) is still scheduled to auto-delete `2026-07-04T01:32:14Z`.** It predates `pg-data` and is very likely fully superseded (smaller, older), but wasn't diffed against `pg-data`'s contents before this session ended — if you want certainty before it's gone, attach it to a throwaway service and query it, or just let it expire. Also worth checking whether it's the *same* volume as the original CLI-only deploy documented in `docs/railway.md`, or a separate one — not confirmed either way.
4. **Empty `postgres-volume` (id `09daac72-753d-4a30-96a8-33b850267d42`) is now detached and unused.** Safe to delete once confident `pg-data` is the correct permanent volume (it has been serving real traffic successfully since the fix, no further action needed unless you want to tidy up).
5. **Rotate the Railway API token** used this session — it was pasted directly into chat by the user to unblock `terraform apply` (no `RAILWAY_TOKEN` was present in the environment beforehand). Treat it as compromised.
6. Consider whether Postgres migrations/seed should be re-verified against `pg-data` beyond the spot-check done here (regions + one product page) — e.g. re-run session [006](006-verify-railway-checkout-order-in-db-and-logs.md)'s order-verification steps if there's any doubt real orders/customers survived the volume churn.
