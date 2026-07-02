#!/usr/bin/env bash
# One-command Railway deploy: provisions Postgres, Redis, backend, and
# storefront via the Terraform config in terraform/ (see terraform/README.md).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/terraform"

AUTO_APPROVE=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes|--auto-approve) AUTO_APPROVE=true ;;
    -h|--help)
      echo "Usage: $(basename "$0") [-y|--yes]"
      echo "  -y, --yes   Skip the confirmation prompt before applying (for CI/non-interactive use)."
      exit 0
      ;;
  esac
done

if ! command -v terraform >/dev/null 2>&1; then
  echo "Error: terraform is not installed (need >= 1.5)." >&2
  echo "Install it from https://developer.hashicorp.com/terraform/install" >&2
  exit 1
fi

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "Error: RAILWAY_TOKEN is not set." >&2
  echo "Create an account/workspace token at https://railway.app/account/tokens, then:" >&2
  echo "  export RAILWAY_TOKEN=your-token-here" >&2
  exit 1
fi

cd "$TERRAFORM_DIR"

if [ ! -f terraform.tfvars ]; then
  echo "No terraform.tfvars found - creating one from terraform.tfvars.example."
  cp terraform.tfvars.example terraform.tfvars
  read -rp "Medusa admin dashboard email (MEDUSA_ADMIN_EMAIL): " admin_email
  if [ -n "$admin_email" ]; then
    sed -i.bak "s/^admin_email = .*/admin_email = \"$admin_email\"/" terraform.tfvars
    rm -f terraform.tfvars.bak
  fi
  echo "Wrote $TERRAFORM_DIR/terraform.tfvars - edit it now for Resend email/other options if needed."
fi

terraform init -input=false
terraform plan -input=false -out=tfplan

if [ "$AUTO_APPROVE" = false ]; then
  echo
  read -rp "Apply this plan and deploy to Railway? [y/N] " confirm
  case "$confirm" in
    y|Y|yes|Yes) ;;
    *)
      echo "Aborted - no changes applied."
      rm -f tfplan
      exit 0
      ;;
  esac
fi

terraform apply -input=false tfplan
rm -f tfplan

echo
echo "Deployment complete. Outputs:"
terraform output
echo
echo "Admin password (sensitive, not printed above): terraform output -raw admin_password"
echo "(run from $TERRAFORM_DIR)"
