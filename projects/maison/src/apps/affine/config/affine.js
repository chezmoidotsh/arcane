// ###############################################################
// ##                AFFiNE Configuration System                ##
// ###############################################################
// This is the main configuration file for AFFiNE server settings.
// Changes to this file require a server restart to take effect.
// All settings are accessible via the global AFFiNE object.

// ###############################################################
// ##                       General settings                    ##
// ###############################################################
// Core server configuration including naming, networking, and access

// /* Server name displayed in the UI */
AFFiNE.serverName = "AFFiNE - chezmoi.sh";

// /* HTTPS proxy configuration */
AFFiNE.server.https = false;

// /* Server hostname configuration */
AFFiNE.server.host = "notes.chezmoi.sh";

// /* The local port of your server that will listen on */
AFFiNE.server.port = 3010;

// /* The external URL of your server, will be consist of protocol + host + port by default */
// /* Useful when you want to customize the link to server resources for example the doc share link or email link */
AFFiNE.server.externalUrl = "https://notes.chezmoi.sh";

// ###############################################################
// ##                   Server Function settings                ##
// ###############################################################
// Core functionality configuration including auth, GraphQL, and doc management

// /* Session Management
//  * ttl: Total session lifetime
//  * ttr: Time-to-refresh threshold before expiration
//  */
AFFiNE.auth.session = {
	/* How long the login session would last by default */
	ttl: 15 * 24 * 60 * 60, // 15 days
	/* How long we should refresh the token before it getting expired */
	ttr: 7 * 24 * 60 * 60, // 7 days
};

// /* GraphQL Server Configuration
//  * Controls API endpoint, schema options, and development tools
//  */
AFFiNE.graphql = {
	/* Path to mount GraphQL API */
	path: "/graphql",
	buildSchemaOptions: {
		numberScalarMode: "integer",
	},
	/* Whether allow client to query the schema introspection */
	introspection: process.env.NODE_ENV !== "production",
	/* Whether enable GraphQL Playground UI */
	playground: process.env.NODE_ENV !== "production",
};

// /* Document Management Settings
//  * Controls how often documents are saved and updated
//  */
// /* Doc Store & Collaboration */
// /* How long the buffer time of creating a new history snapshot when doc get updated */
AFFiNE.doc.history.interval = 1000 * 60 * 10; // 10 minutes

// /* How often the manager will start a new turn of merging pending updates into doc snapshot */
AFFiNE.doc.manager.updatePollInterval = 1000 * 3;

// /* Whether enable metrics and tracing while running the server */
// /* The metrics will be available at `http://localhost:9464/metrics` with [Prometheus] format exported */
AFFiNE.metrics.enabled = false;

// /* Whether enable the telemetry system */
AFFiNE.metrics.telemetry.enabled = false;

// /* Email Service Configuration */
AFFiNE.mailer = {
	host: "email-smtp.us-east-1.amazonaws.com",
	port: 465,
	auth: {
		user: "{{ .aws_ses_username }}",
		pass: "{{ .aws_ses_password }}",
	},
	from: "AFFiNE <noreply@amazonses.chezmoi.sh>",
	secure: true,
};

// /* Redis Configuration */
AFFiNE.redis = {
	host: "affine-redis",
	port: 6379,
};

// ###############################################################
// ##                        Plugins settings                   ##
// ###############################################################
// Plugin configurations for extended functionality

// /* AWS S3 Storage Configuration
//  * Used for storing workspace blobs and user avatars
//  */
AFFiNE.use("aws-s3", {
	credentials: {
		accessKeyId: "{{ .minio_access_key_id }}",
		secretAccessKey: "{{ .minio_access_secret_key }}",
	},
	endpoint: "{{ .minio_endpoint_url }}",
	region: "{{ .minio_region }}",
	forcePathStyle: true,
});
// /* Update the provider of storages */
AFFiNE.storages.blob.provider = "aws-s3";
AFFiNE.storages.blob.bucket = "affine-assets";
AFFiNE.storages.avatar.provider = "aws-s3";
AFFiNE.storages.avatar.bucket = "affine-assets";

// /* OAuth Authentication Configuration
//  * OpenID Connect integration settings
//  */
AFFiNE.use("oauth", {
	providers: {
		oidc: {
			// OpenID Connect
			issuer: "https://sso.chezmoi.sh",
			clientId:
				'{{ regexReplaceAll "client_id: (.+?)" (.oidc_configuration | split "\n")._1 "${1}" }}',
			clientSecret:
				'{{ regexReplaceAll "# client_secret: (.+?)" (.oidc_configuration | split "\n")._3 "${1}" }}',
			args: {
				scope: "openid email offline_access profile",
				claim_id: "preferred_username",
				claim_email: "email",
				claim_name: "name",
			},
		},
	},
});

// /* Copilot AI Integration
//  * Settings for AI-powered features
//  */
AFFiNE.use("copilot", {
	openai: {
		apiKey: "{{ .openai_api_key }}",
	},
	// fal: {
	//   apiKey: 'your-key',
	// },
	// unsplashKey: 'your-key',
	storage: {
		provider: "aws-s3",
		bucket: "affine-assets",
	},
});
