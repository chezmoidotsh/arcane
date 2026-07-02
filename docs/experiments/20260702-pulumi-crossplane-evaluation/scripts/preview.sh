#!/usr/bin/env bash
# Runs `pulumi preview` locally against the sandbox, port-forwarding Garage
# and OpenBao first. Uses the exact same S3 state the in-cluster operator
# would use (stack/stack.yaml) — only the endpoint (localhost vs in-cluster
# DNS) differs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${ROOT}/stack"

# Single install from the POC's own workspace root: hoists @pulumi/pulumi and
# @pulumi/vault into node_modules there, which is the common ancestor
# catalog/cluster-vault/ and this stack both resolve against — see this
# directory's package.json "workspaces" field.
npm install --no-audit --no-fund --prefix "${ROOT}"
cd "${DIR}"

kubectl -n pulumi-poc port-forward svc/garage 3900:3900 >/tmp/pulumi-poc-garage-pf.log 2>&1 &
GARAGE_PF=$!
kubectl -n pulumi-poc port-forward svc/openbao 8200:8200 >/tmp/pulumi-poc-openbao-pf.log 2>&1 &
OPENBAO_PF=$!
trap 'kill "$GARAGE_PF" "$OPENBAO_PF" 2>/dev/null || true' EXIT
sleep 2 # let the port-forwards come up

# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, VAULT_ADDR, VAULT_TOKEN and
# PULUMI_CONFIG_PASSPHRASE come from .mise.toml [env] — this script only
# runs through `mise run poc:preview`.
pulumi login 's3://pulumi-states?endpoint=localhost:3900&disableSSL=true&s3ForcePathStyle=true&region=garage'
pulumi stack select organization/pulumi-crossplane-poc-sandbox/dev --create
pulumi preview
