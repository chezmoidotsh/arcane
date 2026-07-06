import * as pulumi from "@pulumi/pulumi";
import { expect } from "chai";
import { before, beforeEach, describe, it } from "mocha";
import { type ClusterVaultArgs, ClusterVaultComponent } from "./index";

/**
 * Pulumi unit tests for ClusterVaultComponent.
 *
 * Strategy: register Pulumi runtime mocks that record every resource the
 * component registers, keyed by Pulumi type token. Each test builds the
 * component with a distinct name and asserts against the captured inputs.
 * Output-typed inputs (e.g. the role's tokenPolicies) and the component's own
 * outputs are unwrapped via apply(), because the mock engine produces their
 * resolved values asynchronously.
 *
 * NOTE: index.ts is intentionally never modified by these tests. Any
 * behavioral discrepancy is documented, never "fixed" here.
 */

// Pulumi type tokens emitted by the component's child resources.
const TYPE_MOUNT = "vault:index/mount:Mount";
const TYPE_AUTH_BACKEND = "vault:index/authBackend:AuthBackend";
const TYPE_AUTH_BACKEND_CONFIG =
	"vault:kubernetes/authBackendConfig:AuthBackendConfig";
const TYPE_POLICY = "vault:index/policy:Policy";
const TYPE_AUTH_BACKEND_ROLE =
	"vault:kubernetes/authBackendRole:AuthBackendRole";

const CHILD_TYPE_TOKENS = [
	TYPE_MOUNT,
	TYPE_AUTH_BACKEND,
	TYPE_AUTH_BACKEND_CONFIG,
	TYPE_POLICY,
	TYPE_AUTH_BACKEND_ROLE,
];

const LOCAL_K8S_HOST = "https://kubernetes.default.svc.cluster.local";

/** Captures every resource registered under mocks, keyed by type token. */
const created: Record<string, pulumi.runtime.MockResourceArgs[]> = {};

before(async () => {
	// NOTE: the installed @pulumi/pulumi (3.250.0) declares setMocks with
	// positional string arguments (project, stack) and returns a Promise — it
	// does NOT accept the { project, stack } object form. Awaiting it in the
	// global `before` guarantees mocks are installed before any test runs.
	await pulumi.runtime.setMocks(
		{
			newResource(args: pulumi.runtime.MockResourceArgs) {
				(created[args.type] ??= []).push(args);
				return {
					id: (args.inputs.name ?? args.name) + "_id",
					state: args.inputs,
				};
			},
			call(args: pulumi.runtime.MockCallArgs) {
				return args.inputs;
			},
		},
		"test",
		"test",
	);
});

/** Unwrap a Pulumi Output to its inner value, resolved as a promise. */
function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
	return new Promise<T>((resolve) => output.apply((value) => resolve(value)));
}

/**
 * Pulumi's sentinel marking a serialized secret. It is the SHA-256 hash of the
 * literal "pulumi-secret"; the engine attaches it to any value flagged secret.
 */
const PULUMI_SECRET_SIG = "4dabf18193072939515e22adb298388d";

/**
 * Extract the plaintext value the component passed to a resource input.
 *
 * Under mocks the engine does not unwrap secret-marked inputs: it serializes
 * them as `{ [PULUMI_SECRET_SIG]: "<marker>", value: <plaintext> }`. The Vault
 * provider marks `tokenReviewerJwt` as secret (a JWT credential), so the mock
 * captures that object instead of the raw string. Plain values and
 * already-resolved arrays (e.g. tokenPolicies) pass through unchanged.
 */
function reveal<T>(input: unknown): T {
	if (
		typeof input === "object" &&
		input !== null &&
		PULUMI_SECRET_SIG in input
	) {
		return (input as unknown as { value: T }).value;
	}
	return input as T;
}

