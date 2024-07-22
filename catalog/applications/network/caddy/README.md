<!-- markdownlint-disable MD033 -->
<h1 align="center">
  Network · Caddy
  <br/>
  <img src="docs/caddy.png" alt="caddy home logo" height="75">
</h1>

<h3 align="center">Caddy - Fast and extensible multi-platform HTTP/1-2-3 web server with automatic HTTPS</h3>

<div align="center">

[![Version](https://img.shields.io/badge/Version-v2.8.4-orange.svg)](https://github.com/caddyserver/caddy/releases/tag/v2.8.4)
[![Category](https://img.shields.io/badge/Category-Network-purple.svg)](../)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../../LICENSE)
<br>
[![Unofficial distribution](https://img.shields.io/badge/Unofficial_Distribution-coral.svg?logo=gitlfs&logoColor=white)]()
[![Official documentation](https://img.shields.io/badge/Official_documentation-333.svg?logo=github)](https://caddyserver.com/docs/)

<a href="#about">About</a> ·
<a href="#getting-started">Getting Started</a> ·
<a href="#security-concerns">Security concerns</a> ·
<a href="#license">License</a>

</div>

---

<!-- markdownlint-enable MD033 -->

## About

Caddy is a powerful, enterprise-ready web server known for its ease of use, automatic HTTPS, and extensive
configurability. It is designed to simplify the process of deploying and managing web servers, featuring built-in
support for modern web technologies and standards.

### [Features](https://caddyserver.com/features)

-   **Easy configuration** with the [Caddyfile](https://caddyserver.com/docs/caddyfile)
-   **Powerful configuration** with its [native JSON config](https://caddyserver.com/docs/json/)
-   **Dynamic configuration** with the [JSON API](https://caddyserver.com/docs/api)
-   [**Config adapters**](https://caddyserver.com/docs/config-adapters) if you don't like JSON
-   **Automatic HTTPS** by default
    -   [ZeroSSL](https://zerossl.com) and [Let's Encrypt](https://letsencrypt.org) for public names
    -   Fully-managed local CA for internal names & IPs
    -   Can coordinate with other Caddy instances in a cluster
    -   Multi-issuer fallback
-   **Stays up when other servers go down** due to TLS/OCSP/certificate-related issues
-   **Production-ready** after serving trillions of requests and managing millions of TLS certificates
-   **Scales to hundreds of thousands of sites** as proven in production
-   **HTTP/1.1, HTTP/2, and HTTP/3** all supported by default
-   **Highly extensible** [modular architecture](https://caddyserver.com/docs/architecture) lets Caddy do anything without bloat
-   **Runs anywhere** with **no external dependencies** (not even libc)
-   Written in Go, a language with higher **memory safety guarantees** than other servers
-   Actually **fun to use**
-   So much more to [discover](https://caddyserver.com/features)

## Getting Started

This project wraps the Caddy application in a Docker container, making it easy to deploy and run with Pulumi.
In order to keep consistency over all other applications and to follow some best practices, this project builds its
own Docker image.

> [!NOTE]
> This "Pulumi application" was created with a specific vision in mind, so customization is not a strength of this
> project and only certain options (mainly runtime-related) are accessible.

### How to use this application

#### - as Docker container

> [!WARNING]
> The Docker image will embed all configuration files to package everything together ; _following my vision_, an
> OCI image should be immutable and contain everything it needs to run. **This means that all configuration files will
> be embedded in the image, including sensitive information like API keys**. This is not a security best practice, but
> it is a trade-off I made to simplify the deployment process.

```typescript
import { asset } as pulumi from "@pulumi/pulumi";
import { AlpineImage, Version as AlpineVersion } from "@catalog.chezmoi.sh/os~alpine-3.19";
import { Caddy, Version } from "@catalog.chezmoi.sh/network~caddy";

const alpine = new AlpineImage("alpine", { push: true, tags: [`my.oci.registry/alpine:${AlpineVersion}`] });
const caddy = new Caddy("caddy", {
    caddyfile: new asset.FileAsset("Caddyfile"),
    layer4: new asset.FileAsset("layer4.json"),

    imageArgs: { from: alpine, push: true, tags: [`my.oci.registry/caddy:${Version}`] },
    containerArgs: {
        wait: true,
    }
});
```

### How to use embedded configuration

The Caddy image embeds some additional features:

-   The [L4 Proxy module](https://github.com/mholt/caddy-l4) - a Layer 4 (TCP/UDP) proxy app for Caddy
-   Pre-built error pages - built with [tarampampam/error-pages](https://github.com/tarampampam/error-pages) - to provide
    a ready-to-use error page. The configuration is available [in this repository](rootfs/etc/caddy/error_pages.Caddyfile).

    To use these error pages, you need to add the following configuration to your Caddyfile:

    ```caddyfile
    import error_pages.Caddyfile

    ...
    reverse_proxy ... {
            import error_pages
            ...
    }
    ```

## Security concerns

One of my visions is to provide a secure environment for all applications that I run at home. This is why all images are
built locally, why all dependencies, when it make sense, are pinned, and why all images are scanned for vulnerabilities
before running them (see [my Pulumi policy packs](../../../../src/policy-pack/)).
However, even with all these precautions, I'm not a security expert, so I can't guarantee that this project is 100%
secure.

Futhermore, as stated in the [Getting Started](#--as-docker-container) section for the Docker container, all <!-- trunk-ignore(markdown-link-check/404): False positive on the anchor -->
configuration files are embedded in the image, including sensitive information like API keys. Take this into account
when using this project.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](../../../../LICENSE) file for details.

> [!NOTE]
> This project is not affiliated with the Caddy project, which can be viewed on
> [their website](https://caddyserver.com/).
> However, if you are a maintainer of the Caddy project and would like to authorize the distribution of
> Caddy through this project, you are welcome to do so by creating a Pull Request.
