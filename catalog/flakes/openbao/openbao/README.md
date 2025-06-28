# OpenBao with SoftHSMv2

![OpenBao Logo](docs/assets/openbao-text-black.svg)

**OpenBao** is an open-source fork of HashiCorp Vault maintained by the OpenBao community under an open governance model, with enterprise features and PKCS#11 auto-unseal support

[![OpenBao Nix Package](https://img.shields.io/badge/nixpkgs-openbao-blue?logo=nixos\&logoColor=white)](https://github.com/NixOS/nixpkgs/blob/nixos-25.05/pkgs/by-name/op/openbao/package.nix)
[![SoftHSMv2 Nix Package](https://img.shields.io/badge/nixpkgs-softhsm-green?logo=nixos\&logoColor=white)](https://github.com/NixOS/nixpkgs/blob/nixos-25.05/pkgs/by-name/so/softhsm/package.nix)
![License](https://img.shields.io/badge/license-MPL--2.0-orange)

</div>

## 🧩 About this Project

This repository provides a Nix-based container image of OpenBao pre-configured with SoftHSMv2 and PKCS#11 support for auto-unsealing, optimized for homelab environments and Kubernetes deployments. The image includes custom initialization scripts, comprehensive HSM validation, and seamless integration with cloud-native orchestration platforms.

## 📦 What is OpenBao?

**OpenBao exists to provide a software solution to manage, store, and distribute sensitive data including secrets, certificates, and keys. The OpenBao community intends to provide this software under an OSI-approved open-source license, led by a community run under open governance principles.**

A modern system requires access to a multitude of secrets: database credentials, API keys for external services, credentials for service-oriented architecture communication, etc. Understanding who is accessing what secrets is already very difficult and platform-specific. Adding on key rolling, secure storage, and detailed audit logs is almost impossible without a custom solution. This is where OpenBao steps in.

The key features of OpenBao are:

* **Secure Secret Storage**: Arbitrary key/value secrets can be stored
  in OpenBao. OpenBao encrypts these secrets prior to writing them to persistent
  storage, so gaining access to the raw storage isn't enough to access
  your secrets. OpenBao can write to disk, [PostgreSQL](https://www.postgresql.org/),
  and more.

* **Dynamic Secrets**: OpenBao can generate secrets on-demand for some
  systems, such as AWS or SQL databases. For example, when an application
  needs to access an S3 bucket, it asks OpenBao for credentials, and OpenBao
  will generate an AWS keypair with valid permissions on demand. After
  creating these dynamic secrets, OpenBao will also automatically revoke them
  after the lease is up.

* **Data Encryption**: OpenBao can encrypt and decrypt data without storing
  it. This allows security teams to define encryption parameters and
  developers to store encrypted data in a location such as a SQL database without
  having to design their own encryption methods.

* **Leasing and Renewal**: All secrets in OpenBao have a *lease* associated
  with them. At the end of the lease, OpenBao will automatically revoke that
  secret. Clients are able to renew leases via built-in renew APIs.

* **Revocation**: OpenBao has built-in support for secret revocation. OpenBao
  can revoke not only single secrets, but a tree of secrets, for example,
  all secrets read by a specific user, or all secrets of a particular type.
  Revocation assists in key rolling as well as locking down systems in the
  case of an intrusion.

> source: [OpenBao GitHub](https://github.com/openbao/openbao)

**Production Considerations**: While SoftHSMv2 provides excellent development and testing capabilities, consider hardware HSM solutions (like AWS CloudHSM, Azure Dedicated HSM, or physical HSM devices) for production environments requiring higher security assurance.

## 🏗️ Build Instructions

### Native Nix Build

Build the container image using Nix directly:

```bash
# Clone the repository
git clone https://github.com/chezmoidotsh/arcane.git
cd arcane/catalog/flakes/openbao/openbao

# Build the image
nix build .#default

# Load into Docker
docker load < result
```

### Docker-Based Build (Recommended)

Use the provided build script for cross-platform builds:

```bash
# From repository root
./scripts/nix:build:image catalog/flakes/openbao/openbao

# Or with specific platform
./scripts/nix:build:image catalog/flakes/openbao/openbao --system x86_64-linux
```

This method allows anyone to build the image on any platform, without requiring Nix to be installed. The build system supports cross-compilation for `linux/amd64` and `linux/arm64` architectures.

## 🚀 Quick Start

### Step 1: Generate SoftHSMv2 Tokens

The simplest way to create compatible tokens is using the container itself:

```bash
# Create local tokens directory
mkdir -p ./openbao-tokens

# Generate tokens using the container
docker run --rm \
  -v $(pwd)/openbao-tokens:/tokens \
  openbao-softhsm:latest \
  softhsm:tokens:new

# Check generated files
ls -la $(pwd)/openbao-tokens/
cat $(pwd)/openbao-tokens/README.md
```

**Advanced token generation with custom parameters:**

```bash
# Custom token and key labels with AES-GCM
docker run --rm \
  -v $(pwd)/openbao-tokens:/tokens \
  openbao-softhsm:latest \
  softhsm:tokens:new /tokens "my-vault-token" "my-unseal-key" "AES-GCM"

# Generate RSA keys instead of AES-GCM
docker run --rm \
  -v $(pwd)/openbao-tokens:/tokens \
  openbao-softhsm:latest \
  softhsm:tokens:new /tokens "openbao-token" "openbao-unseal-key" "RSA"
```

### Step 2: Create Kubernetes Secret

```bash
cd ./openbao-tokens

# Create Kubernetes secret from generated files
kubectl apply -f openbao-softhsm-tokens.secret.yaml

# Or create manually
kubectl create secret generic openbao-softhsm-tokens \
  --from-file=tokens.tar=tokens.tar \
  --from-file=pin=pin
```

The example includes:

* Namespace creation
* ConfigMap for OpenBao configuration
* PersistentVolumeClaim for data storage
* Service and optional Ingress
* Security contexts and resource limits
* Health checks and probes

Deploy with:

```bash
kubectl apply -f examples/kubernetes-deployment.yaml
```

## ⚙️ Configuration

### Environment Variables

| Variable              | Description                   | Default                       | Required |
| --------------------- | ----------------------------- | ----------------------------- | -------- |
| `OPENBAO_ADDR`        | OpenBao server address        | `http://0.0.0.0:8200`         | No       |
| `OPENBAO_API_ADDR`    | OpenBao API address           | `http://0.0.0.0:8200`         | No       |
| `BAO_HSM_LIB`         | PKCS#11 library path override | `/lib/softhsm/libsofthsm2.so` | No       |
| `BAO_HSM_PIN`         | PKCS#11 PIN override          | From mounted pin file         | No       |
| `BAO_HSM_TOKEN_LABEL` | HSM token label override      | From config                   | No       |
| `BAO_HSM_KEY_LABEL`   | HSM key label override        | From config                   | No       |

### Volume Mounts

| Path                    | Description                    | Required      |
| ----------------------- | ------------------------------ | ------------- |
| `/run/secrets/softhsm2` | SoftHSMv2 tokens and PIN files | Yes (for HSM) |
| `/openbao/config`       | OpenBao configuration files    | Yes           |
| `/openbao/file`         | OpenBao data storage           | Yes           |
| `/openbao/logs`         | OpenBao log files              | No            |

## 🔧 Advanced Configuration

### OpenBao Configuration with PKCS#11 Seal

Create an OpenBao configuration file that uses the PKCS#11 seal:

```hcl
# /openbao/config/openbao.hcl
storage "file" {
  path = "/openbao/file"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

seal "pkcs11" {
  lib            = "/lib/softhsm/libsofthsm2.so"
  pin            = "123456789012"  
  token_label    = "openbao-token"
  key_label      = "openbao-unseal-key"
  mechanism      = "AES-GCM"      # Supports AES-GCM, AES, RSA
}

api_addr = "http://0.0.0.0:8200"
cluster_addr = "http://0.0.0.0:8201"
ui = true
log_level = "Info"
```

### HSM Token Generation Parameters

The `softhsm:tokens:new` script supports these parameters:

```bash
softhsm:tokens:new [TOKENS_DIR] [TOKEN_LABEL] [KEY_LABEL] [MECHANISM]
```

| Parameter     | Description                         | Default              |
| ------------- | ----------------------------------- | -------------------- |
| `TOKENS_DIR`  | Output directory for tokens         | `/tokens`            |
| `TOKEN_LABEL` | SoftHSM token label                 | `openbao-token`      |
| `KEY_LABEL`   | PKCS#11 key label                   | `openbao-unseal-key` |
| `MECHANISM`   | Key mechanism (AES-GCM, AES, RSA\*) | `AES-GCM`            |

**\*RSA Compatibility Note**: RSA mechanism is supported for PKCS#11 seal operations but requires specific OpenBao build configuration. AES-GCM is recommended for most use cases as it provides better performance and broader compatibility.

### Integration with Kubernetes Helm Charts

The container integrates with official OpenBao Helm charts via Kustomize:

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

helmCharts:
- name: openbao
  repo: https://openbao.github.io/openbao-helm
  version: v0.14.0
  valuesInline:
    server:
      image:
        repository: openbao-softhsm
        tag: latest
      extraSecretEnvironmentVars:
        - envName: OPENBAO_HSM_PIN
          secretName: openbao-softhsm-tokens
          secretKey: pin
      extraVolumes:
        - type: secret
          name: openbao-softhsm-tokens
          path: /run/secrets/softhsm2
```

## 🔍 Troubleshooting

### Kubernetes Debugging

**Important**: The `softhsm2-util` and `pkcs11-tool` commands require that `SOFTHSM2_CONF` be correctly defined, otherwise they cannot locate the HSM tokens.

```bash
# Check pod status and events
kubectl get pods -l app=openbao
kubectl describe pod <openbao-pod-name>

# View container logs
kubectl logs <openbao-pod-name>

# FIRST: Check SoftHSM2 configuration
kubectl exec <openbao-pod-name> -- env | grep SOFTHSM2_CONF
kubectl exec <openbao-pod-name> -- cat /run/secrets/softhsm2/softhsm2.conf

# Debug HSM token access (needs SOFTHSM2_CONF)
kubectl exec <openbao-pod-name> -- SOFTHSM2_CONF=/run/secrets/softhsm2/softhsm2.conf softhsm2-util --show-slots
kubectl exec <openbao-pod-name> -- ls -la /run/secrets/softhsm2/

# Check OpenBao seal status
kubectl exec <openbao-pod-name> -- wget -qO- http://localhost:8200/v1/sys/seal-status

# Debug PKCS#11 operations (needs SOFTHSM2_CONF, provided by OpenSC)
kubectl exec <openbao-pod-name> -- SOFTHSM2_CONF=/run/secrets/softhsm2/softhsm2.conf pkcs11-tool --module /lib/softhsm/libsofthsm2.so --list-slots

# Check secret mount
kubectl get secret openbao-hsm-tokens -o yaml
kubectl exec <openbao-pod-name> -- ls -la /run/secrets/
```

### Common Issues

#### Issue: "Failed to extract tokens"

**Solution**: Ensure the tokens.tar file exists in the mounted secret and has correct permissions:

```bash
kubectl get secret openbao-softhsm-tokens -o yaml
ls -la /run/secrets/softhsm2/
```

#### Issue: "PKCS#11 library not found"

**Solution**: Verify the PKCS#11 library path is correct:

```bash
docker exec openbao ls -la /lib/softhsm/libsofthsm2.so
```

#### Issue: "Token authentication failed"

**Solution**: Check PIN file and token configuration:

```bash
docker exec openbao cat /run/secrets/openbao/pkcs11/pin
docker exec openbao softhsm2-util --show-slots
```

## 📦 Dependencies

### Core Dependencies

| Package   | Version                | Purpose                                    |
| --------- | ---------------------- | ------------------------------------------ |
| OpenBao   | Dynamic (from nixpkgs) | Vault alternative with enterprise features |
| SoftHSMv2 | 2.6.1+                 | Software-based HSM for PKCS#11 operations  |
| OpenSC    | Latest                 | PKCS#11 tools and utilities                |
| Tini      | Latest                 | Process supervisor and signal handler      |
| BusyBox   | Latest                 | Minimal shell and utilities                |

### Build Dependencies

| Package     | Version | Purpose                          |
| ----------- | ------- | -------------------------------- |
| Nix         | 25.05   | Build system and package manager |
| Flake Utils | Latest  | Nix flake utilities              |
| Flockenzeit | Latest  | Reproducible timestamps          |

## 📚 References

* **Upstream Documentation**: [OpenBao Documentation](https://openbao.org/docs/)
* **Nix Package**: [OpenBao in nixpkgs](https://github.com/NixOS/nixpkgs/blob/nixos-25.05/pkgs/by-name/op/openbao/package.nix)
* **SoftHSMv2**: [SoftHSMv2 Documentation](https://github.com/opendnssec/SoftHSMv2)
* **PKCS#11**: [PKCS#11 Auto-Unseal Guide](https://openbao.org/docs/configuration/seal/pkcs11)

## 📄 License

This project is licensed under the MPL-2.0 License - see the [LICENSE](../../../../LICENSE) file for details.

The packaged software (OpenBao) is licensed under MPL-2.0.
SoftHSMv2 is licensed under BSD-2-Clause.

***

**Built with ❤️ using [Nix](https://nixos.org/) and [Flakes](https://nixos.wiki/wiki/Flakes)**
