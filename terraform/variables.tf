variable "project_name" {
  description = "Railway project name."
  type        = string
  default     = "medusa-railway-boilerplate"
}

variable "github_repo" {
  description = "GitHub repo (owner/name) Railway builds backend/storefront from."
  type        = string
  default     = "dtduc1991/medusajs-2.0-for-railway-boilerplate"
}

variable "github_branch" {
  description = "Branch to deploy."
  type        = string
  default     = "main"
}

variable "admin_email" {
  description = "Medusa admin dashboard login email (MEDUSA_ADMIN_EMAIL)."
  type        = string
}

variable "postgres_user" {
  description = "Postgres superuser name."
  type        = string
  default     = "postgres"
}

variable "postgres_db" {
  description = "Postgres database name."
  type        = string
  default     = "railway"
}

variable "storefront_default_region" {
  description = "Default country code for the storefront's region middleware. Must match a country seeded by backend/src/scripts/seed.ts (gb/de/dk/se/fr/es/it) - the seed only provisions a eur/Europe region, no us/usd region exists."
  type        = string
  default     = "gb"
}

variable "resend_api_key" {
  description = "Optional Resend API key for order-confirmation emails (RESEND_API_KEY). Leave blank to skip - the notification module then simply isn't registered (see docs/sessions/006)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "resend_from_email" {
  description = "Optional Resend 'from' address (RESEND_FROM_EMAIL), required if resend_api_key is set. Use onboarding@resend.dev for testing (only delivers to the Resend account's own email) or an address on a domain you've verified in Resend for real delivery."
  type        = string
  default     = ""
}
