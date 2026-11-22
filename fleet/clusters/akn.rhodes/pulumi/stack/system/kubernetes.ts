import { kubeconfigFor } from "@chezmoi.sh/pulumi-lib";
import * as k8s from "@pulumi/kubernetes";

import { kubernetesContext as context } from "../config";

// rhodes.akn's own cluster. An explicit provider instead of the ambient default
// one (which only gets `kubernetes:context` and records the absolute path of
// $KUBECONFIG in the Pulumi state): the kubeconfig is passed as content, so the
// state stays valid whatever the machine or the location of the file.

export const rhodesAknProvider = new k8s.Provider("rhodes-akn", {
	context,
	kubeconfig: kubeconfigFor(context),
});
