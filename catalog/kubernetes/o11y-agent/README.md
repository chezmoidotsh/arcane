# `o11y-agent` — Kubernetes observability agents

Ships the telemetry of a Talos cluster to the central `o11y` appliance as **OTLP/HTTP only**
(`https://data.o11y.chezmoi.sh:4318`,
[ADR-018](../../../docs/decisions/ADR-018-OTLP-comme-Protocole-d-Ingestion-Unique-pour-l-Appliance-d-Observabilite.md)).
Two OpenTelemetry Collectors (contrib), managed by the OpenTelemetry Operator:

| Collector | Mode                   | Collects                                                                                                                            |
| --------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `agent`   | DaemonSet, hostNetwork | Node metrics (`host_metrics`), pod/container usage (`kubelet_stats`), pod logs, Talos service and kernel logs, Prometheus-only apps |
| `cluster` | Deployment, 1 replica  | Cluster state (`k8s_cluster`), Kubernetes events (logs), snapshots of a few CRDs (logs)                                             |

The same namespace runs the **Grafana Operator** (watching the whole cluster). On `rhodes.akn` it manages the Grafana
instance of `apps/o11y`; on the other clusters it holds an external-mode `Grafana` resource pointing at that instance
(`o11y.chezmoi.sh`, API token from OpenBao), so each cluster's `GrafanaDashboard` resources land in the single Grafana.

Per-flow Cilium network logs are not collected here (Hubble only exports to files): see
[#1516](https://github.com/chezmoidotsh/arcane/issues/1516). Aggregated Hubble metrics are, through the `hubble`
ServiceMonitor of the Cilium release.

## Resource attributes

Every signal carries, with the OTel semantic-convention names:

- `k8s.cluster.name` — `lungmen.akn`, `rhodes.akn`, … (set per project);
- `host.name` — the node name, only on host-level data (`hostmetrics`, Talos logs). Pod and Kubernetes-object data
  carry `k8s.node.name` / `k8s.pod.name` instead, so pod telemetry never shows up as a host;
- `service.name` — label `app.kubernetes.io/name`, else the workload (deployment, statefulset, daemonset, cronjob, job),
  else the container, else the pod. Non-pod sources use `hostmetrics`, `kubelet`, `k8s-cluster`, `k8s-events`,
  `k8s-objects`, or the Talos service (`machined`, `kubelet`, `etcd`, …, `kernel`);
- for pod-sourced data: `k8s.pod.name`, `k8s.pod.ip`, `k8s.container.name`, `k8s.namespace.name`, `k8s.node.name` and
  the workload (`k8s.deployment.name`, `k8s.statefulset.name`, `k8s.daemonset.name`, `k8s.cronjob.name`,
  `k8s.job.name`).

## Getting an app's Prometheus metrics

Apps that only expose Prometheus metrics are scraped by the agent of their node, either:

- with a `ServiceMonitor` or `PodMonitor` (most charts: `serviceMonitor.enabled: true`). The Target Allocator reads them
  and hands each target to the agent of the node it runs on. Monitors referencing a Secret (basic auth, bearer token,
  TLS keys) are not supported: the Target Allocator has no Secret access;
- or with pod annotations: `prometheus.io/scrape: "true"`, `prometheus.io/port`, optionally `prometheus.io/path` and
  `prometheus.io/scheme`.

No NetworkPolicy is needed on the app side: the agent scrapes from the node itself and Cilium always lets the local host
reach the pods of its node.

## Layout

```text
helm/opentelemetry-operator.helmvalues.yaml   OpenTelemetry Operator values (mirror images, cert-manager webhook cert)
helm/grafana-operator.helmvalues.yaml         Grafana Operator values (cluster-wide watch, CRDs rendered as templates)
kustomize/
├── agent.opentelemetrycollector.yaml         node agent + Target Allocator
├── cluster.opentelemetrycollector.yaml       cluster agent
├── rbac.yaml                                 read-only ClusterRoles, no Secret access
└── security/                                 CiliumNetworkPolicies (operators, Target Allocator, cluster agent)
```

Each project adds `infrastructure/kubernetes/o11y-agent/` (namespace `o11y-agent-system`, Pod Security `privileged`)
with the OpenTelemetry Operator, Grafana Operator and `prometheus-operator-crds` charts (ServiceMonitor, PodMonitor,
Probe and ScrapeConfig CRDs only) and a patch setting `K8S_CLUSTER_NAME`. The Talos side lives in the Omni cluster
templates: patches `o11y-agent-logging` (`machine.logging.destinations`) and `o11y-agent-kmsg` (`KmsgLogConfig`) send
the service and kernel logs to `tcp://127.0.0.1:6050`.

## Design notes

- **hostNetwork node agent.** Talos `machined` runs in the host network namespace and needs a static endpoint: the agent
  listens on `127.0.0.1:6050`, never exposed outside the node. Scrapes coming from the node itself also avoid a
  NetworkPolicy per app. The flip side: CiliumNetworkPolicies do not apply to the agent, its egress is not filtered.
- **Node state on the host.** File offsets and the exporter queue are kept in `/var/lib/o11y-agent` on the node: an
  agent restart or an appliance outage neither re-reads nor loses logs.
- **Single cluster agent.** No leader election: a second replica would duplicate every event and metric.
- **CRD snapshots** only list CRDs present on every cluster (cert-manager `Certificate`, ESO `ExternalSecret`, CNPG
  `Cluster`): `k8s_objects` refuses to start on an unknown resource.
- **Validation.** The collector configurations were checked with `otelcol-contrib validate` (0.162.0); the Talos and
  events transforms were run on sample records.
