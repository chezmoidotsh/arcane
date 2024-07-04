import { randomUUID } from "crypto";
import Dockerode from "dockerode";
import fetch from "node-fetch";
import tmp from "tmp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as automation from "@pulumi/pulumi/automation";
import { asset } from "@pulumi/pulumi";

import { DirectoryAsset } from "@chezmoi.sh/core/utils";

import { Homepage } from "./docker";

const isIntegration = (process.env.VITEST_RUN_TYPE ?? "").includes("integration:docker");
const timeout = 2 * 60 * 1000; // 2 minutes

const HomepageImageTag = `${process.env.CI_OCI_REGISTRY ?? "oci.local.chezmoi.sh:5000"}/miscellaneous/startpage/homepage:${randomUUID()}`;

describe.runIf(isIntegration)("(Miscellaneous/Startpage) Homepage", () => {
    describe("Homepage", () => {
        describe("when it is deployed", { timeout }, async () => {
            // -- Prepare Pulumi execution --
            const program = async () => {
                const homepage = new Homepage(randomUUID(), {
                    public: new DirectoryAsset(`${__dirname}/fixtures/assets`).assets,
                    configuration: {
                        bookmarks: new asset.FileAsset(`${__dirname}/fixtures/bookmarks.yaml`),
                        customCSS: new asset.FileAsset(`${__dirname}/fixtures/custom.css`),
                        customJS: new asset.FileAsset(`${__dirname}/fixtures/custom.js`),
                        services: new asset.FileAsset(`${__dirname}/fixtures/services.yaml`),
                        settings: new asset.FileAsset(`${__dirname}/fixtures/settings.yaml`),
                        widgets: new asset.FileAsset(`${__dirname}/fixtures/widgets.yaml`),
                    },

                    imageArgs: {
                        builder: { name: "pulumi-buildkit" },
                        exports: [{ image: { ociMediaTypes: true, push: true } }],
                        push: false,
                        tags: [HomepageImageTag],
                    },
                    containerArgs: {
                        ports: [],
                        wait: true,
                        waitTimeout: 30,
                    },
                });
                return { ...homepage.container };
            };

            let stack: automation.Stack;
            let result: automation.UpResult;
            let container: Dockerode.ContainerInspectInfo;
            beforeAll(async () => {
                const tmpdir = tmp.dirSync();
                stack = await automation.LocalWorkspace.createOrSelectStack(
                    {
                        stackName: "homepage",
                        projectName: "homepage",
                        program,
                    },
                    {
                        secretsProvider: "passphrase",
                        projectSettings: {
                            name: "homepage",
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
            it("should be locally accessible", async () => {
                const response = await fetch(`http://${container.NetworkSettings.IPAddress}:3000/`, {
                    timeout: 2500,
                });

                expect(response.status).toBe(200);
            });
        });
    });
});
