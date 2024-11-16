# Changelog *(or what I call the HISTOIRE)*

> \[!NOTE]
> This document is not really a changelog like the one you can find in a software
> repository. It is something more like a story of the project, where I explain
> the reasons behind some decisions and the changes that I made to the project.

## Table of contents

## Stone Age *(2023-2024 - A0)*

> \[!NOTE]
> Everything about this age can be found on the
> [`archive/stone-age`](https://github.com/chezmoi-sh/atlas/tree/archive/stone-age) branch.

The project began as a straightforward repository that I would use to keep track
of the services that my Raspberry Pi 4 was hosting. The name of this was `Nex.RPi`
*(for `NEXus Raspberry Pi`)*.

It included all configuration for continuous integration testing and encrypted
ones for the `live` environment (also known as `production`), a list of locally
built images that are pushed directly to the device, a `docker-compose.yml` file
that would start all services remotely using Docker over SSH, and, lastly, some
tasks based on [`Taskfile`](https://taskfile.dev/) to make the deployment and
management of these items easier.

Since it was the project's initial iteration and quite primitive, I named it the
`Stone Age`. Nothing too sophisticated nor complex, no dependencies, and
everything can be run manually.

> \[!NOTE]
> I recognize a distinction between *complexity* and *usability*. For me,
> *complexity* means that anything has a large number of parts or blackboxes
> that are difficult to understand and debug. It typically comes with a large
> number of *moving parts* or third-party dependencies.
> On the other side, *usability* refers to the notion that something is
> simple to use but may be sophisticated under the hood.
> Something simple to use can be complex; conversely, something difficult to
> use can be simple underneath.

It honors the initial versions of the infrastructure philosophy I established
for myself:

> \[!IMPORTANT]
>
> * \[ ] **Everything needs to be declarative**; I need to describe my goals rather than
>   how to accomplish them.
>   * *Using Docker and docker-compose address this first requirement.*
> * \[ ] **Everything needs to be repeatable** so that I can establish the same condition.
>   * *Using `Nix` or `Guix` in this situation should be preferable to Docker,
>     although there is a learning curve associated with these technologies. For
>     the time being (2023/2024), I would much rather use something like Docker,
>     which the great majority of people who will read this material are already
>     familiar with, than something that is not.*
> * \[ ] **Everything needs to be versioned**; I need to be able to look back in time
>   and examine the infrastructure's condition at a given moment.
>   * *Respond to this point by using Git, Docker images, and shipped configuration
>     files straight into the images.*
> * \[ ] ~~**Everything needs to be *easily* understandable**; I need to be able to explain
>   the infrastructure's operation and management to another person.~~
>   * Well, I'll pass on this one as I'm not good at making simple stuff.
> * \[ ] **Everything needs to be tested**; I have to be able to test the hosted
>   services as well as the infrastructure.
>   * I can build and run tests on the final image directly on my device or on a
>     continuous integration chain like GitHub Actions - *thanks to tools like `goss`*

> \[!NOTE]
> This philosophy is not set in stone and can change over time. It merely serves
> as a guide for me as I construct my infrastructure. While this initial version
> is an excellent place to start, it is a little *too idealistic*.

This has some drawbacks as well:

* Because everything is done *manually*, upkeep is somewhat expensive. Although
  `Taskfile` is very helpful, it is not sufficient, and managing an increasing
  number of services gets challenging, particularly when there are dependencies
  across images.
* While pushing the created image directly to the device is the best way to
  ensure security, in my opinion, it is not always convenient. Moreover, no
  security checks are performed prior to the image being deployed.
* Since rolling updates cannot be used for deployment, I must take care to
  guarantee that nothing is broken during deployment. Rolling back can be slow,
  and this project involves a growing quantity of critical services.
* I would prefer to have a uniform method for deploying services across all
  platforms, as this project deviates too much from my homelab's method, where I
  primarily utilize Kubernetes.
* Lastly, the most crucial factors for me: I want to enjoy myself while learning
  new things. I want to make this project less uninteresting because it
  currently is.

Still, I'm proud of this effort and think it's an excellent start. It was
implemented in the live environment on **Q1 2024**, and it functions flawlessly
and efficiently (the Raspberry Pi didn't use excessive power for inactive
components most of the time, \~5.5Wh).

## Bronze Age *(2024-2024 - A1)*

> \[!NOTE]
> Everything about this age can be found on the
> [`archive/bronze-age`](https://github.com/chezmoi-sh/atlas/tree/archive/bronze-age)
> branch.

### Age 1.0 *(Q1-Q3 2024 - A1.0)*

The project's second iteration is called the `Bronze Age`. The project has been
completely rewritten, and Pulumi is being used as an orchestration tool to create
and roll out the services.

This rewrite is mostly motivated by my desire to *simplify* the project's use,
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

> \[!IMPORTANT]
>
> * \[ ] **Everything MUST be declarative *(first GitOps rule)***
>   * Consistency and reproducibility are ensured by defining the desired state of
>     the infrastructure, *at the expense of obscuring the necessary actions*.
>     **Everything MUST be versioned and immutable** (the second GitOps rule)
>   * Versioning the infrastructure makes it easier to roll back in the event of a
>     failure and allows for historical and audit trail purposes.
>   * Immutability guarantees consistency and reproducibility by preventing
>     changes to the infrastructure from being made in place and instead requiring
>     a new version.
> * \[ ] **Everything SHOULD be tested**
>   * Verifying that an infrastructure component functions as intended is
>     accomplished by testing it. When coupled with the earlier guideline, it gives
>     me peace of mind that the infrastructure will always be in good condition.
> * \[ ] **Everyone SHOULD be able to deploy the infrastructure on their own**
>   * The infrastructure should require little configuration and be simple to
>     deploy on any platform. Through sharing my work, I can receive feedback from
>     others and share my vision.
> * \[ ] **The infrastructure COULD be understood by anyone**
>   * Anyone should be able to grasp the infrastructure with little difficulty. The
>     code needs to be documented if it isn't self-sufficient. I want to get better
>     at it because I want to be able to comprehend what I'm doing and why.

So, I decided jump to the next age, the `Iron Age`.

### Age 1.1 *(Q3 2024 - A1.1)*

I stepped back before beginning this new iteration and reevaluated my objectives
in light of the new philosophy I had chosen for myself and the knowledge I had
gained from the last one.

> \[!IMPORTANT]
>
> * \[ ] **Everything MUST be declarative *(first GitOps rule)***
>
>   * I choose to use **Kubernetes as the orchestration** tool for this iteration.
>     Because Kubernetes is a declarative system, I can specify the ideal state of
>     the infrastructure and let it take care of the rest. Additionally, **it
>     brings this project (nex·rpi) closer to my Kubernetes-based homelab
>     management style**.
>
>     It will likely result in a higher resource use on the Raspberry Pi, but
>     overall, I believe the advantages outweigh the drawbacks.
> * \[ ] **Everything MUST be versioned and immutable *(the second GitOps rule)***
>   * Nothing changes for the versioned portion because I continue to utilize
>     **Git** for it.
>   * Since Kubernetes is a declarative system, all changes made to any resource
>     will be reflected as a new version of the resource, which will help with the
>     immutable portion.
> * \[ ] **Everything SHOULD be tested**
>   * To make sure everything functions as planned, I believe **Pulumi + a local
>     Kubernetes cluster** for testing each component should be sufficient. I'm
>     not sure how to test the finished infrastructure, though, with all the parts
>     cooperating and the setup in a `live` state.
> * \[ ] **Everyone SHOULD be able to deploy the infrastructure on their own**
>   * I will not change anything for this part as I already use **Pulumi** and
>     **DevContainer**, which is quite straightforward to use *(but not to debug)*.
> * \[ ] **The infrastructure COULD be understood by anyone**
>   * I'll make an effort to write more documentation, such as this one, when
>     needed.

To summarize the chages:

* Switch from Docker native to Kubernetes for nex·rpi.
* Send the images to a registry instead of directly to the device.

It was very interesting to manage, but not without pain. This *age* has kept some
of the "good" ideas from the previous one, like the `catalog` or the global
structure, but switching to Kubernetes.\
I've learned a lot about Pulumi and Typescript, but I'm not happy with the end
result.

Pulumi is a really powerful tool, but it has a few drawbacks that I can't ignore:
using a programming language is its strength as well as its weakness.

The advantage is that I can use the same language for my entire infrastructure,
using tools and workflows that are well documented on the Internet.
However, it also means that I'm dependent on all these third-party dependencies,
which makes this project more complex to maintain (large number of dependencies)
and difficult to share with others.\
For example, I'd like to keep the `catalog` as up-to-date as possible, but anyone
who wants to use it will have to follow the same version of Pulumi and other
dependencies as I do, which is a real pain for them.

In addition, I've encountered random problems with Pulumi, such as the fact that
sometimes automation doesn't work as expected with the image build, but can be
fixed by deleting the environment and cloning it again.

## Iron Age *(2024-2024 - A2)*

> \[!NOTE]
> This is the current age of the project.

For the next iteration, I'll try to keep the same philosophy but using Helm instead
of Pulumi. I think it will be easier to maintain and share with others, but will
probably be less consistent with my homelab management style.

> \[!IMPORTANT]
>
> * \[ ] **Everything MUST be declarative *(first GitOps rule)***
>
>   * I continue to choose to use **Kubernetes as the orchestration** tool for
>     this iteration.\
>     Because Kubernetes is a declarative system, I can specify the ideal state
>     of the infrastructure and let it take care of the rest.
>
>     It will likely result in a higher resource use on the Raspberry Pi, but
>     overall, I believe the advantages outweigh the drawbacks.
>
>   * I need to find how I will handle Helm deployments in a declarative way.
> * \[ ] **Everything MUST be versioned and immutable *(the second GitOps rule)***
>   * Nothing changes for the versioned portion because I continue to utilize
>     **Git** for it.
>   * Since Kubernetes is a declarative system, all changes made to any resource
>     will be reflected as a new version of the resource, which will help with the
>     immutable portion.
>   * Helm charts are also versioned, which will help with the immutable portion.
> * \[ ] **Everything SHOULD be tested**
>   * To make sure everything functions as planned, I believe **Pulumi + a local
>     Kubernetes cluster** for testing each component should be sufficient. I'm
>     not sure how to test the finished infrastructure, though, with all the parts
>     cooperating and the setup in a `live` state.
>   * To make sure everything functions as planned, using `ct` from
>     [Helm testing project](https://github.com/helm/chart-testing) should be
>     enough. However, for the final infrastructure, I'm not sure how to test
>     all interactions between components.
> * \[ ] **Everyone SHOULD be able to deploy the infrastructure on their own**
>   * As I use a well known tool, **Helm**, I think it will be easier for others
>     to deploy the infrastructure on their own.
> * \[ ] **The infrastructure COULD be understood by anyone**
>   * I'll make an effort to write more documentation, such as this one, when
>     needed.
