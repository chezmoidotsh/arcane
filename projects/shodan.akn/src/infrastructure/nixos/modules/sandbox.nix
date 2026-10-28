# n8n-sandbox service: control plane (sandbox-api) + privileged Docker-in-Docker runner, mutual TLS between the two.
# Mirrors the official compose file (https://github.com/n8n-io/n8n/blob/master/docker/get-n8n-compose.yml); the three
# images ship as one release and must share a version.
#
# Only sandbox-api's HTTP port is published, on loopback: Caddy (modules/caddy.nix) is the only way in.
{ config, lib, pkgs, ... }:
let
  # renovate: datasource=docker depName=ghcr.io/n8n-io/n8n-sandbox-service-api
  version = "1.8.1";
  registry = "ghcr.io/n8n-io";
  apiImage = "${registry}/n8n-sandbox-service-api:${version}";
  runnerImage = "${registry}/n8n-sandbox-service-runner-dind:${version}";
  sandboxImage = "${registry}/n8n-sandbox-service-sandbox:${version}";
  network = "sandbox";
  tlsVolume = "sandbox-tls";
  docker = "${config.virtualisation.docker.package}/bin/docker";
in
{
  options.sandbox.subnet = lib.mkOption {
    type = lib.types.str;
    default = "172.30.0.0/24";
    description = "Subnet of the sandbox Docker network, matched by the egress rule in configuration.nix.";
  };

  config = {
    virtualisation.docker.enable = true;
    virtualisation.oci-containers.backend = "docker";

    sops.secrets.sandbox_api_key = { };
    sops.secrets.sandbox_registration_token = { };
    sops.secrets.sandbox_runner_key = { };
    sops.templates."sandbox.env".content = ''
      SANDBOX_API_KEYS=${config.sops.placeholder.sandbox_api_key}
      SANDBOX_API_RUNNER_REGISTRATION_TOKEN=${config.sops.placeholder.sandbox_registration_token}
      SANDBOX_RUNNER_REGISTRATION_TOKEN=${config.sops.placeholder.sandbox_registration_token}
      SANDBOX_API_RUNNER_API_KEY=${config.sops.placeholder.sandbox_runner_key}
      SANDBOX_RUNNER_API_KEYS=${config.sops.placeholder.sandbox_runner_key}
    '';

    # Docker network with a fixed subnet (the firewall matches it) and the TLS volume.
    systemd.services.sandbox-setup = {
      description = "Sandbox Docker network, mTLS material";
      after = [ "docker.service" ];
      requires = [ "docker.service" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
      };
      script = ''
        ${docker} network inspect ${network} >/dev/null 2>&1 \
          || ${docker} network create --subnet ${config.sandbox.subnet} ${network}
        # Generated once: regenerating would invalidate the certificates the running containers hold.
        ${docker} run --rm --network ${network} --user 0:0 --entrypoint sh \
          -e NUM_RUNNERS=1 -v ${tlsVolume}:/tls ${apiImage} -c '
            [ -f /tls/api/ca.crt ] || {
              bootstrap-mtls.sh --out-dir /tls --api-san sandbox-api \
                --control-san-prefix sandbox-runner --world-readable &&
              chown -R sandbox-api:sandbox-api /tls/api && chmod -R a+rX /tls
            }'
      '';
    };

    virtualisation.oci-containers.containers.sandbox-api = {
      image = apiImage;
      environmentFiles = [ config.sops.templates."sandbox.env".path ];
      environment = {
        SANDBOX_API_GRPC_TLS_CERT_FILE = "/tls/api/grpc-server.crt";
        SANDBOX_API_GRPC_TLS_KEY_FILE = "/tls/api/grpc-server.key";
        SANDBOX_API_GRPC_TLS_CLIENT_CA_FILE = "/tls/api/ca.crt";
        SANDBOX_API_RUNNER_CONTROL_GRPC_TLS_CA_FILE = "/tls/api/ca.crt";
        SANDBOX_API_RUNNER_CONTROL_GRPC_TLS_CERT_FILE = "/tls/api/control-grpc-api-client.crt";
        SANDBOX_API_RUNNER_CONTROL_GRPC_TLS_KEY_FILE = "/tls/api/control-grpc-api-client.key";
        SANDBOX_API_RUNNER_CONTROL_GRPC_TLS_SERVER_NAME = "sandbox-runner-1";
      };
      volumes = [ "${tlsVolume}:/tls:ro" ];
      ports = [ "127.0.0.1:8080:8080" ];
      extraOptions = [ "--network=${network}" ];
    };

    # The runner is privileged Docker-in-Docker: it is the reason this stack lives on its own machine.
    virtualisation.oci-containers.containers.sandbox-runner-1 = {
      image = runnerImage;
      dependsOn = [ "sandbox-api" ];
      environmentFiles = [ config.sops.templates."sandbox.env".path ];
      environment = {
        SANDBOX_RUNNER_API_GRPC_ADDR = "sandbox-api:9090";
        SANDBOX_RUNNER_HTTP_BASE_URL = "https://sandbox-runner-1:8080";
        SANDBOX_RUNNER_CONTROL_GRPC_LISTEN_ADDR = ":9091";
        SANDBOX_RUNNER_CONTROL_GRPC_ADVERTISE_ADDR = "sandbox-runner-1:9091";
        SANDBOX_RUNNER_ID = "runner-1";
        SANDBOX_RUNNER_DOCKER_SANDBOX_IMAGE = sandboxImage;
        SANDBOX_RUNNER_REGISTRATION_GRPC_CA_FILE = "/tls/runner/ca.crt";
        SANDBOX_RUNNER_REGISTRATION_GRPC_CERT_FILE = "/tls/runner/grpc-client.crt";
        SANDBOX_RUNNER_REGISTRATION_GRPC_KEY_FILE = "/tls/runner/grpc-client.key";
        SANDBOX_RUNNER_REGISTRATION_GRPC_SERVER_NAME = "sandbox-api";
        SANDBOX_RUNNER_CONTROL_GRPC_TLS_CERT_FILE = "/tls/runner/control-grpc-server.crt";
        SANDBOX_RUNNER_CONTROL_GRPC_TLS_KEY_FILE = "/tls/runner/control-grpc-server.key";
        SANDBOX_RUNNER_CONTROL_GRPC_TLS_CLIENT_CA_FILE = "/tls/runner/ca.crt";
      };
      # The inner Docker keeps the sandbox image between restarts instead of pulling it again.
      volumes = [ "${tlsVolume}:/tls:ro" "/var/lib/sandbox-runner:/var/lib/docker" ];
      extraOptions = [ "--network=${network}" "--privileged" ];
    };

    systemd.services.docker-sandbox-api = {
      after = [ "sandbox-setup.service" ];
      requires = [ "sandbox-setup.service" ];
    };
    systemd.services.docker-sandbox-runner-1 = {
      after = [ "sandbox-setup.service" ];
      requires = [ "sandbox-setup.service" ];
    };
  };
}
