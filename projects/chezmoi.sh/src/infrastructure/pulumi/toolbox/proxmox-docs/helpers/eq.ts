/**
 * Strict equality, for guarding a subject partial on the resource it documents:
 * `{{#if (eq name "talos")}}{{> [firewall.talos]}}{{/if}}`.
 *
 * That guard is what keeps prose about one resource from rendering under a
 * sibling: the include sits inside the loop, so it lands under the right
 * heading, and it only fires for the subject it was written for.
 */
export function eq(a: unknown, b: unknown): boolean {
	return a === b;
}
