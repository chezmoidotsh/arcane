import * as proxmox from "@pulumi/proxmox";
import * as pulumi from "@pulumi/pulumi";
import { expect } from "chai";
import { before, beforeEach, describe, it } from "mocha";
import {
	type ProxmoxClusterIdentityArgs,
	ProxmoxClusterIdentityComponent,
} from "./index";

/**
 * Pulumi unit tests for ProxmoxClusterIdentityComponent.
 *
 * Strategy: register Pulumi runtime mocks that record every resource the
 * component registers, keyed by Pulumi type token. Each test builds the
 * component with a distinct name and asserts against the captured inputs.
 */

const TYPE_ROLE = "proxmox:index/virtualEnvironmentRole:VirtualEnvironmentRole";
const TYPE_USER = "proxmox:index/virtualEnvironmentUser:VirtualEnvironmentUser";
const TYPE_TOKEN = "proxmox:index/userToken:UserToken";
const TYPE_ACL = "proxmox:index/acl:Acl";

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
				// UserToken.value is provider-computed (the actual minted secret),
				// never a caller input — synthesize one so tokenSecret resolves to
				// something under mocks, matching how the real provider behaves.
				const state: Record<string, unknown> = { ...args.inputs };
				if (args.type === TYPE_TOKEN) {
					state.value = "mock-token-secret";
				}
				return { id: (args.inputs.name ?? args.name) + "_id", state };
			},
			call(args: pulumi.runtime.MockCallArgs) {
				return args.inputs;
			},
		},
		"test",
		"test",
	);
});

function unwrap<T>(output: pulumi.Output<T>): Promise<T> {
	return new Promise<T>((resolve) => output.apply((value) => resolve(value)));
}

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

function resetCaptured(): void {
	for (const key of Object.keys(created)) delete created[key];
}

function build(
	name: string,
	args: Omit<ProxmoxClusterIdentityArgs, "provider">,
): ProxmoxClusterIdentityComponent {
	resetCaptured();
	// Created inside build(), never at module scope: mocks are only installed
	// by the global `before` hook, which runs after module load but before any
	// test — a module-scope provider would register against the real runtime.
	const provider = new proxmox.Provider("test-pve", {
		endpoint: "https://test",
	});
	return new ProxmoxClusterIdentityComponent(name, { ...args, provider });
}

describe("ProxmoxClusterIdentityComponent", () => {
	let component: ProxmoxClusterIdentityComponent;

	beforeEach(async () => {
		component = build("kubernetes-cloud-provider", {
			userId: "kubernetes-cloud-provider@pve",
			comment: "test identity",
			role: {
				roleId: "KubernetesCloudProvider",
				privileges: ["Sys.Audit", "VM.Audit"],
			},
			aclPaths: ["/nodes/pve-01", "/pool/talos"],
			tokenName: "cloud-provider",
			tokenComment: "test token",
		});
		await drain();
	});

	it("creates exactly one role, one user, and one token", () => {
		expect(created[TYPE_ROLE]).to.have.lengthOf(1);
		expect(created[TYPE_USER]).to.have.lengthOf(1);
		expect(created[TYPE_TOKEN]).to.have.lengthOf(1);
	});

	it("configures the role with the given id and privileges", () => {
		const role = created[TYPE_ROLE][0].inputs;
		expect(role.roleId).to.equal("KubernetesCloudProvider");
		expect(role.privileges).to.deep.equal(["Sys.Audit", "VM.Audit"]);
	});

	it("configures the user with the given id and comment", () => {
		const user = created[TYPE_USER][0].inputs;
		expect(user.userId).to.equal("kubernetes-cloud-provider@pve");
		expect(user.comment).to.equal("test identity");
		expect(user.enabled).to.equal(true);
	});

	it("configures the token with privilegesSeparation disabled", () => {
		const token = created[TYPE_TOKEN][0].inputs;
		expect(token.tokenName).to.equal("cloud-provider");
		expect(token.comment).to.equal("test token");
		expect(token.privilegesSeparation).to.equal(false);
	});

	it("creates one Acl per aclPaths entry, each bound to the role", () => {
		const acls = created[TYPE_ACL];
		expect(acls).to.have.lengthOf(2);
		const paths = acls.map((a) => a.inputs.path).sort();
		expect(paths).to.deep.equal(["/nodes/pve-01", "/pool/talos"]);
		for (const acl of acls) {
			expect(acl.inputs.roleId).to.equal("KubernetesCloudProvider");
			expect(acl.inputs.propagate).to.equal(true);
		}
	});

	it("exposes tokenId and tokenSecret outputs", async () => {
		expect(await unwrap(component.tokenId)).to.equal(
			"kubernetes-cloud-provider@pve!cloud-provider",
		);
		expect(await unwrap(component.tokenSecret)).to.be.a("string");
	});
});
