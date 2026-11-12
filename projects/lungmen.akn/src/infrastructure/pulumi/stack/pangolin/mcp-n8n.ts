import { must } from "@chezmoi.sh/pulumi-lib";
import * as pangolin from "@pulumi/pangolin";

import { lungmenSiteId } from "./index";

// Private entry point of the n8n MCP proxy (ADR-019): reachable on n8n.mcp.chezmoi.sh only from a
// device running the Pangolin client. The proxy handles the MCP OAuth flow itself (n8n accounts).
// Service created by the ToolHive operator: mcp-<MCPRemoteProxy name>-remote-proxy, port 8080.
export const mcpN8nPrivateResource = new pangolin.SiteResource(
	"mcp-n8n-private-chezmoi-sh",
	{
		name: "n8n MCP (private)",
		mode: "http",
		siteId: lungmenSiteId,
		domainId: pangolin.getDomainsOutput().apply(
			(r) =>
				must(
					r.domains.find((d) => d.baseDomain === "chezmoi.sh"),
					"chezmoi.sh base domain not found in Pangolin",
				).domainId,
		),
		subdomain: "n8n.mcp",
		scheme: "http",
		destination: "mcp-n8n-mcp-remote-proxy.n8n.svc.cluster.local",
		destinationPort: 8080,
	},
);
