# Unauthenticated, matching this repo's own docker-compose.yml precedent
# (redis://redis:6379, no password) - Railway's private network isn't
# publicly reachable, and this provider's railway_service resource has no
# way to override the image's start command to add --requirepass anyway
# (config_path/root_directory, the only route to a custom start command via
# railway.json, conflicts with source_image).
resource "railway_service" "redis" {
  name         = "redis"
  project_id   = railway_project.this.id
  source_image = "redis:7-alpine"

  volume = {
    name       = "redis-data"
    mount_path = "/data"
  }
}

locals {
  redis_url = "redis://redis.railway.internal:6379"
}

resource "railway_variable" "redis_url" {
  environment_id = local.environment_id
  service_id     = railway_service.redis.id
  name           = "REDIS_URL"
  value          = local.redis_url
}
