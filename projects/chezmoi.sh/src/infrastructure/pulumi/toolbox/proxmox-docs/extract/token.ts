import type { ExportedResource } from "../stack-export";
import { byKey, logicalName, out, resourcesOfType, text } from "./index";

export const TOKEN_TYPE = "proxmox:index/userToken:UserToken";

export interface TokenDoc {
	/** `user@realm!name`, the form Proxmox VE itself uses. */
	tokenId: string;
	userId: string;
	tokenName: string;
	comment?: string;
	/**
	 * Proxmox VE's `privsep`. When false the token carries exactly its user's
	 * permissions; when true it only gets what is granted to the token
	 * identity itself.
	 */
	privilegeSeparation?: boolean;
	expirationDate?: string;
}

/**
 * Never reads the token's `value` output. The provider marks it an additional
 * secret output, so `pulumi stack export` returns ciphertext anyway (see
 * `../stack-export.ts`) -- not reading it at all is the second layer.
 */
export function extractTokens(resources: ExportedResource[]): TokenDoc[] {
	return resourcesOfType(resources, TOKEN_TYPE)
		.map((r): TokenDoc => {
			const userId = out<string>(r, "userId");
			const tokenName = out<string>(r, "tokenName") ?? logicalName(r.urn);
			return {
				tokenId: `${userId}!${tokenName}`,
				userId,
				tokenName,
				comment: text(out(r, "comment")),
				privilegeSeparation: out(r, "privilegesSeparation"),
				expirationDate: text(out(r, "expirationDate")),
			};
		})
		.sort(byKey((t) => t.tokenId));
}
