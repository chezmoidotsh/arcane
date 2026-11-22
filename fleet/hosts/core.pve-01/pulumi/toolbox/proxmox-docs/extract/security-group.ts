import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType, text } from "./index";

export const SECURITY_GROUP_TYPE =
	"proxmox:index/virtualEnvironmentClusterFirewallSecurityGroup:VirtualEnvironmentClusterFirewallSecurityGroup";

interface RawRule {
	action?: string;
	comment?: string;
	dest?: string;
	dport?: string;
	enabled?: boolean;
	iface?: string;
	log?: string;
	macro?: string;
	proto?: string;
	source?: string;
	sport?: string;
	type?: string;
}

export interface SecurityGroupRuleDoc {
	action: string;
	direction: string;
	protocol: string;
	/** Destination port; absent for protocols that have none (ICMP). The template decides how to show that. */
	port?: string;
	source: string;
	/** The rule's own `comment` -- where each rule explains why it exists. */
	comment?: string;
	disabled: boolean;
}

export interface SecurityGroupDoc {
	name: string;
	comment?: string;
	rules: SecurityGroupRuleDoc[];
}

export function extractSecurityGroups(
	resources: ExportedResource[],
): SecurityGroupDoc[] {
	return resourcesOfType(resources, SECURITY_GROUP_TYPE)
		.map(
			(r): SecurityGroupDoc => ({
				name: text(out(r, "name")) ?? logicalName(r.urn),
				comment: text(out(r, "comment")),
				// Rule order is meaningful in a firewall -- it is evaluated
				// top-down. This is the one list in this package that must NOT
				// be sorted.
				rules: (out<RawRule[]>(r, "rules") ?? []).map(
					(rule): SecurityGroupRuleDoc => ({
						// A macro (`SSH`, `HTTP`, …) stands in for an explicit
						// action+port pair when set; otherwise the raw action applies.
						action: text(rule.macro) ?? text(rule.action) ?? "",
						direction: text(rule.type) ?? "",
						protocol: text(rule.proto) ?? "any",
						port: text(rule.dport),
						source: text(rule.source) ?? "any",
						comment: text(rule.comment),
						disabled: rule.enabled === false,
					}),
				),
			}),
		)
		.sort(byKey((g) => g.name));
}
