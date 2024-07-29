import * as kubernetes from "@pulumi/kubernetes";
import { Namespace } from "@pulumi/kubernetes/core/v1";

import { AlpineImage, Version as AlpineVersion } from "@catalog.chezmoi.sh/os~alpine-3.19";
import { GatewayAPICRDs } from "@catalog.chezmoi.sh/system.network~gateway.networking.k8s.io/kubernetes.crds";
import { Traefik, TraefikCRDs, Version as TraefikVersion } from "@catalog.chezmoi.sh/system.network~traefik/kubernetes";

// 0. Providers and base images
const providers = { kubernetes: new kubernetes.Provider("dev", { context: "k3d-atlas-nex.rpi" }) };
const alpine = new AlpineImage(
    "alpine",
    {
        builder: { name: "pulumi-buildkit" },
        buildOnPreview: false,
        exports: [{ image: { ociMediaTypes: true, push: true } }],
        push: false,
        tags: [`oci.local.chezmoi.sh:5000/os/alpine:${AlpineVersion}`],
    },
    { providers },
);

// 1. Custom Resource Definitions
new TraefikCRDs();
new GatewayAPICRDs();

// 2. Applications
// 2.1. System
new Traefik(
    "traefik",
    {
        metadata: { namespace: new Namespace("traefik-system", {}, { provider: providers.kubernetes }).metadata.name },
        spec: {
            configuration: {
                api: { dashboard: true, insecure: true },
                entryPoints: {
                    web: { address: ":8000" },
                    websecure: { address: ":8443" },
                },
                providers: { kubernetesCRD: {}, kubernetesGateway: {} },
            },
            images: {
                traefik: { from: alpine, tags: [`oci.local.chezmoi.sh:5000/system/network/traefik:${TraefikVersion}`] },
            },
            listeners: {
                web: { exposedOnPort: 80 },
                websecure: { exposedOnPort: 443 },
            },
        },
    },
    { providers },
);
