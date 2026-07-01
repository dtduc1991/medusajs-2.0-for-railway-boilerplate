resource "random_id" "backend_domain" {
  byte_length = 3
  prefix      = "backend-"
}

resource "railway_service" "backend" {
  name               = "backend"
  project_id         = railway_project.this.id
  source_repo        = var.github_repo
  source_repo_branch = var.github_branch
  root_directory     = "backend"
  config_path        = "backend/railway.json"
}

resource "railway_service_domain" "backend" {
  environment_id = local.environment_id
  service_id     = railway_service.backend.id
  subdomain      = random_id.backend_domain.hex
}

locals {
  backend_url = "https://${railway_service_domain.backend.domain}"
}

resource "railway_variable_collection" "backend" {
  environment_id = local.environment_id
  service_id     = railway_service.backend.id

  variables = concat([
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "9000" },
    { name = "DATABASE_URL", value = local.postgres_url },
    { name = "REDIS_URL", value = local.redis_url },
    { name = "BACKEND_PUBLIC_URL", value = local.backend_url },
    { name = "ADMIN_CORS", value = local.backend_url },
    { name = "AUTH_CORS", value = local.backend_url },
    { name = "STORE_CORS", value = local.storefront_url },
    { name = "JWT_SECRET", value = random_password.jwt_secret.result },
    { name = "COOKIE_SECRET", value = random_password.cookie_secret.result },
    { name = "MEDUSA_ADMIN_EMAIL", value = var.admin_email },
    { name = "MEDUSA_ADMIN_PASSWORD", value = random_password.admin_password.result },
    ], var.resend_api_key != "" ? [
    { name = "RESEND_API_KEY", value = var.resend_api_key },
    { name = "RESEND_FROM_EMAIL", value = var.resend_from_email },
  ] : [])

  depends_on = [
    railway_variable_collection.postgres,
    railway_variable.redis_url,
  ]
}

# Backend must be up and seeded (init-backend runs migrations + seed on first
# boot, see backend/src/scripts/seed.ts) before the storefront can fetch a
# publishable API key from it - see storefront.tf. Retries absorb the image
# build + migrate + seed time on first deploy.
data "http" "publishable_key" {
  url = "${local.backend_url}/key-exchange"

  retry {
    attempts     = 40
    min_delay_ms = 10000
    max_delay_ms = 20000
  }

  depends_on = [
    railway_variable_collection.backend,
    railway_service_domain.backend,
  ]
}

locals {
  publishable_key = jsondecode(data.http.publishable_key.response_body).publishableApiKey
}
