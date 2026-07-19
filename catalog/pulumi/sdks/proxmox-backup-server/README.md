> This provider is a derived work of the [Terraform Provider](https://github.com/yavasura/terraform-provider-pbs)
> distributed under [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/). If you encounter a bug or missing feature, please
> consult the source [`terraform-provider-pbs` repo](https://github.com/yavasura/terraform-provider-pbs/issues).

> [!NOTE]
> This folder and the npm package (`@pulumi/proxmox-backup-server`) were renamed for consistency with
> `catalog/pulumi/sdks/proxmox/`. `package.json`'s `pulumi.parameterization.name` intentionally stays `"pbs"` — it is
> not a display name, it is what determines every resource's Pulumi type token (`pbs:index/datastore:Datastore`, …)
> and Pulumi config namespace (`pbs:endpoint`, `pbs:apiToken`, …) for the live `chezmoi_sh.live` stack. Changing it
> would make Pulumi see every existing PBS resource as a brand-new resource type and try to replace them all. Don't
> "fix" this divergence without a full state-migration plan.
