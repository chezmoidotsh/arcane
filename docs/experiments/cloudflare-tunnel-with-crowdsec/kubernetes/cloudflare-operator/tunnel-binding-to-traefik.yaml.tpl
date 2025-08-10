apiVersion: networking.cfargotunnel.com/v1alpha1
kind: TunnelBinding
metadata:
  name: traefik-ingress
subjects:
  - name: wildcard
    spec:
      fqdn: '*.poc-cloudflare-tunnel-with-crowdsec.${CLOUDFLARE_TUNNEL_DOMAIN}'
      target: http://traefik.kube-system.svc.cluster.local.:80
      noTlsVerify: true
tunnelRef:
  kind: ClusterTunnel
  name: main-tunnel
