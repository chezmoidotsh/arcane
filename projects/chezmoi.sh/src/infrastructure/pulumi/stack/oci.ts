import * as oci from "@pulumi/oci";

// The parent OCI compartment of every chezmoi.sh project on Oracle Cloud: the
// compartments `horn.akn` and `exusiai.akn` are its children (each
// declared in its own project, which reads the id below by StackReference).
// It lives here, not in one of the children, so that destroying or rebuilding
// one child stack can never take the other one's parent with it.
//
// Moved from the kazimierz.akn stack with `pulumi state move` (fleet migration,
// step 6): the type, the logical name `chezmoiSh`, the parent (stack root) and
// the inputs must stay exactly as they were there, so the move needs no alias
// and the preview stays empty. Originally adopted with
//
//   pulumi import oci:identity/compartment:Compartment chezmoiSh \
//     ocid1.compartment.oc1..aaaaaaaajyh7a5rbs3gcnvmxffcwewtuftrakz5ndd6ojwxcjyjecuvnafaq
//
// `enableDelete` is left unset (false): on destroy or when this declaration is
// removed, the provider only drops the compartment from the state, it never
// deletes it in OCI.
//
// Default @pulumi/oci provider, authenticated by TF_VAR_tenancy_ocid,
// TF_VAR_user_ocid, TF_VAR_fingerprint, TF_VAR_private_key and TF_VAR_region
// from `.mise/env.yaml` (SOPS), like kazimierz.akn; the
// region also comes from `oci:region` in Pulumi.chezmoi_sh.live.yaml. Never
// pulumi config for the credentials, even `--secret`.
const tenancyOcid = process.env.TF_VAR_tenancy_ocid;
if (!tenancyOcid) {
	throw new Error(
		"TF_VAR_tenancy_ocid must be set (OCI credentials in .mise/env.yaml)",
	);
}

export const chezmoiSh = new oci.identity.Compartment("chezmoiSh", {
	compartmentId: tenancyOcid,
	name: "chezmoi.sh",
	description: "All resources used by chezmoi.sh project (arcane)",
});

// Plain string output for the StackReference of horn.akn and
// exusiai.akn: a non-secret id (ADR-017).
export const chezmoiShCompartmentId = chezmoiSh.id;
