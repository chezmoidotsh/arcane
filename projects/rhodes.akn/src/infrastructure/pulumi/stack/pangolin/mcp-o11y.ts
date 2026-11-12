import { must } from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { rhodesSiteId } from "./index";

// Private entry point of the mcp-o11y vMCP (ADR-019): reachable on mcp-o11y.chezmoi.sh only from a
// device running the Pangolin client, never published. The vMCP still authenticates its clients
// itself (embedded OAuth server delegating to Pocket-Id).
// vMCP Service created by the ToolHive operator: vmcp-<VirtualMCPServer name>, port 4483.
export const mcpO11yPrivateResource = new pangolin.SiteResource(
	"mcp-o11y-private-chezmoi-sh",
	{
		name: "MCP o11y (private)",
		mode: "http",
		siteId: rhodesSiteId,
		domainId: pangolin.getDomainsOutput().apply(
			(r) =>
				must(
					r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
					"chezmoi.sh base domain not found in Pangolin",
				).domainId,
		),
		subdomain: "mcp-o11y",
		scheme: "http",
		destination: "vmcp-mcp-o11y.mcp.svc.cluster.local",
		destinationPort: 4483,
	},
);
