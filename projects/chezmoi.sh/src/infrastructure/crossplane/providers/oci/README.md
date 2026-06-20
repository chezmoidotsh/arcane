***

# Oracle Cloud OCI provider setup

This directory installs Oracle's native Crossplane OCI provider and wires its
credentials from OpenBao.

The OpenBao secret path follows ADR-003:

\- `shared/third-parties/oci/iam/chezmoi.sh/crossplane-rw`

The secret metadata also follows ADR-003:

\- `origin`
\- `description`
\- `owner`

## 1. Create the OCI user and permissions

Create a dedicated IAM user and group for Crossplane. Keep the user separate
from your personal account so the API key can be rotated or revoked without
affecting anything else.

```bash
oci iam group create \
  --name crossplane-rw \
  --description "Crossplane OCI writers" \
  | tee >(jq -r '.data.id' > group-ocid.txt)

oci iam user create \
  --name crossplane-rw \
  --description "OCI API user for Crossplane" \
  --email "no-reply@chezmoi.sh" \
  | tee >(jq -r '.data.id' > user-ocid.txt)

USER_OCID=$(<user-ocid.txt)
GROUP_OCID=$(<group-ocid.txt)

oci iam group add-user \
  --user-id "$USER_OCID" \
  --group-id "$GROUP_OCID"

rm -f user-ocid.txt group-ocid.txt
```

The group only needs rights to manage OCI core resources in the target
compartment:

\- `virtual-network-family` for VCNs, subnets, route tables, internet gateways,
security lists, and related network resources
\- `instance-family` for compute instances

Create the policy in the tenancy or in the compartment that owns the target
resources:

```bash
oci iam policy create \
  --compartment-id "$TENANCY_OCID" \
  --name crossplane-rw \
  --description "Allow Crossplane to manage OCI core resources" \
  --statements '[
    "Allow group 'crossplane-rw' to manage virtual-network-family in compartment chezmoi.sh",
    "Allow group 'crossplane-rw' to manage instance-family in compartment chezmoi.sh"
  ]'
```

If the policy should be narrower, replace `<target-compartment-name>` with the
exact compartment name you want Crossplane to manage.

## 2. Create the OCI API signing key

Generate a dedicated RSA key pair for the `crossplane-rw` user:

```bash
openssl genrsa -out oci-crossplane-rw.pem 2048
openssl rsa -in oci-crossplane-rw.pem -pubout -out oci-crossplane-rw-public.pem
```

Upload the public key to OCI and capture the fingerprint returned by OCI:

```bash
oci iam user api-key upload \
  --user-id "$USER_OCID" \
  --key-file oci-crossplane-rw-public.pem \
  | jq --arg user_ocid $USER_OCID --arg tenant_ocid $TENANCY_OCID '
  {
    "tenancy_ocid": $tenant_ocid,
    "user_ocid": $user_ocid,
    "private_key": .data."key-value",
    "fingerprint": .data."fingerprint",
    "region": "eu-paris-1",
    "auth": "ApiKey"
  }' \
  > oci-credentials.json
```

## 3. Store the OCI credentials in OpenBao

```bash
bao kv put -mount=shared \
  "third-parties/oci/iam/chezmoi.sh/crossplane-rw" \
  @oci-credentials.json

bao kv metadata put -mount=shared \
  -custom-metadata origin=manual \
  -custom-metadata description="OCI API signing credentials for Crossplane" \
  -custom-metadata owner="chezmoi.sh/crossplane" \
  -custom-metadata created-by="oci iam user api-key upload" \
  "third-parties/oci/iam/chezmoi.sh/crossplane-rw"
```

The `private_key` value must keep literal `\n` line breaks so the
`ExternalSecret` template can reconstruct the PEM block correctly.

## 4. Cleanup

```bash
rm -f oci-credentials.json oci-crossplane-rw.pem oci-crossplane-rw-public.pem
```
