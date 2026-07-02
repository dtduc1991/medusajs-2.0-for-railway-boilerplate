# Not Railway's managed "plugin" Postgres (this provider doesn't expose one) -
# a plain service deployed from Railway's own SSL-enabled Postgres image, the
# same image the managed offering uses under the hood. PGDATA is put in a
# subdirectory of the mount so Postgres's initdb doesn't choke on a freshly
# mounted volume's lost+found directory.
resource "random_password" "postgres" {
  length  = 24
  special = false
}

resource "railway_service" "postgres" {
  name         = "postgres"
  project_id   = railway_project.this.id
  source_image = "ghcr.io/railwayapp-templates/postgres-ssl:16"

  # DO NOT rename this volume (or its mount_path) once real data exists. The
  # railway provider's `volume.id` is computed-only - there's no way to pin
  # an existing volume by ID, only by name+mount_path - and changing `name`
  # does not rename the volume in place: it detaches the current one
  # (orphaning it, with all its data, but not deleting it) and creates a new
  # empty volume under the new name. This has already happened once (volume
  # went postgres-data -> pg-data across the "Added Terraform" -> "deploy
  # railway using terraform" commits), silently orphaning 49MB of seeded
  # data. If the volume ever needs to change, `terraform import` the target
  # volume into this resource instead of editing `name` in place.
  volume = {
    name       = "pg-data"
    mount_path = "/var/lib/postgresql/data"
  }
}

locals {
  postgres_url = "postgresql://${var.postgres_user}:${random_password.postgres.result}@postgres.railway.internal:5432/${var.postgres_db}"
}

resource "railway_variable_collection" "postgres" {
  environment_id = local.environment_id
  service_id     = railway_service.postgres.id

  variables = [
    { name = "POSTGRES_USER", value = var.postgres_user },
    { name = "POSTGRES_PASSWORD", value = random_password.postgres.result },
    { name = "POSTGRES_DB", value = var.postgres_db },
    { name = "PGDATA", value = "/var/lib/postgresql/data/pgdata" },
    { name = "DATABASE_URL", value = local.postgres_url },
  ]
}
