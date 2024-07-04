import { randomUUID } from "crypto";
import Dockerode from "dockerode";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { SecretAsset } from "@chezmoi.sh/core/utils";

import { AlpineImage } from "../../../os/alpine/3.19";
import { Authelia } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 5 * 60 * 1000; // 5 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/os/alpine:${randomUUID()}`;
const AutheliaImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/security/authelia:${randomUUID()}`;

describe.runIf(isIntegration)("(Security) Authelia", () => {
    describe("Authelia", () => {
        describe("when it is deployed", { timeout }, async () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), {
                    builder: { name: "pulumi-buildkit" },
                    exports: [{ image: { ociMediaTypes: true, push: true } }],
                    push: false,
                    tags: [AlpineImageTag],
                });
                const authelia = new Authelia(randomUUID(), {
                    configuration: new SecretAsset(new asset.FileAsset(`${__dirname}/fixtures/configuration.yaml`)),
                    userDatabase: {
                        source: new SecretAsset(new asset.FileAsset(`${__dirname}/fixtures/users_database.yaml`)),
                        destination: "/etc/authelia/users_database.yml",
                    },

                    imageArgs: { from: alpine, tags: [AutheliaImageTag] },
                    containerArgs: {
                        ports: [],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...authelia.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            let container: Dockerode.ContainerInspectInfo;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "authelia",
                        projectName: "authelia",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "authelia",
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
            it("should be locally accessible", { concurrent: true }, async () => {
                const response = await fetch(`http://${container.NetworkSettings.IPAddress}:9091/`, { timeout: 500 });

                expect(response.ok).toBeTruthy();
            });
        });
    });
});
