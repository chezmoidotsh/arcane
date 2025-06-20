# Crossplane - AWS SES Domain Identity

This Crossplane Composite Resource Definition (XRD) allows you to manage AWS
SES domain identities. Using this XRD, you can create and manage domain identities
for sending emails using the AWS SES service. It will automatically create the
necessary DNS records for verifying the domain identity.

## Usage

To use this XRD, you must have a Crossplane installation running with the
[AWS provider](https://marketplace.upbound.io/providers/upbound/provider-aws-iam/latest),
[Go templating function](https://marketplace.upbound.io/functions/crossplane-contrib/function-go-templating/latest),
[Auto ready function](https://marketplace.upbound.io/functions/crossplane-contrib/function-auto-ready/latest) and
[Cloudflare provider](https://github.com/chezmoidotsh/provider-cloudflare) *(if you use the cloudflare one)*
installed and configured.

### Install the XRD

To install the XRD, run the following command:

```shell
# TODO: Replace with the URL of the XRD package
kubectl apply --kustomize .
```

### Create an SES Domain Identity using Cloudflare DNS (example)

To create an SES domain identity using Cloudflare DNS, create a YAML file with
the following content:

```yaml
apiVersion: ses.chezmoi.sh/v1alpha1
kind: DomainIdentity
metadata:
  name: my-domain-identity
spec:
  compositionRef:
    name: cloudflare.xdomainidentities.amazonses.chezmoi.sh
  domain: example.org
  mailFrom: ses

  dnsOptions:
    dmarcOptions:
      policy: none

  providerConfigRefs:
    aws:
      name: my-aws-provider-config
      region: us-west-2
    cloudflare:
      name: my-cloudflare-provider-config
      zoneIdSelector:
        matchLabels:
          provider-cloudflare: my-zone
```

Then, apply the YAML file to your Crossplane installation:

```shell
kubectl apply -f my-domain-identity.yaml
```

## Schema

This XRD defines a custom AWS SES domain identity resource (`XDomainIdentity` and `DomainIdentity`) with the
following properties:

| Field                                             | Description                                                       | Required            |
| ------------------------------------------------- | ----------------------------------------------------------------- | ------------------- |
| spec.domain                                       | Domain name to use as the identity.                               | Yes                 |
| spec.mailFrom                                     | The email address that is used in the "From" field of the emails. | Yes                 |
| spec.dnsOptions.dmarcOptions.policy               | The DMARC policy to apply to the domain.                          | No                  |
| spec.dnsOptions.dmarcOptions.rua                  | The email address to send aggregate reports to.                   | No                  |
| spec.providerConfigRefs.aws.name                  | Reference to the AWS provider configuration.                      | No                  |
| spec.providerConfigRefs.aws.region                | The AWS region to use.                                            | Yes                 |
| spec.providerConfigRefs.cloudflare.name           | Reference to the Cloudflare provider configuration.               | No                  |
| spec.providerConfigRefs.cloudflare.zoneIdSelector | Selector to choose the Cloudflare zone to use.                    | Yes (if Cloudflare) |

## License

This XRD is released under the Apache 2.0 license. For more information, see the
[LICENSE](../../../LICENSE) file.
