crowdsec_config:
  lapi_key: cloudflare-worker-bouncer
  lapi_url: http://crowdsec-service.crowdsec.svc.cluster.local.:8080
  update_frequency: 10s
  include_scenarios_containing: []
  exclude_scenarios_containing: []
  only_include_decisions_from: ["cscli", "crowdsec"]
  insecure_skip_verify: false
  key_path: ""  # Used for TLS authentification with CrowdSec LAPI
  cert_path: "" # Used for TLS authentification with CrowdSec LAPI
  ca_cert_path: "" # Used for TLS authentification with CrowdSec LAPI

cloudflare_config:
    accounts:
        - id: ${CLOUDFLARE_ACCOUNT_ID}
          zones:
            - zone_id: ${CLOUDFLARE_ZONE_ID} # crowdflare.co.uk
              actions: # Supported Actions [captcha, ban]
                - captcha
              default_action: captcha # Supported Actions [captcha, ban, none]
              routes_to_protect:
                - '*.poc-cloudflare-tunnel-with-crowdsec.${CLOUDFLARE_TUNNEL_DOMAIN}/*' # The domain under which the tunnel runs and adds DNS entries to
              turnstile:
                enabled: true
                rotate_secret_key: true
                rotate_secret_key_every: 168h0m0s
                mode: managed # Supported Modes "managed"|"invisible"|"non-interactive"
          token: ${CLOUDFLARE_CS_BOUNCER_TOKEN} # The token created before
    worker:
      log_only: false # If true, allow all requests, but still keep track of what would have been blocked in the metrics
      script_name: ""
      logpush: null
      tags: []
      compatibility_date: ""
      compatibility_flags: []

log_level: info
log_media: "stdout"
log_dir: "/var/log/"
ban_template_path: "" # set to empty to use default template

prometheus:
    enabled: true
    listen_addr: 0.0.0.0
    listen_port: "2112"
