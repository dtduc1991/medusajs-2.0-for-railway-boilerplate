# Railway infrastructure as code

Provisions the whole stack from scratch in one `terraform apply`: a Railway
project, Postgres, Redis, and the `backend`/`storefront` services built from
this repo's GitHub source (matching the manual CLI-driven deploy documented in
[docs/railway.md](../docs/railway.md), but reproducible instead of one-off).

Per-service build/deploy settings (Dockerfile path, healthcheck, restart
policy) stay in `backend/railway.json` / `storefront/railway.json` - this
Terraform config only handles provisioning, topology, secrets, and env vars.

## Prerequisites

- `terraform` >= 1.5
- A Railway **account/workspace token**: create one at
  https://railway.app/account/tokens, then `export RAILWAY_TOKEN=...`
- The `dtduc1991/medusajs-2.0-for-railway-boilerplate` GitHub repo (or your
  fork, via `-var github_repo=...`) must be accessible to the Railway account
  the token belongs to (Railway's GitHub App needs repo access - connect it
  once at https://railway.app/account if you haven't).

## Usage

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # set admin_email at minimum
terraform init
terraform plan
terraform apply
```

`terraform apply` takes several minutes: it provisions Postgres/Redis, builds
and deploys the backend, waits (via polling retries) for the backend to boot
and self-seed (`init-backend` runs migrations + `seed.ts` on first boot), then
fetches the seeded store's publishable API key from the backend's
`/key-exchange` route and wires it into the storefront before that service's
final deploy.

**Known first-apply artifact**: the storefront's very first deployment attempt
happens before its publishable-key variable exists, so it will likely show as
a failed/crashed deployment in the Railway dashboard. The variable-set that
follows automatically triggers a second, successful redeploy (this is a
*runtime* env var, not baked into the Docker image, so no rebuild needed) -
check the dashboard a couple minutes after `apply` finishes if you want to
confirm the final state.

## Outputs

`terraform output` after apply gives you `backend_url`, `storefront_url`,
`admin_login_url`, `admin_email`, and (`-json` or `terraform output
admin_password`) the generated admin password.

## Not covered

- Meilisearch, MinIO - this mirrors the "core only" scope of the original CLI
  deploy (see docs/railway.md). Add services for these the same way if needed.
- Rotating secrets after the fact - re-running `apply` after changing a
  `random_password` resource's keepers (there are none set) won't rotate it;
  `terraform taint`/`-replace` the specific resource if you need to.
- Custom/apex domains - only Railway's generated `*.up.railway.app` subdomains
  are created (`railway_service_domain`). Use `railway_custom_domain` for a
  real domain if needed.