/**
 * Flush Pulumi's asynchronous mock registration queue.
 *
 * Resource construction schedules registerResource on the event loop, so the
 * mock's newResource fires AFTER the constructor returns. We spin until two
 * consecutive idle ticks record no new captures, guaranteeing the full child
 * graph is present before assertions read it. The tick cap guards against an
 * accidental infinite loop if a resource were to register repeatedly.
 */
async function drain(): Promise<void> {
	let previous = -1;
	for (let idle = 0, ticks = 0; idle < 2 && ticks < 50; ticks++) {
		await new Promise<void>((resolve) => setImmediate(resolve));
		const total = Object.values(created).reduce(
			(sum, list) => sum + list.length,
			0,
		);
		idle = total === previous ? idle + 1 : 0;
		previous = total;
	}
}

/** Drop every captured resource so the next test starts from a clean slate. */
function resetCaptured(): void {
	for (const key of Object.keys(created)) delete created[key];
}

/** Build the component against fresh captures, using args.name as the logical name. */
function build(args: ClusterVaultArgs): ClusterVaultComponent {
	resetCaptured();
	return new ClusterVaultComponent(args.name, args);
}

/** Return the single captured resource of a type. Fail fast if missing or duplicated. */
function sole(type: string): pulumi.runtime.MockResourceArgs {
	const captures = created[type];
	if (!captures || captures.length === 0) {
		throw new Error(`Expected one resource of type ${type}, found none`);
	}
	if (captures.length > 1) {
		throw new Error(
			`Expected exactly one resource of type ${type}, found ${captures.length}`,
		);
	}
	return captures[0];
}

/** Return the inputs of the single captured resource of a type. */
function inputsOf(type: string): Record<string, any> {
	return sole(type).inputs;
}

// ----------------------------------------------------------------------------
// A. Local variant: no remote, no tailscaled. Shared access is always on.
// ----------------------------------------------------------------------------
describe("ClusterVaultComponent — Local variant", () => {
	const NAME = "amiya-akn";
	let component: ClusterVaultComponent;

	beforeEach(async () => {
		component = build({ name: NAME });
		await drain();
	});

	it("registers exactly five child resources", () => {
		for (const token of CHILD_TYPE_TOKENS) {
			expect(
				created[token],
				`${token} should be registered once`,
			).to.have.lengthOf(1);
		}
	});

	it("configures the KV v2 mount with the cluster name as its path", () => {
		const mount = inputsOf(TYPE_MOUNT);
		expect(mount.path).to.equal(NAME);
		expect(mount.type).to.equal("kv");
		expect(mount.options).to.deep.equal({ version: "2" });
		expect(mount.description).to.equal(`kv v2 mount for local cluster ${NAME}`);
	});

	it("configures the Kubernetes auth backend", () => {
		const authBackend = inputsOf(TYPE_AUTH_BACKEND);
		expect(authBackend.path).to.equal(NAME);
		expect(authBackend.type).to.equal("kubernetes");
		expect(authBackend.description).to.equal(
			`kubernetes auth backend for local cluster ${NAME}`,
		);
	});

	it("uses the in-cluster Kubernetes host and leaves disableLocalCaJwt unset", () => {
		const config = inputsOf(TYPE_AUTH_BACKEND_CONFIG);
		expect(config.kubernetesHost).to.equal(LOCAL_K8S_HOST);
		expect(config.disableLocalCaJwt).to.be.undefined;
		expect(config.kubernetesCaCert).to.be.undefined;
		expect(config.tokenReviewerJwt).to.be.undefined;
	});

	it("grants shared access (Local always enables it)", () => {
		const policy = inputsOf(TYPE_POLICY).policy as string;
		expect(policy).to.include(`path "${NAME}/*"`);
		expect(policy).to.include(`shared/+/third-parties/+/+/${NAME}`);
		expect(policy).to.include(`shared/+/third-parties/+/+/${NAME}/*`);
		expect(policy).to.include("shared/+/certificates/*");
	});

	it("binds the ESO service account to the generated policy", () => {
		const policy = inputsOf(TYPE_POLICY);
		expect(policy.name).to.equal(`${NAME}-eso-policy`);

		const role = inputsOf(TYPE_AUTH_BACKEND_ROLE);
		expect(role.roleName).to.equal(`${NAME}-eso-role`);
		expect(role.boundServiceAccountNames).to.include("external-secrets");
		expect(role.boundServiceAccountNamespaces).to.include(
			"external-secrets-system",
		);
		expect(role.tokenTtl).to.equal(900);
		expect(role.tokenMaxTtl).to.equal(1800);
	});

	it("exposes mountPath and authBackendPath outputs resolving to the cluster name", async () => {
		expect(await unwrap(component.mountPath)).to.equal(NAME);
		expect(await unwrap(component.authBackendPath)).to.equal(NAME);
	});
});

