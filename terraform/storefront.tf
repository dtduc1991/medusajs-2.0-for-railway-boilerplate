resource "random_id" "storefront_domain" {
  byte_length = 3
  prefix      = "storefront-"
}

resource "railway_service" "storefront" {
  name               = "storefront"
  project_id         = railway_project.this.id
  source_repo        = var.github_repo
  source_repo_branch = var.github_branch
  root_directory     = "storefront"
  config_path        = "storefront/railway.json"
}

resource "railway_service_domain" "storefront" {
  environment_id = local.environment_id
  service_id     = railway_service.storefront.id
  subdomain      = random_id.storefront_domain.hex
}

locals {
  storefront_url = "https://${railway_service_domain.storefront.domain}"
}

resource "railway_variable_collection" "storefront" {
  environment_id = local.environment_id
  service_id     = railway_service.storefront.id

  variables = [
    { name = "PORT", value = "8000" },
    { name = "NEXT_PUBLIC_MEDUSA_BACKEND_URL", value = local.backend_url },
    { name = "NEXT_PUBLIC_BASE_URL", value = local.storefront_url },
    { name = "NEXT_PUBLIC_DEFAULT_REGION", value = var.storefront_default_region },
    # Read at runtime by server-only code (lib/config.ts, middleware.ts), not
    # inlined into the client bundle at build time, so it's safe to set here
    # as a plain runtime variable rather than a Dockerfile build ARG - see
    # storefront/Dockerfile.railway, which deliberately has no ARG for this.
    { name = "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", value = local.publishable_key },
  ]
}
