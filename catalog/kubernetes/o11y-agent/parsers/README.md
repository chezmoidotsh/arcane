# Pod log parsers

One kustomize `Component` per log format, for the pod logs collected by the `agent` collector of
[`../kustomize`](../kustomize)
([ADR-020](../../../../docs/decisions/ADR-020-Parser-les-Logs-des-Pods-dans-l-Agent-OpenTelemetry-avec-une-Bibliotheque-de-Components-Kustomize.md)).

A pod declares the format of its containers with annotations on its template:

```yaml
o11y.chezmoi.sh/log-format: json # every container of the pod
o11y.chezmoi.sh/log-format.csi-provisioner: klog # this container only
```

The agent routes each container's logs to the pipeline `logs/parsers/<format>`. A container without annotation, or
declared `none`, is not parsed. Parsers only set `severity_number` (through `o11y.log.level` and `transform/severity`)
and attributes; the body is never modified. `o11y.log.format` stays on the record.

| Format          | Included by         | Lines                                                                                     |
| --------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `ansi`          | the base            | colour-coded console (zerolog, NestJS)                                                    |
| `bracketed`     | the base            | `[INFO]`, `[WRN]`, … (Python logging, .NET)                                               |
| `golog`         | the base            | Go `log` package: `WARN: 2026/11/14 …` or `2026/11/14 11:00:17 INFO …`                    |
| `json`          | the base            | `level`/`@level`/`severity`/`lvl`; `exception.*` from `error`/`err`, `stacktrace`/`stack` |
| `klog`          | the base            | Kubernetes components, `I`/`W`/`E`/`F` prefix; `exception.message` from `err=`            |
| `logfmt`        | the base            | `level=`; `exception.message` from `error=`/`err=`                                        |
| `redis`         | the base            | Redis server, `.`/`-`/`*`/`#` markers                                                     |
| `uvicorn`       | the base            | Python logging with a padded level column                                                 |
| `zap-console`   | the base            | tab-separated zap console; `exception.message` from the `error` field                     |
| `cnpg-postgres` | lungmen.akn, rhodes | `json`, then the PostgreSQL records of CNPG → `db.*`, `error.type` (SQLSTATE), `client.*` |

`cnpg-postgres/annotate` is a component for the kustomizations holding CNPG `Cluster`s: it sets their
`spec.inheritedMetadata` annotations.

## Add a format

1. `<format>/parser.patch.yaml`: JSON patch adding the processor `transform/parse-<format>`, the pipeline
   `logs/parsers/<format>` (from `routing/log-format` to `forward/parsed`) and the route of the format to
   `routing/log-format`. Put the level token in `o11y.log.level`, or set `severity_number` directly.
2. `<format>/kustomization.yaml`: a `kind: Component` applying that patch to the `agent` collector.
3. `<format>/tests/fixtures.yaml`: sample records and the expected result.
4. `mise run o11y:parsers:test [<format>]` runs the fixtures through the routing of the rendered config, on the
   collector version the agent runs, downloaded by mise (see the header of
   [`.mise/tasks/o11y/parsers/test`](../../../../.mise/tasks/o11y/parsers/test)).
