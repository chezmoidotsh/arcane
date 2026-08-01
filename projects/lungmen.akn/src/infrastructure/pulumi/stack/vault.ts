import { ClusterVaultComponent } from "@chezmoi.sh/pulumi-cluster-vault";
import * as config from "../config";

// -----------------------------------------------------------------------------
// Cluster's own Vault access (KV mount + remote Kubernetes auth backend + ESO role)
// -----------------------------------------------------------------------------
// External Secrets Operator (ESO) running in this cluster needs its own
// dedicated KV mount and a Kubernetes auth backend to authenticate against,
// scoped to this cluster only. Vault reaches lungmen.akn's Kubernetes API over
// an untrusted network path, so the auth backend needs the cluster's CA and a
// reviewer JWT rather than the in-cluster default. ESO authenticates via the
// generated `lungmen.akn-eso-role` to read the `lungmen.akn/` KV mount, plus
// the mutualized-cnpg-databases policy below.
new ClusterVaultComponent("lungmen.akn", {
	name: "lungmen.akn",
	additionalPolicies: {
		// Lets ESO push CNPG-generated database credentials into Vault for the
		// mutualized-cnpg-databases chart.
		"mutualized-cnpg-databases": `
path "lungmen.akn/data/+/database/*" { capabilities = ["create", "read", "update", "delete"] }
path "lungmen.akn/metadata/+/database/*" { capabilities = ["create", "read", "update", "delete"] }
`,
	},
	remote: {
		host: "https://10.128.0.19:6443", // temporary — talosnet bridge, see MIGR-20260801-00. Revert to
		// kubernetes.lungmen.akn.chezmoi.sh once lungmen is recreated under #1072
		caCert: config.remoteCluster.kubernetesCaCert,
		tokenReviewerJwt: config.remoteCluster.tokenReviewerJwt,
	},
});
