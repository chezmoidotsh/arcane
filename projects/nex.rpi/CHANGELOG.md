# Changelog _(or what I call the HISTOIRE)_

> [!NOTE]
> This document is not really a changelog like the one you can find in a software
> repository. It is something more like a story of the project, where I explain
> the reasons behind some decisions and the changes that I made to the project.

## Table of contents

## Stone Age

The project began as a straightforward repository that I would use to keep track
of the services that my Raspberry Pi 4 was hosting. The name of this was `Nex.RPi`
_(for `NEXus Raspberry Pi`)_.

It included all configuration for continuous integration testing and encrypted
ones for the `live` environment (also known as `production`), a list of locally
built images that are pushed directly to the device, a `docker-compose.yml` file
that would start all services remotely using Docker over SSH, and, lastly, some
tasks based on [`Taskfile`](https://taskfile.dev/) to make the deployment and
management of these items easier.

Since it was the project's initial iteration and quite primitive, I named it the
`Stone Age`. Nothing too sophisticated nor complex[^1], no dependencies, and
everything can be run manually.

It honors the initial versions of the infrastructure philosophy I established
for myself:

> [!IMPORTANT]
>
> -   **Everything needs to be declarative**; I need to describe my goals rather than
>     how to accomplish them.
>     -   _Using Docker and docker-compose address this first requirement._
> -   **Everything needs to be repeatable** so that I can establish the same condition.
>     -   _Using `Nix` or `Guix` in this situation should be preferable to Docker,
>         although there is a learning curve associated with these technologies. For
>         the time being (2023/2024), I would much rather use something like Docker,
>         which the great majority of people who will read this material are already
>         familiar with, than something that is not._
> -   **Everything needs to be versioned**; I need to be able to look back in time
>     and examine the infrastructure's condition at a given moment.
>     -   _Respond to this point by using Git, Docker images, and shipped configuration
>         files straight into the images._
> -   ~~**Everything needs to be _easily_ understandable**; I need to be able to explain
>     the infrastructure's operation and management to another person.~~
>     -   Well, I'll pass on this one as I'm not good at making simple stuff.
> -   **Everything needs to be tested**; I have to be able to test the hosted
>     services as well as the infrastructure.
>     -   I can build and run tests on the final image directly on my device or on a
>         continuous integration chain like GitHub Actions - _thanks to tools like `goss`_

> [!NOTE]
> This philosophy is not set in stone and can change over time. It merely serves
> as a guide for me as I construct my infrastructure. While this initial version
> is an excellent place to start, it is a little _too idealistic_.

This has some drawbacks as well:

-   Because everything is done _manually_, upkeep is somewhat expensive. Although
    `Taskfile` is very helpful, it is not sufficient, and managing an increasing
    number of services gets challenging, particularly when there are dependencies
    across images.
-   While pushing the created image directly to the device is the best way to
    ensure security, in my opinion, it is not always convenient. Moreover, no
    security checks are performed prior to the image being deployed.
-   Since rolling updates cannot be used for deployment, I must take care to
    guarantee that nothing is broken during deployment. Rolling back can be slow,
    and this project involves a growing quantity of critical services.
-   I would prefer to have a uniform method for deploying services across all
    platforms, as this project deviates too much from my homelab's method, where I
    primarily utilize Kubernetes.
-   Lastly, the most crucial factors for me: I want to enjoy myself while learning
    new things. I want to make this project less uninteresting because it
    currently is.

Still, I'm proud of this effort and think it's an excellent start. It was
implemented in the live environment on **Q1 2024**, and it functions flawlessly
and efficiently (the Raspberry Pi didn't use excessive power for inactive
components most of the time, ~5.5Wh).

## Bronze Age

The project's second iteration is called the `Bronze Age`. The project has been
completely rewritten, and Pulumi is being used as an orchestration tool to create
and roll out the services.

This rewrite is mostly motivated by my desire to _simplify_ the project's use,
but it's also an attempt to learn new skills and see if I can simplify things
further. The Pulumi ecosystem, though, adds a lot more complexity to the project
than I had anticipated.

Additionally, I want to convert this repository into a mono-repository that holds
the entire infrastructure in addition to the Raspberry Pi-hosted services. I can
handle everything consistently and get a better picture of the infrastructure in
this way.

Another objective was to launch something I named `catalog`, which would
function as a kind of service registry that anyone can use to utilize Pulumi to
deploy services on their own infrastructure. By doing this, I can give back to
the community by sharing my work and experience and perhaps even try to get others
to see my vision.

But... Unfortunately, it's not as straightforward as I had imagined to rebuild
this. I still have a lot to learn about Pulumi, the Pulumi provider, Typescript,
and some of its ecosystem, among other things. However, sticking to the same
mentality was a mistake, particularly when it came to my desire to keep everything
packaged in the same picture and deliver it straight to the device.
In order to adhere to this restriction, I
[updated the `docker-build` Pulumi provider](https://github.com/pulumi/pulumi-docker-build/pull/103),
made a tool that generates a `Dockerfile` on the fly and performed some other
dirty magic that I'm not proud of. This complicates the process greatly, and I'm
not convinced it's worth it.

I didn't want to implement this redesign without challenging the underlying
principle of this repository in light of what I've done;

> [!IMPORTANT]
>
> -   **Everything MUST be declarative _(first GitOps rule)_**
>     -   Consistency and reproducibility are ensured by defining the desired state of
>         the infrastructure, _at the expense of obscuring the necessary actions_.
>         **Everything MUST be versioned and immutable** (the second GitOps rule)
>     -   Versioning the infrastructure makes it easier to roll back in the event of a
>         failure and allows for historical and audit trail purposes.
>     -   Immutability guarantees consistency and reproducibility by preventing
>         changes to the infrastructure from being made in place and instead requiring
>         a new version.
> -   **Everything SHOULD be tested**
>     -   Verifying that an infrastructure component functions as intended is
>         accomplished by testing it. When coupled with the earlier guideline, it gives
>         me peace of mind that the infrastructure will always be in good condition.
> -   **Everyone SHOULD be able to deploy the infrastructure on their own**
>     -   The infrastructure should require little configuration and be simple to
>         deploy on any platform. Through sharing my work, I can receive feedback from
>         others and share my vision.
> -   **The infrastructure COULD be understood by anyone**
>     -   Anyone should be able to grasp the infrastructure with little difficulty. The
>         code needs to be documented if it isn't self-sufficient. I want to get better
>         at it because I want to be able to comprehend what I'm doing and why.

So, I decided jump to the next age, the `Iron Age`.

## Iron Age

> [!IMPORTANT] > **This is the current age of the project.**

I stepped back before beginning this new iteration and reevaluated my objectives
in light of the new philosophy I had chosen for myself and the knowledge I had
gained from the last one.

-   [ ] **Everything MUST be declarative _(first GitOps rule)_**

    -   I choose to use **Kubernetes as the orchestration** tool for this iteration.
        Because Kubernetes is a declarative system, I can specify the ideal state of
        the infrastructure and let it take care of the rest. Additionally, **it
        brings this project (nex·rpi) closer to my Kubernetes-based homelab
        management style**.

        It will likely result in a higher resource use on the Raspberry Pi, but
        overall, I believe the advantages outweigh the drawbacks.

-   [ ] **Everything MUST be versioned and immutable _(the second GitOps rule)_**
    -   Nothing changes for the versioned portion because I continue to utilize
        **Git** for it.
    -   Since Kubernetes is a declarative system, all changes made to any resource
        will be reflected as a new version of the resource, which will help with the
        immutable portion.
-   [ ] **Everything SHOULD be tested**
    -   To make sure everything functions as planned, I believe **Pulumi + a local
        Kubernetes cluster** for testing each component should be sufficient. I'm
        not sure how to test the finished infrastructure, though, with all the parts
        cooperating and the setup in a `live` state.
-   [ ] **Everyone SHOULD be able to deploy the infrastructure on their own**
    -   I will not change anything for this part as I already use **Pulumi** and
        **DevContainer**, which is quite straightforward to use _(but not to debug)_.
-   [ ] **The infrastructure COULD be understood by anyone**
    -   I'll make an effort to write more documentation, such as this one, when
        needed.

To summarize the chages:

-   Switch from Docker native to Kubernetes for nex·rpi.
-   Send the images to a registry instead of directly to the device.

[^1]:
    I recognize a distinction between _complexity_ and _usability_. For me,
    _complexity_ means that anything has a large number of parts or blackboxes
    that are difficult to understand and debug. It typically comes with a large
    number of _moving parts_ or third-party dependencies.
    On the other side, _usability_ refers to the notion that something is
    simple to use but may be sophisticated under the hood.
    Something simple to use can be complex; conversely, something difficult to
    use can be simple underneath.
