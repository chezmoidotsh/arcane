import * as pangolin from "@pulumi/pangolin";

// Pangolin requires an org before anything else (sites, resources, IdPs) can
// exist. orgId isn't server-assigned -- it's picked here as "chezmoi-sh" and
// reused as the `pangolin:orgId` stack config in every other project that
// creates Pangolin resources scoped to this org (Site/Resource have no
// orgId argument of their own -- the provider supplies it). `pangolin:url`
// is likewise plain stack config in every project; only PANGOLIN_API_KEY
// comes from the environment for the `pulumi` invocation -- same bootstrap
// problem as Pocket-Id's POCKET_ID_API_KEY.
//
// subnet/utilitySubnet are the WireGuard overlay ranges Pangolin allocates to
// Newt sites under this org -- fixed at creation, never modifiable
// afterwards. Carved out of 172.16.0.0/12 right next to kazimierz's own OCI
// VCN (172.16.0.0/26, see docs/network/ipam.md "OCI Cloud -- kazimierz.akn")
// rather than 10.x/192.168.x -- same reasoning as that VCN: kazimierz sits
// outside the homelab's L3 topology entirely and this overlay is tunnel-only
// (WireGuard between kazimierz and K8s pods, never natively routed), so
// overlapping the Kubernetes 172.16.0.0/12 block here is safe, unlike
// reaching into 10.x/192.168.x, which are fully claimed by the physical
// VLANs, SDN, and LB pools.
// The underlying terraform-provider-pangolin bridge validates org_id against
// the live instance at provider Configure() time for every operation,
// including this resource's own Create -- so Pulumi can never be the one to
// create a brand-new org (it always 404s first). The org must already exist
// on the target Pangolin instance (created once via its web UI, same orgId)
// before this resource is brought under management with `pulumi import`.
export const chezmoiShOrg = new pangolin.Org("chezmoi-sh", {
	orgId: "chezmoi-sh",
	name: "chezmoi.sh",
	subnet: "172.16.1.0/24",
	utilitySubnet: "172.16.2.0/24",
});
