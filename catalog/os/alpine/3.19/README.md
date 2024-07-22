<!-- markdownlint-disable MD033 -->
<h1 align="center">
  catalog.chezmoi.sh · Operating System · Alpine 3.19
  <br/>
  <img src="docs/alpine.png" alt="alpine logo" height="100">
</h1>

<h3 align="center">Alpine - A security-oriented, lightweight Linux distribution</h3>

<div align="center">

![Version](https://img.shields.io/badge/Version-v3.19.1-orange.svg)
![Category](https://img.shields.io/badge/Category-OS-purple.svg)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../../LICENSE)
<br>
<br>
![Unofficial distribution](https://img.shields.io/badge/Unofficial_Distribution-coral.svg)
[![Official documentation](https://img.shields.io/badge/Official_documentation-333.svg?logo=github)](https://alpinelinux.org/)

<a href="#about">About</a> ·
<a href="#getting-started">Getting Started</a> ·
<a href="#security-concerns">Security concerns</a> ·
<a href="#license">License</a>

</div>

---

<!-- markdownlint-enable MD033 -->

## About

Alpine Linux is an independent, non-commercial, general purpose Linux distribution designed for power users who
appreciate security, simplicity and resource efficiency.

**SMALL**
Alpine Linux is built around musl libc and busybox. This makes it small and very resource efficient. A container requires no more than 8 MB and a minimal installation to disk requires around 130 MB of storage. Not only do you get a fully-fledged Linux environment but a large selection of packages from the repository.

Binary packages are thinned out and split, giving you even more control over what you install, which in turn keeps your environment as small and efficient as possible.

**SIMPLE**
Alpine Linux is a very simple distribution that will try to stay out of your way. It uses its own package manager called apk, the OpenRC init system, script driven set-ups and that’s it! This provides you with a simple, crystal-clear Linux environment without all the noise. You can then add on top of that just the packages you need for your project, so whether it’s building a home PVR, or an iSCSI storage controller, a wafer-thin mail server container, or a rock-solid embedded switch, nothing else will get in the way.

**SECURE**
Alpine Linux was designed with security in mind. All userland binaries are compiled as Position Independent Executables (PIE) with stack smashing protection. These proactive security features prevent exploitation of entire classes of zero-day and other vulnerabilities.

## Getting Started

This project wraps the Alpine OS into a Pulumi application, allowing you to use it in your infrastructure as code
projects. The difference between this project and the official Alpine Linux is that the image also includes some
packages that are will be used by applications that I run at home.

> [!NOTE]
> This "Pulumi application" was created with a specific vision in mind, so customization is not a strength of this
> project and only certain options (mainly runtime-related) are accessible.

### How to use this application

#### - as Docker image

```typescript
import { asset } as pulumi from "@pulumi/pulumi";
import { AlpineImage, Version } from "@catalog.chezmoi.sh/os~alpine-3.19";

const alpine = new AlpineImage("alpine", {
    imageArgs: { push: true, tags: [`my.oci.registry:${Version}`] },
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

> [!NOTE]
> This project is not affiliated with the Alpine Linux project, which can be viewed on
> [their website](https://alpinelinux.org/).
> However, if you are a maintainer of the Alpine Linux project and would like to authorize the distribution of
> Alpine Linux through this project, you are welcome to do so by creating a Pull Request.
