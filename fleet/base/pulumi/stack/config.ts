// Every input of the program is read here, once. The other modules import what they need.
// The OCI and Pocket-Id providers authenticate with TF_VAR_* and POCKET_ID_API_KEY (fnox, see ../../.fnox.toml):
// never a Pulumi config, the provider configuration is stored in the state and a refresh reuses that stored copy.

// Tenancy the parent compartment lives in (stack/cloud/oci.ts).
export const tenancyOcid = process.env.TF_VAR_tenancy_ocid;
