import * as pangolin from "@pulumi/pangolin";

import { chezmoiShOrg } from "./org";

// Every org gets built-in "Admin" and "Member" roles from Pangolin itself
// (Role.isAdmin is read-only -- Pulumi can reference either by name in
// role_mapping but can't create or manage them). This is the only custom
// role: it grants access to resources that are normally local-only (budget
// tracker, archives, ...) but get exposed publicly through Pangolin for
// trusted household members, without handing out dashboard admin rights.
// Selected via role_mapping in ./idp.ts.
export const privilegedRole = new pangolin.Role(
	"privileged",
	{
		name: "Privileged",
		description:
			"Access to home-only resources exposed publicly through Pangolin (budget, archives, ...)",
	},
	{ dependsOn: chezmoiShOrg },
);
