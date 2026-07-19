import * as proxmox from "@pulumi/proxmox";

// -----------------------------------------------------------------------------
// talos -- baseline Security Group for every Omni-managed Talos VM
// -----------------------------------------------------------------------------
// No Security Group is in use anywhere on this host today: every VM/LXC
// hand-writes its own `.fw`, the cluster-level `[group default]` (rfc1918 +
// ICMP/SSH, defined in cluster.fw) is referenced by zero VMs, and the one
// Talos VM firewall that exists (tal01, VMID 2411000) is present but
// disabled. Declaring `talos` here gives every future Omni-provisioned VM a
// consistent, reviewable baseline to opt into (`GROUP talos` in its own
// `.fw`) instead of a hand-written ruleset per VM -- attaching a VM's `.fw`
// to this group stays a manual step (VM/LXC config is out of scope, see
// ./README.md), same as the VM itself.
//
// Deliberately minimal: only the two fixed, well-known ports every Talos
// node needs regardless of cluster topology or workload --
// `apid` (50000/tcp, the Talos API `talosctl`/Omni use for maintenance and
// day-2 management) and `trustd` (50001/tcp, used during node join/trust
// bootstrap). Cluster-internal traffic (kubelet, the Kubernetes API, etcd
// quorum) depends on control-plane topology this stack has no visibility
// into and is layered on top via each VM's own `.fw` (`GROUP talos` plus
// cluster-specific rules), not baked in here -- see ADR-014/vlans.md,
// "Firewall Rules": default-drop inbound, open the minimum required. The
// operator-facing version of that rationale lives in
// `toolbox/proxmox-docs/templates/partials.firewall.talos.hbs`.
//
// `+rfc1918` reuses the existing cluster-level IPSET (cluster.fw) rather
// than duplicating the CIDR list -- see docs/decisions/015-migrate-crossplane-to-pulumi.md's
// session notes on that IPSET being pre-existing/unmanaged by this stack.
export const talosSecurityGroup =
	new proxmox.VirtualEnvironmentClusterFirewallSecurityGroup("pve-sg-talos", {
		name: "talos",
		comment: "Baseline firewall policy for Omni-managed Talos VMs",
		rules: [
			{
				type: "in",
				action: "ACCEPT",
				proto: "icmp",
				source: "+rfc1918",
				comment: "Allow ICMP from private IPs (diagnostics)",
			},
			{
				type: "in",
				action: "ACCEPT",
				proto: "tcp",
				dport: "50000",
				source: "+rfc1918",
				comment: "Talos apid — talosctl/Omni management plane",
			},
			{
				type: "in",
				action: "ACCEPT",
				proto: "tcp",
				dport: "50001",
				source: "+rfc1918",
				comment: "Talos trustd — node join/trust bootstrap",
			},
		],
	});
