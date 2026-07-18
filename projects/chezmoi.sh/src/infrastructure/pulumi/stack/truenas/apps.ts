import * as pulumi from "@pulumi/pulumi";
import * as truenas from "@pulumi/truenas";
import { zp1hs01 } from "./zpools/zp1hs01";

const config = new pulumi.Config();

// -----------------------------------------------------------------------------
// TrueNAS SCALE Apps (nas.chezmoi.sh)
// -----------------------------------------------------------------------------
// Only the app catalog itself and two apps (`garage`, `nginx-proxy-manager`)
// are managed here, not every installed app (see ./index.ts).
//
// `version` is intentionally in `ignoreChanges` below: TrueNAS SCALE updates
// app chart versions on its own schedule via the UI, and without this,
// Pulumi would fight that by trying to pin the version back to what's in
// this file on every `pulumi up`.
//
// `values` (chart config) is NOT in `ignoreChanges`, so it's a real, live
// diff against the (broken) state -- the next `pulumi up` here will push
// `values` for real to both production apps (update-in-place, not a
// replace, but still a real redeploy). Confirm before running `up`.

new truenas.Catalog("truenas-catalog", {
	preferredTrains: ["community", "stable"],
});

{
	const mountPoint = zp1hs01.get("applications/truenas/com.nginxproxymanager")
		.resource.mountPoint;
	new truenas.App(
		"app-nginx-proxy-manager",
		{
			appName: "nginx-proxy-manager",
			catalogApp: "nginx-proxy-manager",
			train: "community",
			values: pulumi.jsonStringify({
				TZ: "Europe/Paris",
				ix_certificate_authorities: {},
				ix_certificates: {},
				ix_volumes: {},
				labels: [],
				network: {
					additional_ports: [],
					http_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 80,
					},
					https_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 443,
					},
					networks: [],
					web_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 30020,
					},
				},
				npm: {
					additional_envs: [{ name: "SKIP_CERTBOT_OWNERSHIP", value: "1" }],
				},
				release_name: "nginx-proxy-manager",
				resources: { limits: { cpus: 1, memory: 512 } },
				run_as: { group: 568, user: 568 },
				storage: {
					additional_storage: [],
					certs: {
						host_path_config: {
							acl_enable: false,
							path: pulumi.interpolate`${mountPoint}/certificates`,
						},
						type: "host_path",
					},
					data: {
						host_path_config: {
							acl_enable: false,
							path: pulumi.interpolate`${mountPoint}/data`,
						},
						type: "host_path",
					},
				},
			}),
		},
		{ ignoreChanges: ["version"], retainOnDelete: true },
	);
}

{
	const mountPoint = zp1hs01.get("applications/truenas/fr.deuxfleurs.garage")
		.resource.mountPoint;
	new truenas.App(
		"app-garage",
		{
			appName: "garage",
			catalogApp: "garage",
			train: "community",
			values: pulumi.jsonStringify({
				TZ: "Europe/Paris",
				garage: {
					additional_envs: [],
					additional_options: [
						{
							path: ".s3_api.root_domain",
							type: "string",
							value: "s3.chezmoi.sh",
						},
						{
							path: ".s3_web.root_domain",
							type: "string",
							value: "s3.chezmoi.sh",
						},
					],
					admin_token: config.requireSecret("garage_admin_token"),
					enable_web_ui_auth: true,
					region: "fr-par-1",
					replication_factor: 1,
					rpc_secret: config.requireSecret("garage_rpc_secret"),
					web_ui_password: config.requireSecret("garage_web_ui_password"),
					web_ui_username: config.requireSecret("garage_web_ui_username"),
				},
				ix_certificate_authorities: {},
				ix_certificates: {},
				ix_volumes: {
					metadata_snapshots:
						"/mnt/.ix-apps/app_mounts/garage/metadata_snapshots",
				},
				labels: [],
				network: {
					admin_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 3903,
					},
					networks: [
						{
							containers: [
								{
									config: {
										aliases: ["garage-api"],
									},
									name: "garage",
								},
								{
									config: {
										aliases: ["garage-ui"],
									},
									name: "web",
								},
							],
							name: "ix-nginx-proxy-manager_default",
						},
					],
					rpc_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 3901,
					},
					s3_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 3900,
					},
					s3_web_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 3902,
					},
					web_port: {
						bind_mode: "published",
						host_ips: ["10.0.0.31"],
						port_number: 3904,
					},
				},
				release_name: "garage",
				resources: { limits: { cpus: 2, memory: 512 } },
				run_as: { group: 568, user: 568 },
				storage: {
					additional_storage: [],
					config: {
						host_path_config: {
							acl_enable: false,
							path: pulumi.interpolate`${mountPoint}/config`,
						},
						type: "host_path",
					},
					data: {
						host_path_config: {
							acl_enable: false,
							path: pulumi.interpolate`${mountPoint}/data`,
						},
						type: "host_path",
					},
					metadata: {
						host_path_config: {
							acl_enable: false,
							path: pulumi.interpolate`${mountPoint}/metadata`,
						},
						type: "host_path",
					},
					metadata_snapshots: {
						ix_volume_config: {
							acl_enable: false,
							dataset_name: "metadata_snapshots",
						},
						type: "ix_volume",
					},
				},
			}),
		},
		{ ignoreChanges: ["version"], retainOnDelete: true },
	);
}
export const garageAdminEndpointUrl = `https://s3.chezmoi.sh`;
export const garageAdminTokem = config.requireSecret("garage_admin_token");
