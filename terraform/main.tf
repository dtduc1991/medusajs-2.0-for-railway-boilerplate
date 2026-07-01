resource "railway_project" "this" {
  name = var.project_name
}

locals {
  environment_id = railway_project.this.default_environment.id
}

resource "random_password" "jwt_secret" {
  length  = 40
  special = false
}

resource "random_password" "cookie_secret" {
  length  = 40
  special = false
}

resource "random_password" "admin_password" {
  length  = 20
  special = false
}
