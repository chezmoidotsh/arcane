apiVersion: networking.cfargotunnel.com/v1alpha2
kind: ClusterTunnel
metadata:
  name: main-tunnel # The ClusterTunnel Custom Resource Name
spec:
  newTunnel:
    name: poc-cloudflare-tunnel-with-crowdsec # Name of your new tunnel on Cloudflare
  cloudflare:
    domain: ${CLOUDFLARE_TUNNEL_DOMAIN} # Domain under which the tunnel runs and adds DNS entries to
    secret: cloudflare-secrets  # The secret created before
    # accountId and accountName cannot be both empty. If both are provided, Account ID is used if valid, else falls back to Account Name.
    accountName: ${CLOUDFLARE_ACCOUNT_NAME}
    accountId: ${CLOUDFLARE_ACCOUNT_ID}
