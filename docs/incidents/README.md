# Incidents

Post-mortems for production incidents in this repository. Each document follows the
template in `.agents/skills/postmortem/templates/postmortem.md` and includes structured
frontmatter with `error_signatures` for programmatic lookup.

## Finding a relevant incident

The fastest search is a grep on the `error_signatures` frontmatter field. Each incident
declares the exact strings that appear in Kubernetes events, pod logs, or cluster conditions.

```sh
# Find incidents matching a specific error string
grep -rl "Expected empty archive" docs/incidents/

# Find incidents for a component
grep -rl "cnpg\|barman" docs/incidents/

# Show which procedures a matched incident references
grep -A5 "procedures:" docs/incidents/2026-05-30-cnpg-wal-disk-full-apps-secured.md
```

Agents using the `cnpg-troubleshoot` skill (`.agents/skills/cnpg-troubleshoot/SKILL.md`)
use this same grep pattern to route from a live error to the appropriate procedure.

## Incident index

| Date       | Severity | File                                                                                                         | Error signatures (abbreviated)                                                  | Summary                                                                                    |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 2026-05-25 | High     | [lungmen-clustersecretstore-vault-auth-failure](2026-05-25-lungmen-clustersecretstore-vault-auth-failure.md) | —                                                                               | ClusterSecretStore auth failure — ExternalSecrets unable to sync from Vault                |
| 2026-05-25 | High     | [zot-disk-full-imagepullbackoff](2026-05-25-zot-disk-full-imagepullbackoff.md)                               | `no space left on device`, `ImagePullBackOff`                                   | Zot registry PVC saturated → cluster-wide ImagePullBackOff on lungmen.akn                  |
| 2026-05-26 | High     | [amiya-kyverno-zot-circular-imagepullbackoff](2026-05-26-amiya-kyverno-zot-circular-imagepullbackoff.md)     | —                                                                               | Kyverno + Zot circular dependency → ImagePullBackOff on amiya.akn                          |
| 2026-05-26 | Medium   | [lungmen-k8s-1.35-removed-featuregate](2026-05-26-lungmen-k8s-1.35-removed-featuregate.md)                   | —                                                                               | Removed Kubernetes feature gate blocking upgrade to 1.35                                   |
| 2026-05-27 | High     | [cilium-1.19-upgrade-failure](2026-05-27-cilium-1.19-upgrade-failure.md)                                     | —                                                                               | Cilium 1.19 upgrade failure on lungmen.akn                                                 |
| 2026-05-30 | High     | [cnpg-wal-disk-full-apps-secured](2026-05-30-cnpg-wal-disk-full-apps-secured.md)                             | `Not enough disk space`, `Expected empty archive`, `ContinuousArchivingFailing` | CNPG WAL PVC saturated after 25-day silent archiving failure → immich + paperless-ngx down |

## Conventions

* **`error_signatures`** — exact strings from logs, events, or Kubernetes conditions. Use
  the literal strings that appear in `kubectl` output or pod logs, not paraphrases.
* **`procedures`** — paths to `docs/procedures/` runbooks that resolve this class of
  incident. A post-mortem without a linked procedure is incomplete.
* **Severity** — Critical (data loss / full cluster down) · High (services unavailable) ·
  Medium (degraded) · Low (no user impact).

New incidents: copy `.agents/skills/postmortem/templates/postmortem.md`, add `error_signatures`
and `procedures` fields to the frontmatter, and add a row to the table above.
