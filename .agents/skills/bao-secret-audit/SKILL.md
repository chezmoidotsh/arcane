---
name: bao-secret-audit
description:
  Runs a repeatable OpenBao secret hygiene audit — naming convention drift against ADR-003, dangling references (dist/
  ExternalSecrets or Pulumi vault.kv.* calls pointing at a path that doesn't exist), and orphaned secrets (live paths
  nothing in the repo references). Use monthly, or whenever asked to "audit OpenBao", "check secret hygiene", "find
  orphaned vault secrets", or "check for dangling ExternalSecret references". Metadata/path-only — never reads a secret
  value.
compatibility:
  Requires `bao` on PATH (installed via `mise`) and an authenticated session (`mise run bao:login` or `mise run
  bao:login:admin` — list permissions on every KV mount are enough, no read-value permission needed). Requires `uv`
  (already a repo dependency) to run the script itself.
---

# OpenBao secret hygiene audit

Wraps `scripts/bao:secret:audit`. Read that script before relying on this skill for anything beyond the well-known
false-positive shapes documented below — it's the source of truth for what each check actually does.

## When to use this skill

- Monthly maintenance sweep (via `/loop` or a scheduled routine), or when asked directly.
- After a bulk secret migration/rename, to confirm nothing was left dangling or orphaned.
- Before deleting a live OpenBao secret, to double check nothing still expects the old path.

## When NOT to use this skill

- To read or dump secret _values_ — this tool and this skill are path/metadata-only by design. Don't extend it to call
  `bao kv get` on individual secrets.
- To validate Terraform-, Ansible-, or Crossplane-ProviderConfig-consumed secrets — the reference scanner only covers
  `dist/` ExternalSecrets and Pulumi `vault.kv.SecretV2`/`getSecretV2` call sites. A secret consumed exclusively through
  one of those other paths will show up as a false "orphaned" finding — see Known limitations below.

## Workflow

1. **Confirm auth.** Run `bao token lookup`. If it fails or the token lacks list access on a mount, tell the user to run
   `mise run bao:login` (or `bao:login:admin` for full coverage) before continuing — don't attempt to log in on their
   behalf.
2. **Run the script**: `scripts/bao:secret:audit`. It prints per-mount secret counts to stderr as it goes (useful
   progress signal — the recursive KV walk can take a few seconds per mount) and the Markdown report to stdout. Exit
   code is `1` if any finding exists, `0` if clean.
3. **Read every section**, don't just report the finding count:
   - **Naming convention drift** — cross-check against `docs/decisions/003-openbao-path-naming-conventions.md` before
     treating a flag as real; the checker is deliberately conservative (character set, category enum for `shared/`,
     minimum path depth for per-cluster mounts) and can't validate everything ADR-003 describes.
   - **Dangling references** — these are the highest-confidence findings. A `dist/` ExternalSecret or Pulumi call
     pointing at a path with no live secret means a sync is currently broken (`SecretSyncedError`) or a `pulumi up` will
     fail. If the fix is an obvious typo (compare against a working sibling reference to the same mount/category), fix
     it directly in `src/`, re-render with `scripts/dist:render <path>`, and say so in the summary. If it's not
     obviously a typo, surface it and ask before touching anything — the live secret might be intentionally pending
     creation.
   - **Orphaned secrets** — the _lowest_-confidence findings. Never propose deleting one without checking, per entry:
     whether the owning app exists yet under `projects/<cluster>/src/apps/` (pre-provisioned secrets for a
     not-yet-deployed app are expected, not a bug), and whether it's consumed via Terraform/Ansible/Crossplane (out of
     this tool's scan scope, see Known limitations).
4. **Triage, don't bulk-act.** Per `AGENTS.md`'s scope-management rules: fix an evidenced, in-scope bug inline (like the
   dangling-reference typo case above) if the fix is small and clearly safe; for anything requiring judgment calls about
   staleness or intent, summarize and let the user decide — don't auto-file an issue per orphaned secret, and don't
   auto-delete anything. If the user wants tracking issues for specific findings, use the `create-issue` skill.
5. **Report back** in a short summary: counts per section, anything fixed inline, and what still needs a human call.

## Known limitations

- **Pulumi reference extraction is regex-based, not an AST parse.** A `vault.kv.SecretV2`/`getSecretV2` call whose
  `mount`/`name` uses a template literal with an interpolated variable (`` `${foo}` ``) can't be resolved and is
  silently skipped — if a report entry looks wrong, grep the Pulumi source directly before trusting the finding.
- **Only two reference sources are scanned**: `dist/**/*.ExternalSecret.*.yaml` (filtered to ExternalSecrets whose
  `secretStoreRef` resolves to a vault-backed `SecretStore`/`ClusterSecretStore` — OpenBao's own bootstrap secrets use a
  Kubernetes-native `SecretStore` and are correctly excluded) and Pulumi `vault.kv.*` call sites. Terraform state,
  Ansible vars, and Crossplane `ProviderConfig.spec.credentials` are not scanned — a secret consumed only through one of
  those will show as a false "orphaned" finding.
- **`personal/` mount is excluded from the orphan check entirely** — those secrets are self-managed per user and were
  never expected to be referenced by ExternalSecrets or Pulumi.

## Example run

```console
$ scripts/bao:secret:audit
Mounts: amiya.akn, kazimierz.akn, lungmen.akn, personal, rhodes.akn, shared
  amiya.akn: 17 secrets
  ...
# OpenBao secret hygiene audit

Live secrets scanned: 89 across 6 mounts.
References scanned: 36 (dist/ ExternalSecrets + Pulumi vault.kv.* calls).

## Naming convention drift (ADR-003)

None found.
...
```
