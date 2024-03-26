# Docker images

All application in this repository (and probably in this organisation) are packaged in Docker images. This document
explains how applications are packaged in Docker images, and why this method has been chosen.

## How applications are packaged in Docker images

All images are built following the same architecture, which is described below. This architecture is based on 3x layers:

- **Base layer (Alpine)**: Contains the common tools and configurations for all images.
- **Application layers**: Contains the application to deploy.
- **Configuration layer**: Contains the configurations and secrets of the application.

```text
 ┌─────────────────────┐ ┌─
 │ Base layer (Alpine) │ │ Built before any other images
 ├─────────────────────┤ ├─
 │  Application layer  │ │
 ├─────────────────────┤ │ Built during the building of
 │         ...         │ │ the application image. Can contain
 ├─────────────────────┤ │ several layers.
 │  Application layer  │ │
 ├─────────────────────┤ ├─
 │ Configuration layer │ │ Last layer built
 └─────────────────────┘ └─
```

> NOTE: The configuration layer is injected directly as layer during the building process (last step).

## Why this architecture?

Before discussing the choices, here are the constraints I have set for my Docker images:

- **Minimalistic**: An image should be as small as possible to reduce bandwidth, disk space, and attack surface
  _(improve security)_.
- **Reproducible**: An image should be able to be rebuilt identically at any time.
- **Self-contained**: An image should contain everything necessary for its operation, without relying on external
  resources (unless required by the application). This includes application configurations and
  secrets.
- **Versioned**: An image should be versioned to allow reverting to a previous version if needed. This constraint is
  derived from the previous two; a version should be reproducible at any time (rebuilding an image
  from a given version) and its configuration should be frozen (included in the self-contained).
- **Simple**: An image should be simple to build, maintain, and understand for anyone who needs to work on it.

I would like to add something that is not a constraint for me that most of time is for others: **all images are built
locally and pushed directly to the servers**, without any intermediate registry. This is important because it allows
me to keep the secrets directly in the image without worrying about them being exposed.

**So, why this architecture?**

Firstly, we can consider creating image using Dockerfiles can be seen as an "reproducible" process and using Alpine
Linux, which is a minimalistic distribution, as base image helps to respect the first two constraints.

> NOTE: I know that the "reproducibility" constraint **is not fully respected here**, as I'm using the Alpine image as
> a base _(that uses the Alpine pkg repository)_ and not something like `nix` which is fully reproducible. However,
> it's a compromise I've made to keep the images simple _(using NixOS really isn't something anyone can read)_ and
> light \_(during some tests with `nix build` and the Tailscale image, I built an image weighing 3.5x heavier because it
> includes `systemd` inside).

Secondly, integrating the configuration and secrets in the image helps to respect the third constraint; this way, the
image is self-contained. Of course, this is not the best practice for secrets, but it is a trade-off I made to keep
the images simple. Keep in mind that all images are build locally and pushed directly to the server, so the secrets won't
leave the local machine nor the server.

Finally, the versioning is respected by tagging any dependencies inside Dockerfiles.
