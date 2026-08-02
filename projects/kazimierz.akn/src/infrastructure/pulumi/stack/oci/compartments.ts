import * as oci from "@pulumi/oci";

// Never pulumi config, even `--secret`: Pulumi.<stack>.yaml is git-tracked.
// Not itself a credential, but it's part of the ApiKey auth bundle the
// @pulumi/oci provider reads from TF_VAR_tenancy_ocid/TF_VAR_user_ocid/
// TF_VAR_fingerprint/TF_VAR_private_key/TF_VAR_region -- set inline for the
// single `pulumi up`/`preview` command that needs them.
const tenancyOcid = process.env.TF_VAR_tenancy_ocid;
if (!tenancyOcid) {
	throw new Error(
		"TF_VAR_tenancy_ocid must be set for the single pulumi command being run",
	);
}

// Already exists in OCI (verified live with `oci iam compartment list
// --include-root`: id ocid1.compartment.oc1..aaaaaaaajyh7a5rbs3gcnvmxffcwewtuftrakz5ndd6ojwxcjyjecuvnafaq,
// created 2026-06-20) -- declared here so Pulumi adopts the existing
// compartment via `pulumi import` instead of trying to create a duplicate
// (which OCI would reject, the name is already taken). Owned by this stack
// "for now": chezmoi.sh has no Pulumi stack of its own yet. Move this
// resource there once one exists.
//
//   pulumi import oci:identity/compartment:Compartment chezmoiSh \
//     ocid1.compartment.oc1..aaaaaaaajyh7a5rbs3gcnvmxffcwewtuftrakz5ndd6ojwxcjyjecuvnafaq
export const chezmoiSh = new oci.identity.Compartment("chezmoiSh", {
	compartmentId: tenancyOcid,
	name: "chezmoi.sh",
	description: "All resources used by chezmoi.sh project (arcane)",
});

// New compartment: does not exist yet (verified empty via `oci iam
// compartment list --include-root`, only tenancy root + chezmoi.sh are
// returned). Isolates kazimierz.akn's own OCI resources (VCN, instance,
// volume) under chezmoi.sh instead of sharing its parent compartment.
export const kazimierz = new oci.identity.Compartment("kazimierz", {
	compartmentId: chezmoiSh.id,
	name: "kazimierz.akn",
	description:
		"kazimierz.akn -- public VPS gateway (Pangolin + Gerbil + Traefik)",
});
