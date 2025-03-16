# Creating an OIDC Client for Authelia SSO

This guide provides step-by-step instructions for creating and configuring a new OpenID Connect (OIDC) client in Authelia Single Sign-On (SSO).

## Prerequisites

* Access to a terminal with Docker installed
* Appropriate permissions to manage Kubernetes secrets and configurations
* Access to the kubevault repository and related Kubernetes resources

## Step 1: Create the OIDC Client Configuration File

Create a configuration file at the following path:
`project/chezmoi.sh/src/kubevault/kvstore/security/sso/oidc/clients/<app-name>`

```bash
cat <<EOF > project/chezmoi.sh/src/kubevault/kvstore/security/sso/oidc/clients/<app-name>
oidc_configuration: |-
    client_id: $(docker run --rm authelia/authelia:latest authelia crypto rand --length 32 --charset alphanumeric | cut -d: -f2 | tr -d ' ')
    client_name: My App
    $( docker run --rm authelia/authelia:latest authelia crypto hash generate pbkdf2 --variant sha512 --random --random.length 72 --random.charset alphanumeric |
cut -d: -f2 | tr -d ' ' | sed '1 s/^/# client_secret: /; 2 s/^/    client_secret: /')
    redirect_uris:
      - https://app.example.com/callback
      - https://app.example.com/oauth/callback
    
    ...
EOF
```

For a complete reference of available configuration options, refer to the [Authelia OIDC client configuration documentation](https://www.authelia.com/configuration/identity-providers/openid-connect/clients/).

> \[!TIP]
> Document your configuration choices in a README file alongside your configuration, similar to the [`argocd` OIDC client configuration](../kvstore/security/sso/oidc/clients/argocd).

## Step 2: Create the Kubernetes External Secret

Update the Kubernetes External Secret definition in [`projects/nx/src/apps/nx-sso/live/production/authelia-secrets.yaml`](../../../../nx/src/apps/nx-sso/live/production/authelia-secrets.yaml):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: authelia-oidc-<app-name>
  namespace: sso
spec:
  refreshInterval: 15s
  secretStoreRef:
    kind: ClusterSecretStore
    name: kubevault
  target:
    name: authelia-oidc-<app-name>
  data:
    - secretKey: oidc_client_<app_name>
      remoteRef:
        key: security-sso-oidc-clients-<app-name>
        property: oidc_configuration
```

Replace `<app-name>` with your application's name throughout the configuration.

## Step 3: Update the Authelia Kustomization

Add the new secret to the `kustomization.yaml` file at [`projects/nx/src/apps/nx-sso/live/production/kustomization.yaml`](../../../../nx/src/apps/nx-sso/live/production/kustomization.yaml):

```yaml
                    # Other OIDC client secrets
                    - secret:
                        name: authelia-oidc-<app-name>
```

## Step 4: Update the Authelia Configuration

Modify the Authelia configuration in [`projects/nx/src/apps/nx-sso/live/production/configurations/authelia.yaml`](../../../../nx/src/apps/nx-sso/live/production/configurations/authelia.yaml) to include your new OIDC client:

```yaml
      # Other OIDC client configurations
      - {{ secret "/var/run/secrets/authelia.com/oidc_client_<app_name>" | nindent 8 }}
```

## Step 5: Apply Changes and Restart Authelia

Apply the configuration changes and restart the Authelia pod:

```bash
cd $ATLAS_DIR/projects/chezmoi.sh
just vault encrypt
just vault sync

cd $ATLAS_DIR/projects/nx
just kubernetes apply
```

## Verification

To verify that the OIDC client has been correctly configured:

1. Monitor the Authelia pod logs for successful startup without errors:
   ```bash
   kubectl -n nx-sso logs -f deployment/authelia
   ```

2. Test the authentication flow with your application.

## Troubleshooting

* If you encounter errors related to the client configuration, check that the secret is correctly mounted in the Authelia pod.
* Ensure that redirect URIs are correctly formatted and match exactly what your application is using.
* Verify that the client ID and secret are being correctly passed from your application.

## Additional Resources

* [Authelia OIDC Documentation](https://www.authelia.com/configuration/identity-providers/openid-connect/)
* [OpenID Connect Specification](https://openid.net/specs/openid-connect-core-1_0.html)
