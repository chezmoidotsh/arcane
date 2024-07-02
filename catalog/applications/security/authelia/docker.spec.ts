import { randomUUID } from "crypto";
import { getRandomPort } from "get-port-please";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { SecretAsset } from "@chezmoi.sh/core/utils";

import { AlpineImage, Version as AlpineVersion } from "../../../os/alpine/3.19";
import { Authelia, Version } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const AlpineImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/os/alpine:${AlpineVersion}`;
const AutheliaImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh"}/security/authelia:${Version}`;

describe.runIf(isIntegration)("(Security) Authelia", () => {
    describe("Authelia", () => {
        describe("when it is deployed", { timeout }, async () => {
            const ports = {
                http: await getRandomPort(),
            };

            // -- Prepare Pulumi execution --
            const program = async () => {
                const alpine = new AlpineImage(randomUUID(), { push: true, tags: [AlpineImageTag] });
                const authelia = new Authelia(randomUUID(), {
                    configuration: new SecretAsset(new asset.FileAsset(`${__dirname}/fixtures/configuration.yaml`)),
                    userDatabase: {
                        source: new SecretAsset(new asset.FileAsset(`${__dirname}/fixtures/users_database.yaml`)),
                        destination: "/etc/authelia/users_database.yml",
                    },

                    imageArgs: { from: alpine, push: true, tags: [AutheliaImageTag] },
                    containerArgs: {
                        ports: [{ internal: 9091, external: ports.http, protocol: "tcp" }],
                        wait: true,
                    },
                });
                return { ...authelia.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
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
            }, timeout);

            beforeEach(() => {
                expect(result.summary.result, "should be successfully deployed").toBe("succeeded");
            });

            afterAll(async () => {
                await stack.destroy();
            }, timeout);

            // -- Assertions --
            it("should be locally accessible", { concurrent: true }, async () => {
                const response = await fetch(`http://localhost:${ports.http}/`);

                expect(response.ok).toBeTruthy();
            });
        });
    });
});
