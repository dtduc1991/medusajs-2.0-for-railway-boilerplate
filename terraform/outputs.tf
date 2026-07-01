output "backend_url" {
  value = local.backend_url
}

output "storefront_url" {
  value = local.storefront_url
}

output "admin_login_url" {
  value = "${local.backend_url}/app"
}

output "admin_email" {
  value = var.admin_email
}

output "admin_password" {
  value     = random_password.admin_password.result
  sensitive = true
}

output "publishable_key" {
  value = local.publishable_key
}
