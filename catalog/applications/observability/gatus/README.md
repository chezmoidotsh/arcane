<!-- markdownlint-disable MD033 -->
<h1 align="center">
  Network · Gatus
  <br/>
  <img src="docs/gatus.png" alt="gatus home logo" height="75">
</h1>

<h3 align="center">Gatus - Automated developer-oriented status page</h3>

<div align="center">

[![Version](https://img.shields.io/badge/Version-v5.11.0-orange.svg)](https://github.com/TwiN/gatus/releases/tag/v5.11.0)
[![Category](https://img.shields.io/badge/Category-Observability-purple.svg)](../)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../../../LICENSE)
<br>
[![Unofficial distribution](https://img.shields.io/badge/Unofficial_Distribution-coral.svg?logo=gitlfs&logoColor=white)]()
[![Official documentation](https://img.shields.io/badge/Official_documentation-333.svg?logo=github)](https://gatus.io/docs)

<a href="#about">About</a> ·
<a href="#getting-started">Getting Started</a> ·
<a href="#security-concerns">Security concerns</a> ·
<a href="#license">License</a>

</div>

---

<!-- markdownlint-enable MD033 -->

## About

Gatus is a developer-oriented health dashboard that gives you the ability to monitor your services using HTTP, ICMP,
TCP, and even DNS queries as well as evaluate the result of said queries by using a list of conditions on values like
the status code, the response time, the certificate expiration, the body and many others. The icing on top is that each
of these health checks can be paired with alerting via Slack, Teams, PagerDuty, Discord, Twilio and many more.

### Features

-   **Highly flexible health check conditions**: While checking the response status may be enough for some use cases,
    Gatus goes much further and allows you to add conditions on the response time, the response body and even the IP
    address.
-   **Ability to use Gatus for user acceptance tests**: Thanks to the point above, you can leverage this application to
    create automated user acceptance tests.
-   **Very easy to configure**: Not only is the configuration designed to be as readable as possible, it's also
    extremely easy to add a new service or a new endpoint to monitor.
-   **Alerting**: While having a pretty visual dashboard is useful to keep track of the state of your application(s),
    you probably don't want to stare at it all day. Thus, notifications via Slack, Mattermost, Messagebird, PagerDuty,
    Twilio, Google chat and Teams are supported out of the box with the ability to configure a custom alerting provider
    for any needs you might have, whether it be a different provider or a custom application that manages automated
    rollbacks.
-   **Metrics**
-   **Low resource consumption**: As with most Go applications, the resource footprint that this application requires
    is negligibly small.
-   Badges _(see [https://github.com/TwiN/gatus/blob/master/README.md#badges](https://github.com/TwiN/gatus/blob/master/README.md#badges))_
-   **Dark mode**

<!-- markdownlint-disable MD033 -->
<p align="center">
  <img src="docs/dashboard-conditions.png" alt="Gatus screenshot" />
</p>
<!-- markdownlint-enable MD033 -->

## Getting Started

This project wraps the Gatus application in a Docker container, making it easy to deploy and run with Pulumi.
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
import { Gatus, Version } from "@catalog.chezmoi.sh/observability~gatus";

const alpine = new AlpineImage("alpine", { push: true, tags: [`my.oci.registry/alpine:${AlpineVersion}`] });
const gatus = new Gatus("gatus", {
    configuration: new asset.FileAsset("gatus.yaml"),

    imageArgs: { from: alpine, push: true, tags: [`my.oci.registry/gatus:${Version}`] },
    containerArgs: {
        wait: true,
    }
});
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
> This project is not affiliated with the Gatus project, which can be viewed on
> [their website](https://gatus.io/).
> However, if you are a maintainer of the Gatus project and would like to authorize the distribution of
> Gatus through this project, you are welcome to do so by creating a Pull Request.
