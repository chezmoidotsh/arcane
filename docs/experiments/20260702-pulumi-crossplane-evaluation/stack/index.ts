import { ClusterVaultComponent } from "../catalog/cluster-vault";

// Sandbox-only cluster name: this stack never touches the real amiya.akn or
// lungmen.akn OpenBao instances, only the disposable dev-mode OpenBao
// deployed by scripts/bootstrap.sh.
const clusterVault = new ClusterVaultComponent("poc-cluster", {
	name: "poc-cluster",
});

export const mountPath = clusterVault.mountPath;
export const authBackendPath = clusterVault.authBackendPath;
