<!-- markdownlint-disable MD033 -->
<h1 align="center">
  Network · Tailscale
  <br/>
  <img src="docs/tailscale.png" alt="tailscale home logo" height="75">
</h1>

<h3 align="center">Tailscale - The easiest, most secure way to use WireGuard and 2FA</h3>

<div align="center">

[![Version](https://img.shields.io/badge/Version-v1.66.4-orange.svg)](https://github.com/tailscale/tailscale/releases/tag/v1.66.4)
[![Category](https://img.shields.io/badge/Category-Network-purple.svg)](../)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../../LICENSE)
<br>
[![Unofficial distribution](https://img.shields.io/badge/Unofficial_Distribution-coral.svg?logo=gitlfs&logoColor=white)]()
[![Official documentation](https://img.shields.io/badge/Official_documentation-333.svg?logo=github)](https://tailscale.com/kb/1346/start)

<a href="#about">About</a> ·
<a href="#getting-started">Getting Started</a> ·
<a href="#security-concerns">Security concerns</a> ·
<a href="#license">License</a>

</div>

---

<!-- markdownlint-enable MD033 -->

## About

Tailscale is a VPN service that makes the devices and applications you own accessible anywhere in the world, securely
and effortlessly. It enables encrypted point-to-point connections using the open source
[WireGuard](https://www.wireguard.com/) protocol, which means only devices on your private network can communicate with
each other.

### The Benefits

Building on top of a secure network fabric, Tailscale offers speed, stability, and simplicity over traditional VPNs.

Tailscale is fast and reliable. Unlike traditional VPNs, which tunnel all network traffic through a central gateway
server, Tailscale creates a peer-to-peer mesh network (called a tailnet).

The Tailscale approach avoids centralization where possible, resulting in both higher throughput and lower latency as
network traffic can flow directly between machines. Additionally, decentralization improves stability and reliability
by reducing single points of failure.

Tailscale is simple and effortless. The service handles complex network configuration on your behalf so that you don’t
have to. Network connections between devices pierce through firewalls and routers as if they weren’t there, allowing for
direct connections without the need to manually configure port forwarding. It allows for connection migration so that
existing connections stay alive even when switching between different networks (for example, wired, cellular, and
Wi-Fi). With [MagicDNS](https://tailscale.com/kb/1081/magicdns), you don’t have to deal with IP addresses – you can SSH
or FTP into your device, transfer files between devices, or access a web server or database by just using a memorable
hostname.

To learn more, take a deep-dive into [how Tailscale works](https://tailscale.com/blog/how-tailscale-works) or see
[what people say about Tailscale](https://tailscale.com/customers).

### Who’s it for?

Developers can use Tailscale to publish experimental services to their team without the hassle of configuring firewall
rules and network configurations.

Small business owners can provide their work-from-home employees with a secure way to access sensitive resources in
minutes without spending thousands of dollars on traditional VPN solutions.

Enterprise leaders can reduce their security risk by drastically reducing the complexity of internal networks. By using
[Access Control Lists](https://tailscale.com/kb/1018/acls) and your existing identity provider, each user has the exact
level of access they need -- your accountants can access the payroll system, your support team can access the bug
tracker, and your developers can access servers and databases.

Reasonable [per-user pricing](https://tailscale.com/pricing) means your network can scale with you.

See the TailScale [documentation](https://tailscale.com/kb/1151/what-is-tailscale) for more information.

## Getting Started

This project wraps the Tailscale application in a Docker container, making it easy to deploy and run with Pulumi.
In order to keep consistency over all other applications and to follow some best practices, this project builds its
own Docker image.

> [!NOTE]
> This "Pulumi application" was created with a specific vision in mind, so customization is not a strength of this
> project and only certain options (mainly runtime-related) are accessible.

### How to use this application

#### - as Docker container

```typescript
import { Tailscale, Version } from "@catalog.chezmoi.sh/network~tailscale";
import { AlpineImage, Version as AlpineVersion } from "@catalog.chezmoi.sh/os~alpine-3.19";

const alpine = new AlpineImage("alpine", { push: true, tags: [`my.oci.registry/alpine:${AlpineVersion}`] });
const tailscale = new Tailscale("tailscale", {
    acceptRoutes: true,
    advertiseRoutes: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],

    imageArgs: { from: alpine, push: true, tags: [`my.oci.registry/tailscale:${Version}`] },
    containerArgs: {
        wait: true,
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

> [!NOTE]
> This project is not affiliated with the Tailscale project, which can be viewed on
> [their website](https://tailscale.com).
> However, if you are a maintainer of the Tailscale project and would like to authorize the distribution of
> Tailscale through this project, you are welcome to do so by creating a Pull Request.