// ----------------------------------------------------------------------------
// B. Remote variant: shared access defaults to true when undefined.
// ----------------------------------------------------------------------------
describe("ClusterVaultComponent — Remote variant (shared access default)", () => {
	const NAME = "lungmen-akn";
	const remote = {
		host: "https://1.2.3.4:6443",
		caCert: "CA-BASE64",
		tokenReviewerJwt: "JWT",
		// enableSharedAccess intentionally omitted to exercise the default.
	};

	beforeEach(async () => {
		build({ name: NAME, remote });
		await drain();
	});

	it("points the auth backend config at the remote host with CA + reviewer JWT", () => {
		const config = inputsOf(TYPE_AUTH_BACKEND_CONFIG);
		expect(config.kubernetesHost).to.equal("https://1.2.3.4:6443");
		expect(config.disableLocalCaJwt).to.equal(true);
		expect(reveal<string>(config.kubernetesCaCert)).to.equal("CA-BASE64");
		// tokenReviewerJwt is a credential, so the Vault provider flags it
		// secret and the mock captures the serialized secret wrapper — reveal()
		// unwraps it back to the plaintext passed by the caller.
		expect(reveal<string>(config.tokenReviewerJwt)).to.equal("JWT");
	});

	it("keeps shared access enabled by default", () => {
		const policy = inputsOf(TYPE_POLICY).policy as string;
		expect(policy).to.include(`shared/+/third-parties/+/+/${NAME}`);
		expect(policy).to.include("shared/+/certificates/*");
	});
});

// ----------------------------------------------------------------------------
// C. Remote variant with shared access explicitly disabled.
// ----------------------------------------------------------------------------
describe("ClusterVaultComponent — Remote variant (shared access disabled)", () => {
	const NAME = "shodan-akn";

	beforeEach(async () => {
		build({
			name: NAME,
			remote: {
				host: "https://10.0.0.5:6443",
				caCert: "CA-BASE64",
				tokenReviewerJwt: "JWT",
				enableSharedAccess: false,
			},
		});
		await drain();
	});

	it("emits only the project-scoped policy, with no shared paths", () => {
		const policy = inputsOf(TYPE_POLICY).policy as string;
		expect(policy).to.include(`path "${NAME}/*"`);
		expect(policy).to.not.include("shared/third-parties");
		expect(policy).to.not.include("shared/certificates");
	});
});

// ----------------------------------------------------------------------------
// D. Tailscaled variant: host overridden, but no CA/JWT override.
// ----------------------------------------------------------------------------
describe("ClusterVaultComponent — Tailscaled variant", () => {
	const NAME = "kazimierz-akn";

	beforeEach(async () => {
		build({ name: NAME, tailscaled: { host: "https://tailnet-host:6443" } });
		await drain();
	});

	it("uses the tailnet host and leaves disableLocalCaJwt unset", () => {
		const config = inputsOf(TYPE_AUTH_BACKEND_CONFIG);
		expect(config.kubernetesHost).to.equal("https://tailnet-host:6443");
		expect(config.disableLocalCaJwt).to.be.undefined;
		expect(config.kubernetesCaCert).to.be.undefined;
		expect(config.tokenReviewerJwt).to.be.undefined;
	});

	it("always grants shared access", () => {
		const policy = inputsOf(TYPE_POLICY).policy as string;
		expect(policy).to.include(`shared/+/third-parties/+/+/${NAME}`);
		expect(policy).to.include("shared/+/certificates/*");
	});
});

