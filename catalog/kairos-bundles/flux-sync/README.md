# Kairos Bundle - Flux synchronization

> \[!CAUTION]
> This bundle only works with a repository that has already been bootstrapped
> with fluxcd. If you want to bootstrap a repository, I recommend using the
> [flux-bootstrap](https://github.com/kairos-io/community-bundles/tree/main/flux)
> bundle.

This [Kairos bundle](https://kairos.io/docs/advanced/bundles/) is designed to
synchronize your Kubernetes cluster state using [fluxcd](https://fluxcd.io/).

It will install the fluxcd components inside `flux-system` namespace and will
create a `GitRepository` and a `Kustomization` resource to sync the manifests
from the repository you specify.

## 📋 Requirements

* A Kubernetes cluster created using [Kairos](https://kairos.io)
* A repository already bootstrapped with fluxcd
* `systemd` **must be** on nodes where this bundle is applied

## 🚀 Usage

To use this bundle, you need to specify the following parameters:

```yaml
bundles:
  - targets:
    - run://ghcr.io/chezmoidotsh/kairos-bundles:flux-sync

flux:
  git:
    url: https://github.com/fluxcd/flux2-monitoring-example.git
    branch: main # tag or tag_semver can also be used instead of branch
    path: clusters/test
  # source_git_extra_args: [] # Extra arguments to pass to the source git command (https://fluxcd.io/flux/cmd/flux_create_source_git/#options)
  # kustomization_extra_args: [] # Extra arguments to pass to the kustomization command (https://fluxcd.io/flux/cmd/flux_create_kustomization/#options)
```

> \[!NOTE]
> The `GitRepository` and `Kustomization` resources will be created in the
> `flux-system` namespace and will be name `main`.

### ⚙️ Parameters

* **`flux.git.url`**: The URL of the git repository to sync.
* **`flux.git.branch`**: The branch to sync.
* **`flux.git.tag`**: The tag to sync.
* **`flux.git.tag_semver`**: The tag to sync using semver.
* **`flux.git.path`**: The path inside the repository to sync.
* **`flux.source_git_extra_args`**: Extra arguments for the source git command. See [fluxcd documentation](https://fluxcd.io/flux/cmd/flux_create_source_git/#options) for more information.
* **`flux.kustomization_extra_args`**: Extra arguments for the kustomization command. See [fluxcd documentation](https://fluxcd.io/flux/cmd/flux_create_kustomization/#options) for more information.

> \[!WARNING]
> Only one of `flux.git.branch`, `flux.git.tag`, or `flux.git.tag_semver` can be
> used at a time.

## 📄 License

This bundle is licensed under the Apache-2.0 License. See the [LICENSE](../../../LICENSE) file
for more information.
