import * as pulumi from "@pulumi/pulumi";
import { expect } from "chai";
import { before, beforeEach, describe, it } from "mocha";
import { type Dns01TokenArgs, Dns01TokenComponent } from "./index";

/**
 * Pulumi unit tests for Dns01TokenComponent.
 *
 * Strategy: register Pulumi runtime mocks that record every resource the
 * component registers, keyed by Pulumi type token. Each test builds the
 * component with distinct args and asserts against the captured inputs.
 *
 * NOTE: index.ts is intentionally never modified by these tests. Any
 * behavioral discrepancy is documented, never "fixed" here.
 */

const TYPE_ACCOUNT_TOKEN = "cloudflare:index/accountToken:AccountToken";

// The exact Cloudflare permission group IDs this component must always request —
// asserted explicitly since a wrong ID silently grants the wrong permissions.
const ZONE_READ = "c8fed203ed3043cba015a93ad1616f1f";
const ZONE_DNS_EDIT = "4755a26eedb94da69e1066d98aa820be";

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
				created[args.type] ??= [];
				created[args.type].push(args);
				// NOTE: unlike most resources, AccountToken's own `inputs.name` is the
				// human-readable label (not an identifier), so — unlike
				// cluster-vault's mock — the id is always derived from the
				// logical Pulumi resource name (`args.name`), never `inputs.name`.
				return {
					id: args.name + "_id",
					state: { ...args.inputs, value: `${args.name}_secret_value` },
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

/** Build the component against fresh captures. */
function build(name: string, args: Dns01TokenArgs): Dns01TokenComponent {
	resetCaptured();
	return new Dns01TokenComponent(name, args);
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
function inputsOf(type: string): Record<string, unknown> {
	return sole(type).inputs;
}

/** Shape of a single entry in AccountToken's `policies` input array. */
type AccountTokenPolicy = {
	effect: string;
	permissionGroups: { id: string }[];
	resources: string;
};

describe("Dns01TokenComponent", () => {
	let component: Dns01TokenComponent;

	beforeEach(async () => {
		component = build("caddy-dns01-observability", {
			owner: "chezmoi.sh",
			application: "caddy-dns01/observability",
			accountId: "00736631322131f61ce95f2c235143da",
			zoneId: "2734d7b22cf00222046320ed3187cb94",
		});
		await drain();
	});

	it("registers exactly one AccountToken", () => {
		expect(
			created[TYPE_ACCOUNT_TOKEN],
			`${TYPE_ACCOUNT_TOKEN} should be registered once`,
		).to.have.lengthOf(1);
	});

	it("scopes the token to the given account", () => {
		const token = inputsOf(TYPE_ACCOUNT_TOKEN);
		expect(token.accountId).to.equal("00736631322131f61ce95f2c235143da");
	});

	it("labels the token '(<owner>) - <application>'", () => {
		const token = inputsOf(TYPE_ACCOUNT_TOKEN);
		expect(token.name).to.equal("(chezmoi.sh) - caddy-dns01/observability");
	});

	it("scopes exactly one allow policy to Zone Read + Zone DNS Edit on the given zone", () => {
		const token = inputsOf(TYPE_ACCOUNT_TOKEN);
		const policies = token.policies as AccountTokenPolicy[];
		expect(policies).to.have.lengthOf(1);

		const policy = policies[0];
		expect(policy.effect).to.equal("allow");
		expect(policy.permissionGroups).to.have.deep.members([
			{ id: ZONE_READ },
			{ id: ZONE_DNS_EDIT },
		]);
		expect(policy.permissionGroups).to.have.lengthOf(2);
		// resources is a JSON-encoded string on AccountToken, not a plain object.
		expect(JSON.parse(policy.resources)).to.deep.equal({
			"com.cloudflare.api.account.zone.2734d7b22cf00222046320ed3187cb94": "*",
		});
	});

	it("exposes tokenId and tokenValue outputs resolving to the mocked resource", async () => {
		expect(await unwrap(component.tokenId)).to.equal(
			"caddy-dns01-observability-token_id",
		);
		expect(await unwrap(component.tokenValue)).to.equal(
			"caddy-dns01-observability-token_secret_value",
		);
	});

	it("scopes a second instance to its own zone independently of the first", async () => {
		build("cert-manager", {
			owner: "amiya.akn",
			application: "cert-manager",
			accountId: "00736631322131f61ce95f2c235143da",
			zoneId: "deadbeefdeadbeefdeadbeefdeadbeef",
		});
		await drain();

		const token = inputsOf(TYPE_ACCOUNT_TOKEN);
		expect(token.name).to.equal("(amiya.akn) - cert-manager");
		const policies = token.policies as AccountTokenPolicy[];
		expect(JSON.parse(policies[0].resources)).to.deep.equal({
			"com.cloudflare.api.account.zone.deadbeefdeadbeefdeadbeefdeadbeef": "*",
		});
	});
});
