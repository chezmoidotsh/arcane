import { randomUUID } from "crypto";
import Dockerode from "dockerode";
import LdapClient from "ldapjs-client";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { FileAsset } from "@pulumi/pulumi/asset";

import { AlpineImage } from "@catalog.chezmoi.sh/os~alpine-3.19";
import { SecretAsset } from "@chezmoi.sh/core/utils";

import { yaLDAP } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/os/alpine:${randomUUID()}`;
const yaLDAPImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/security/yaldap:${randomUUID()}`;

describe.runIf(isIntegration)("(Security) yaLDAP", () => {
    describe("yaLDAP", () => {
        describe("when it is deployed", { timeout }, async () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), {
                    builder: { name: "pulumi-buildkit" },
                    exports: [{ image: { ociMediaTypes: true, push: true } }],
                    push: false,
                    tags: [AlpineImageTag],
                });
                const yaldap = new yaLDAP(randomUUID(), {
                    configuration: new SecretAsset(new FileAsset(`${__dirname}/fixtures/backend.yaml`)),

                    imageArgs: { from: alpine, tags: [yaLDAPImageTag] },
                    containerArgs: {
                        ports: [],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...yaldap.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            let container: Dockerode.ContainerInspectInfo;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "yaldap",
                        projectName: "yaldap",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "yaldap",
                            runtime: "nodejs",
                            backend: {
                                url: `file://${tmpdir.name}`,
                            },
                        },
                    },
                );
                result = await stack.up();
                container = await new Dockerode().getContainer(result.outputs?.id.value).inspect();
            }, timeout);

            beforeEach(() => {
                expect(result.summary.result, "should be successfully deployed").toBe("succeeded");
            });

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be able to resolve LDAP queries", { concurrent: true }, async () => {
                const client = new LdapClient({ url: `ldap://${container.NetworkSettings.IPAddress}:389` });
                await client.bind("cn=alice,ou=people,c=fr,dc=example,dc=org", "alice");

                const entries = await client.search("dc=example,dc=org", { scope: "sub", filter: "(objectClass=*)" });
                expect(entries).toHaveLength(16);
            });
        });
    });
});
