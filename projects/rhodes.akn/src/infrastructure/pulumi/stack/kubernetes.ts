import { kubeconfigFor } from "@chezmoi.sh/pulumi-lib";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// rhodes.akn's own cluster. An explicit provider instead of the ambient default
// one (which only gets `kubernetes:context` and records the absolute path of
// $KUBECONFIG in the Pulumi state): the kubeconfig is passed as content, so the
// state stays valid whatever the machine or the location of the file.
const context = new pulumi.Config("kubernetes").require("context");

export const rhodesAknProvider = new k8s.Provider("rhodes-akn", {
	context,
	kubeconfig: kubeconfigFor(context),
});
