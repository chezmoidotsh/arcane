import { execFileSync } from "node:child_process";

import * as pulumi from "@pulumi/pulumi";

type Run = (file: string, args: string[]) => string;

const kubectl: Run = (file, args) => execFileSync(file, args, { encoding: "utf8" });

/**
 * The kubeconfig of a single kubectl context, as content rather than a path.
 *
 * A `k8s.Provider` given only a `context` falls back on the `KUBECONFIG` env
 * var, and the SDK records that *absolute path* in the Pulumi state. Any other
 * machine, mount point or later move of the file then leaves a path that no
 * longer exists in the state, and every resource behind the provider fails with
 * `unreachable cluster` (`cannot unmarshal string ...`). Passing the content
 * keeps the state independent of where the kubeconfig lives.
 *
 * The content is cut down to `context` (`kubectl config view --minify`), so the
 * credentials of the other clusters in the file never reach the state, and it is
 * stored as a secret.
 */
export function kubeconfigFor(
	context: string,
	run: Run = kubectl,
): pulumi.Output<string> {
	return pulumi.secret(
		run("kubectl", ["config", "view", "--minify", "--raw", "--context", context]),
	);
}
