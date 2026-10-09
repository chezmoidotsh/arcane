import * as oci from "@pulumi/oci";
import * as pulumi from "@pulumi/pulumi";

// The parent `chezmoi.sh` compartment is owned by the kazimierz.akn stack
// ("for now", see its compartments.ts) -- read its id across instead of
// declaring a duplicate.
const kazimierzStack = new pulumi.StackReference("kazimierz.akn", {
	name: "organization/kazimierz-akn-infra/kazimierz_akn.live",
});
const chezmoiShCompartmentId = kazimierzStack
	.getOutput("chezmoiShCompartmentId") as pulumi.Output<string>;

// Dedicated compartment: isolates rimbilliton.akn's VCN/instance from the rest.
export const rimbilliton = new oci.identity.Compartment("rimbilliton", {
	compartmentId: chezmoiShCompartmentId,
	name: "rimbilliton.akn",
	description: "rimbilliton.akn -- Minecraft server",
});
