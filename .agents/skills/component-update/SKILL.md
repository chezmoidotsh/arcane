---
name: component-update
description: >
  How to update a component deployed from the Arcane repository (a container image, a Helm chart, a pinned binary, a
  nixpkgs package, a NixOS or LXC appliance). Use it whenever a component version has to be bumped: to work on an issue
  opened by Oripathy ("Update <component> to <version>"), to answer "how do I update X", or to write the Proposal
  section of such an issue. It tells where the version lives, which commands apply to each kind of component, what must
  never be done (editing dist/, inventing a digest) and how to check and roll back.
compatibility: Requires mise, git; nix and SSH access depending on the component (see each case)
---

# Component update

One recipe per kind of component. Find the case first (table below), then follow only that case.

## Inputs

An update starts from:

- the component: `<project>/<name>`, for example `kazimierz.akn/traefik` or `catalog/postgresql-17`;
- the current and the target version;
- the files that declare the version (path and line). Oripathy's BOM lists them; otherwise `rg` the old version in the
  component's application directory (see [Oripathy Reference](../../../docs/reference/Oripathy-Reference.md)).

Read the release notes of every version between the current and the target one, and the migration guides they point to.
A `todo` or "read the migration guide" in them is a prerequisite, not a footnote.

## Lines to change: the version line and its mirrors

A component can state its version in more than one place. Each place the BOM lists has a **role**, written before the
`;` in its context (`"chart; annotation line 28"`, `"mirror; annotation line 12"`):

