#!/usr/bin/env bash
# Bootstraps the disposable kind sandbox for the Pulumi-vs-Crossplane POC
# (issue 1089): Garage (S3 state backend) + OpenBao (dev mode) + the Pulumi
# Kubernetes Operator. Safe to re-run — every step is idempotent.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER=pulumi-poc

if ! kind get clusters | grep -qx "${CLUSTER}"; then
  echo "==> Creating kind cluster ${CLUSTER}"
  kind create cluster --name "${CLUSTER}"
else
  echo "==> kind cluster ${CLUSTER} already exists, reusing"
  kind export kubeconfig --name "${CLUSTER}"
fi

echo "==> Deploying Garage (S3 state backend)"
kubectl apply -f "${DIR}/manifests/garage.yaml"
kubectl -n pulumi-poc rollout status deployment/garage --timeout=120s

echo "==> Deploying OpenBao (dev mode)"
helm repo add openbao https://openbao.github.io/openbao-helm >/dev/null 2>&1 || true
helm repo update openbao >/dev/null
helm upgrade --install openbao openbao/openbao \
  --namespace pulumi-poc --create-namespace \
  --set server.dev.enabled=true \
  --wait
kubectl apply -f "${DIR}/manifests/openbao-credentials.yaml"

echo "==> Deploying Pulumi Kubernetes Operator"
helm upgrade --install pulumi-kubernetes-operator \
  oci://ghcr.io/pulumi/helm-charts/pulumi-kubernetes-operator \
  --version 2.7.0 \
  --namespace pulumi-poc --create-namespace \
  --wait

echo "==> Deploying the shared Pulumi passphrase (local + in-cluster must match)"
kubectl apply -f "${DIR}/manifests/pulumi-credentials.yaml"

cat <<'EOF'

==> Sandbox ready. Next steps:

  1. Run the stack locally (port-forwards Garage + OpenBao for you):
       mise run poc:preview

  2. Optional — prove the in-cluster operator shares the same state as your
     local run. Push this branch first, then:
       kubectl apply -f stack/stack.yaml
       kubectl -n pulumi-poc get stacks.pulumi.com pulumi-crossplane-poc-sandbox -w

  3. Tear down when done:
       mise run poc:teardown
EOF
