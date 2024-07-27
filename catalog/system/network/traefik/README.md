<!-- markdownlint-disable MD033 -->
<h1 align="center">
  System/Network · Traefik
  <br/>
  <img src="../../../../.github/assets/logo/traefik.svg" alt="traefik logo" height="75">
</h1>

<h3 align="center">Traefik - A modern HTTP reverse proxy and load balancer</h3>

<div align="center">

[![Version](https://img.shields.io/badge/Version-v0.2.0-orange.svg)](https://github.com/chezmoi-sh/yaldap/releases/tag/v0.2.0)
[![Category](https://img.shields.io/badge/Category-System%2FNetwork-purple.svg)](../)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../../LICENSE)
<br>
[![Unofficial distribution](https://img.shields.io/badge/Unofficial_Distribution-coral.svg?logo=gitlfs&logoColor=white)]()
[![Official documentation](https://img.shields.io/badge/Official_documentation-333.svg?logo=github)](https://doc.traefik.io/traefik/)

<a href="#about">About</a> ·
<a href="#getting-started">Getting Started</a> ·
<a href="#security-concerns">Security concerns</a> ·
<a href="#license">License</a>

</div>

---

<!-- markdownlint-enable MD033 -->

## About

Traefik is an [open-source](https://github.com/traefik/traefik) Edge Router that makes publishing your services a fun
and easy experience. It receives requests on behalf of your system and finds out which components are responsible for
handling them.

<!-- markdownlint-disable MD033 -->
<p align="center">
  <img src="docs/traefik-architecture.webp" alt="traefik architecture diagram" />
</p>
<!-- markdownlint-enable MD033 -->

What sets Traefik apart, besides its many features, is that it automatically discovers the right configuration for your
services. The magic happens when Traefik inspects your infrastructure, where it finds relevant information and discovers
which service serves which request.

Traefik is natively compliant with every major cluster technology, such as Kubernetes, Docker, Docker Swarm, AWS, and
[the list goes on](https://doc.traefik.io/traefik/providers/overview/); and can handle many at the same time. (It even
works for legacy software running on bare metal.)

With Traefik, there is no need to maintain and synchronize a separate configuration file: everything happens
automatically, in real time (no restarts, no connection interruptions). With Traefik, you spend time developing and
deploying new features to your system, not on configuring and maintaining its working state.

## Getting Started

This project wraps the Traefik application in a Kubernetes workload, making it easy to deploy and run with Pulumi.
In order to keep consistency over all other applications and to follow some best practices, this project builds its
own Docker image.

> [!NOTE]
> This "Pulumi application" was created with a specific vision in mind, so customization is not a strength of this
> project and only a small set of options are accessible.

### How to use this application

#### - as Kubernetes workload

```typescript
import { AlpineImage, Version as AlpineVersion } from "@catalog.chezmoi.sh/os~alpine-3.19";
import { Traefik, TraefikCRDs, Version as TraefikVersion } from "@catalog.chezmoi.sh/system.network~traefik";

new TraefikCRDs();

const alpine = new AlpineImage("alpine", {
    push: true,
    tags: [`oci.local.chezmoi.sh:5000/os/alpine:${AlpineVersion}`],
});
const traefik = new Traefik("traefik", {
    metadata: { namespace: "traefik-system" },
    configuration: {
        api: { dashboard: true },
        entryPoints: {
            traefik: { address: ":9000" },
            web: { address: ":80" },
            websecure: { address: ":443" },
        },
        providers: {
            kubernetesCRD: {},
            kubernetesGateway: {},
        },
    },

    spec: {
        images: {
            traefik: { from: alpine, tags: [`oci.local.chezmoi.sh:5000/system/network/traefik:${TraefikVersion}`] },
        },
        listeners: {
            web: { exposedOnPort: 80 },
            websecure: { exposedOnPort: 443 },
        },
        autoscaling: { minReplicas: 1, maxReplicas: 5 },
    },
});
```

## Security concerns

One of my visions is to provide a secure environment for all applications that I run at home. This is why all images are
built locally, why all dependencies, when it make sense, are pinned, and why all images are scanned for vulnerabilities
before running them (see [my Pulumi policy packs](../../../../src/policy-pack/)).
However, even with all these precautions, I'm not a security expert, so I can't guarantee that this project is 100%
secure.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](../../../../LICENSE) file for details.
