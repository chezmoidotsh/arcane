# catalog/kubernetes/

Shared kustomize bases and helm reference values for Kubernetes infrastructure components. These are consumed by
per-project `infrastructure/kubernetes/<app>/` directories across all clusters.

## Rule

A system component deployed on two clusters or more has a shared base here, in `catalog/kubernetes/<component>/`. The
base holds only what is identical on every cluster. Each cluster keeps its own overlay in
`projects/<cluster>/src/infrastructure/kubernetes/<component>/`: the chart version pin (`helmCharts`), image overrides,
values overrides, gateways, secrets, cluster-specific resources and patches. A component used by a single cluster lives
entirely in that cluster's directory.

## Structure

```text
<component>/
  kustomize/   Kustomize resources deployed alongside the helm chart
               (ClusterIssuer, GatewayClass, ClusterSecretStore, ImageCatalog, …)
  helm/        Reference helm values files (not deployed directly)
               default.helmvalues.yaml  — base configuration
               hardened.helmvalues.yaml — security hardening layer
```

## Usage pattern

A per-project app directory at `projects/<cluster>/src/infrastructure/kubernetes/<app>/kustomization.yaml` follows this
structure:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: <app>-system

helmCharts:
  - name: <chart-name>
    releaseName: <app>
    repo: <chart-repo>
    version: <version>
    valuesFile: helmvalues/default.yaml # local merged values

resources:
  - ../../../../../../catalog/kubernetes/<app>/kustomize # shared base

patches:
  # project-specific patches
```

The local `helmvalues/default.yaml` is derived from this catalog's `helm/` reference files. Merge
`default.helmvalues.yaml` + `hardened.helmvalues.yaml` (and any project-specific overrides) into a single file when
setting up a new project.

## Adding a new component

1. Create `<component>/kustomize/kustomization.yaml` (`kind: Kustomization`) with the cluster-level resources that all
   projects sharing this component will deploy.
2. Optionally add `<component>/helm/default.helmvalues.yaml` and `<component>/helm/hardened.helmvalues.yaml` as
   reference starting points.
3. In each project that needs the component, create `projects/<cluster>/src/infrastructure/kubernetes/<component>/`
   following the pattern above.

## Components

| Component        | kustomize resources                                             | helm reference                   |
| ---------------- | --------------------------------------------------------------- | -------------------------------- |
| cert-manager     | Let's Encrypt ClusterIssuer (DNS-01/Cloudflare), ExternalSecret | CRDs enabled, security ctx       |
| cilium           | L2 announcement policy, HTTP→HTTPS redirect, ingress policy     | full Cilium configuration        |
| cloudnative-pg   | ImageCatalog (local registry mirrors)                           | operator config                  |
| envoy-gateway    | GatewayClass, default Gateway, HTTP→HTTPS redirect              | resources, logging, securityCtx  |
| external-dns     | network policies (UniFi and BIND instances)                     | BIND config, securityCtx         |
| external-secrets | ClusterSecretStore (OpenBao/Vault)                              | auth-delegator RBAC, securityCtx |
| newt             | DNSEndpoint for the Pangolin server                             | tunnel instance                  |
| o11y-agent       | OpenTelemetryCollector (node + cluster), RBAC, network policies | OpenTelemetry + Grafana Operator |
| proxmox          | network policies (CCM + CSI plugin)                             | —                                |
| toolhive         | network policies                                                | mirrored operator images         |