| Role                        | What the line is                                                                                                                                             | What to put in it                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chart`, `image`, `release` | The version line: it **sets** what is deployed (`version:` of a chart, `newTag:`, `tag:`, `image:`, or the version of a pinned binary)                       | The target version. If the line pins a digest, move the tag and the digest together.                                                                                              |
| `mirror`                    | A line that only **displays** a version, today the `Version` entry of a `.application.patch` (what the Argo CD UI shows). It changes nothing in the cluster. | The same kind of value it shows now, for the new version: the component version, the chart version, the chart `appVersion` or an image tag (a leading `v` is ignored). No digest. |
| `flake-input`               | An entry of a `flake.lock`, listed without a line                                                                                                            | Nothing by hand: `nix flake update` (case 5).                                                                                                                                     |

Rules:

- **Change the version line and every mirror in the same commit.** A mirror left behind is a wrong version shown in the
  Argo CD UI, and the inventory CI fails with `shows X but <name> is at Y: update this line`.
- **A mirror is not always the number of the version line.** One that shows the chart `appVersion` takes the
  `appVersion` of the new chart (`helm show chart`, or `Chart.yaml`), which is not the chart version. Compare what it
  shows today with the old chart before choosing the value.
- **List them apart.** In an issue or a PR, name the version line first, then the mirrors under "display only", so the
  reader knows which edit changes the deployment and which one only keeps the display in line.
- A component can have several version lines (an image and its chart, for example): they are all listed with their own
  role; change each of them.

## Which case

Decide from the path of the file that declares the version.

| The version is declared in                                                                                   | Case                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `projects/*/src/apps/**`, `projects/*/src/infrastructure/kubernetes/**`, `projects/rhodes.akn/src/argocd/**` | 1. Kubernetes (ArgoCD)                |
| `catalog/kubernetes/**`                                                                                      | 2. Catalog (shared Kubernetes bases)  |
| `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/<name>/**`                                               | 3. NixOS LXC appliance                |
| `projects/kazimierz.akn/src/infrastructure/nixos/**`, `projects/rimbilliton.akn/src/infrastructure/nixos/**` | 4. NixOS host (OCI VPS)               |
| a `flake.nix` or `flake.lock` elsewhere (`catalog/flakes/**`, other NixOS modules)                           | 5. Nix flake input or nixpkgs package |
| no file in the repository (Home Assistant OS, a router firmware, a manual component)                         | 6. Outside the repository             |

When none fits, say so in the issue or the PR. Do not guess a command.

## Rules for every case

- **One component per change**, one logical commit (`^[deps]: <component> to <version>`, see the `git-commit` skill).
- **Never edit `dist/`.** It is generated from `src/`; run `dist:render` (case 1).
- **Never invent a digest, a hash or a checksum.** A line that pins `@sha256:` or a `digest:` (annotation `digest=true`)
  must have the tag and the digest moved together, from the registry or the build output. If you cannot compute it,
  write that the digest has to be taken from the registry and leave it for the person who applies the change.
- **Update every line that shows the version**, mirrors included (see above).
- **Keep the annotation above the version line** (`# oripathy: …`). If you move or add a version line, run
  `scripts/oripathy:inventory --check` (see the reference page) before pushing.
- **Never push to `main`.** Changes reach it through a pull request.

## 1. Kubernetes (ArgoCD)

Applies to apps and in-cluster infrastructure of `lungmen.akn`, `rhodes.akn` (and the Argo CD installation itself).

1. Change the version in `src/`, on the annotated line:
   - a Helm chart: `version:` of the `helmCharts:` entry in `kustomization.yaml`;
   - an image: `newTag:` of the `images:` entry (and `digest:` next to it when the annotation says `digest=true`), or
     `tag:` in the `*.helmvalues/` files, or the `image:` line of a manifest;
   - a remote release: the URL of the manifest.
2. If the chart bump changes values (renamed keys, new defaults), adapt the `*.helmvalues/` files; compare the chart
   `values.yaml` of both versions.
3. Run `dist:render` on the touched application (`dist:render <path>`, or `--changed`), and commit `src/` and `dist/`
   together. A diff in `dist/` that you did not expect is the real content of the upgrade: read it.
4. Merge. ArgoCD syncs from `dist/`. To force it: `argocd:app:sync <application directory>`, the directory that holds
   the `kustomization.yaml` of the version line (for example `projects/lungmen.akn/src/infrastructure/kubernetes/cilium`
   or `projects/lungmen.akn/src/apps/n8n`).
5. Check: the ArgoCD application is `Synced` and `Healthy`, the pods run the new version, then the service itself.

`rhodes.akn` is the core platform (OpenBao, Pocket-Id, monitoring collection): prefer a quiet moment, and expect a
restart of anything it serves to other clusters.

Rollback: revert the commit (`src/` and `dist/`) and let ArgoCD sync. A CRD or database migration done by the new
version is not undone by a revert: when the notes mention one, say it in the issue.

## 2. Catalog (shared Kubernetes bases)

`catalog/kubernetes/**` holds reference values and kustomize bases that projects copy. Bump the annotated line there,
then find the projects that carry the same component (`rg` the name under `projects/*/src`) and treat each as case 1, or
say that it is left on its own version on purpose. The CloudNative-PG image catalog
(`catalog/kubernetes/cloudnative-pg/kustomize/default.image-catalog.yaml`) pins digests: see the digest rule.

## 3. NixOS LXC appliance

The appliances under `projects/chezmoi.sh/src/infrastructure/proxmox/lxc/<name>/` are immutable NixOS tarballs. The full
procedure is in the [lxc-maintenance skill](../lxc-maintenance/SKILL.md); in short:

1. In the appliance's `flake.nix`, change the upstream version when the component is packaged there (annotated line),
   then **bump the template version** (`imageVersion` or `version` = today `YYYY.MM.DD`, `-N` for a second build the
   same day). Without it the artifact looks identical to the one already on the Proxmox host. `oci-registry` is the
   exception: its `version` is the Zot release; only its `imageVersion` is a date.
2. If the flake inputs change, `nix flake update` in that directory (case 5).
3. From the appliance directory: `mise run lxc:build`, then `mise run lxc:push -- <pve-host>`, then
   `mise run lxc:upgrade -- <pve-host>`.
4. The upgrade smoke-tests a temporary container, snapshots the running one, swaps the rootfs and health-checks it.
   There is downtime between the stop and the restart. The container keeps its VMID and IP.
5. Rollback: answer "N" at step 7 of the upgrade (review the health check first), which restores the pre-upgrade
   snapshot.

Needs `nix`, `sops` and SSH access to the Proxmox host: this is done from the maintainer's machine, not from CI.

## 4. NixOS host (OCI VPS)

`kazimierz.akn` (public gateway: Pangolin, Gerbil, Traefik) and `rimbilliton.akn` (Minecraft host) are NixOS machines
deployed with `nixos-rebuild switch --target-host` over the tailnet (ADR-016). The version lives in a module under
`src/infrastructure/nixos/` (a container image `fooImage = "…"`, a pinned binary, a package).

1. Change the annotated line (`tag`, and the digest when `digest=true`). For a pinned binary or `fetchurl`, refresh its
   hash with `nix:hash:update` from the directory of the `flake.nix`.
2. For a nixpkgs package or a flake input, see case 5.
3. Back up the state before an upgrade of the application that owns it: on `kazimierz.akn`,
   `mise run nixos:backup [root@kazimierz-akn]` (hot copy of Pangolin's state, no downtime).
4. Apply to the running host: `mise run nixos:oci:update`. It needs the SSH key in your agent and the tailnet. Do not
   run `nixos:oci:install` or `nixos:e2e`: they repartition or target a test VM.
5. Check: the systemd units and containers are up, the service answers from outside; on `kazimierz.akn`, Pangolin comes
   back and the Newt tunnel clients of the clusters reconnect.
6. Rollback: NixOS keeps generations, `nixos-rebuild switch --rollback` on the host returns to the previous one. A state
   migration done by the new version is not rolled back with it: restore the backup.

`kazimierz.akn` is the only public entry point of the homelab: a restart cuts every published service for its duration.
Say so in the issue and do it outside busy hours.

## 5. Nix flake input or nixpkgs package

`type=nixpkg pkg=<x>` annotations have no version line: the version comes from the `flake.lock` next to the flake, and
the Oripathy BOM carries `channelVersion` (what `nix flake update` would bring). The entries of `flake.lock` (nixpkgs,
disko…) are moved together.

1. In the directory of the `flake.nix`: `nix flake update` (or `nix flake update <input>`), and read the lock diff.
2. Apply as the host or appliance it belongs to: case 3 or case 4. If the flake is a Nix OCI image (`nix:build:image`),
   rebuild it.
3. Commit `flake.lock` (and the module) together.

A nixpkgs bump moves every package of the host, not only the one named in the issue: say it.

## 6. Outside the repository

Nothing in the repository declares the version (Home Assistant OS, a router firmware, a manual component added to
Oripathy). The proposal is a manual operation: name the place where the update is done (for Home Assistant, its own
update screen), the backup to take first, and how to check. Do not write commands that this repository does not
document.

## Writing the Proposal of an issue

The Proposal section of an Oripathy issue is the result of this skill for one component. Write it in English, as a
numbered list, short, with:

1. **Where**: the files and lines to change (path:line and the key), exactly as given in the input: the version line(s)
   first, then the mirrors under "display only". Never merge them in one list.
2. **What**: the new version for the version line, and the digest rule when it pins one; for a mirror, the value it
   takes (and a warning when it is not the version of the version line, for example the chart `appVersion`).
3. **How**: the commands of the matching case above, in order, and nothing else.
4. **Before**: the prerequisite from the release notes (migration guide, backup, CRD update), when there is one.
5. **After**: how to check, and the downtime or restart to expect.
6. **If it goes wrong**: the rollback of the matching case.

Only use commands that appear in this skill. If the declaring file is shown to you, quote the exact line to change. Do
not repeat the release notes: they are in the Context section.

## Related

- [Oripathy Reference](../../../docs/reference/Oripathy-Reference.md): annotations, BOM, `--check`.
- [lxc-maintenance](../lxc-maintenance/SKILL.md): build, push and upgrade of LXC appliances.
- [git-commit](../git-commit/SKILL.md) and [create-pr](../create-pr/SKILL.md): commit and pull request conventions.
- ADR-011 (pre-rendered manifests) and ADR-016 (NixOS hosts) in `docs/decisions/`.