// ----------------------------------------------------------------------------
// E. additionalPolicies are created by the component and merged into the
//    role's tokenPolicies.
// ----------------------------------------------------------------------------
describe("ClusterVaultComponent — additionalPolicies", () => {
	it("creates each extra policy prefixed by the cluster name and binds it to the ESO role", async () => {
		build({
			name: "x",
			additionalPolicies: {
				"mutualized-cnpg-databases": `path "x/data/+/database/*" { capabilities = ["read"] }`,
			},
		});
		await drain();

		// Two vault.Policy resources now: the generated ESO policy and the
		// caller-supplied additional one — so `sole()`/`inputsOf()` can't be
		// used here, unlike the other describe blocks.
		const policies = created[TYPE_POLICY];
		expect(policies).to.have.lengthOf(2);

		const additional = policies.find(
			(p) => p.inputs.name === "x-mutualized-cnpg-databases",
		);
		expect(additional, "additional policy should be created").to.exist;
		expect(additional!.inputs.policy).to.include('path "x/data/+/database/*"');

		const role = inputsOf(TYPE_AUTH_BACKEND_ROLE);
		// pulumi.all(...) resolves to a plain array under the mock, so reveal()
		// returns it as-is — no Output to unwrap.
		const tokenPolicies = reveal<string[]>(role.tokenPolicies);
		expect(tokenPolicies).to.include("x-eso-policy");
		expect(tokenPolicies).to.include("x-mutualized-cnpg-databases");
	});
});

// ----------------------------------------------------------------------------
// E2. additionalPolicyNames bind an existing, externally-managed policy by
//     name without the component creating a vault.Policy for it.
// ----------------------------------------------------------------------------
describe("ClusterVaultComponent — additionalPolicyNames", () => {
	it("binds the named policies to the ESO role without creating a Policy resource for them", async () => {
		build({
			name: "x",
			additionalPolicyNames: ["x-authelia-policy", "x-crossplane-policy"],
		});
		await drain();

		// Only the generated ESO policy — no vault.Policy was created for the
		// externally-managed names.
		const policies = created[TYPE_POLICY];
		expect(policies).to.have.lengthOf(1);
		expect(policies[0].inputs.name).to.equal("x-eso-policy");

		const role = inputsOf(TYPE_AUTH_BACKEND_ROLE);
		const tokenPolicies = reveal<string[]>(role.tokenPolicies);
		expect(tokenPolicies).to.include("x-eso-policy");
		expect(tokenPolicies).to.include("x-authelia-policy");
		expect(tokenPolicies).to.include("x-crossplane-policy");
	});
});

// ----------------------------------------------------------------------------
// F. remote and tailscaled are mutually exclusive.
// ----------------------------------------------------------------------------
describe("ClusterVaultComponent — mutually exclusive variants", () => {
	it("throws when both remote and tailscaled are provided", () => {
		// The constructor throws synchronously: super() registers the component
		// resource, then the mutual-exclusion guard raises before any child is
		// created. chai's .to.throw() therefore catches it directly.
		expect(
			() =>
				new ClusterVaultComponent("bad", {
					name: "bad",
					remote: {
						host: "https://1.2.3.4:6443",
						caCert: "CA",
						tokenReviewerJwt: "JWT",
					},
					tailscaled: { host: "https://tailnet-host:6443" },
				}),
		).to.throw(/mutually exclusive/);
	});
});
