terraform {
  required_version = ">= 1.5"

  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }
}

# Auth: export RAILWAY_TOKEN (an account/workspace token from
# https://railway.app/account/tokens) before running terraform. Not read from
# a variable here so it never ends up in a .tfvars file or state-adjacent input.
provider "railway" {}
