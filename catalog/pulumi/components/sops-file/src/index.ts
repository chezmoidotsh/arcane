import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";

// Without `config`, sops resolves .sops.yaml from its working directory, so every call runs from the file's own.
const sops = (file: string, args: string[], input?: string, config?: string): string =>
	execFileSync("sops", [...(config ? ["--config", path.resolve(config)] : []), ...args], {
		cwd: path.dirname(file),
		input,
		encoding: "utf8",
	});

/** Decrypt a SOPS JSON file; the type parameter is the caller's claim about its shape. */
export const decryptSopsFile = <T extends object = Record<string, unknown>>(file: string, config?: string): T =>
	JSON.parse(
		sops(path.resolve(file), ["-d", "--input-type", "json", "--output-type", "json", path.resolve(file)], undefined, config),
	);

/**
 * Data-source equivalent: the decrypted content of an existing SOPS JSON file, as a secret.
 * Read when the program runs (previews included); values keep their JSON type.
 */
export const readSopsFile = <T extends object = Record<string, unknown>>(file: string, config?: string): pulumi.Output<T> =>
	pulumi.secret(decryptSopsFile<T>(file, config)) as unknown as pulumi.Output<T>;

interface Props {
	file: string;
	config?: string;
	content: object | null;
}

// Stable stringify: sops does not preserve key order, so compare with sorted keys.
const canon = (v: unknown): string =>
	JSON.stringify(v, (_k, x) =>
		x && typeof x === "object" && !Array.isArray(x)
			? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
			: x,
	);

// The data goes through stdin, never argv. `--filename-override` makes the creation rules match the real path.
const write = (p: Props): void => {
	const file = path.resolve(p.file);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(
		file,
		sops(
			file,
			["-e", "--input-type", "json", "--output-type", "json", "--filename-override", file, "/dev/stdin"],
			JSON.stringify(p.content),
			p.config,
		),
	);
};

export const sopsFileProvider: pulumi.dynamic.ResourceProvider<Props, Props> = {
	async create(inputs) {
		write(inputs);
		return { id: path.resolve(inputs.file), outs: inputs };
	},
	async update(_id, _olds, news) {
		write(news);
		return { outs: news };
	},
	async delete(_id, props) {
		fs.rmSync(path.resolve(props.file), { force: true });
	},
	async diff(_id, olds, news) {
		const moved = olds.file !== news.file || olds.config !== news.config;
		return {
			changes: moved || canon(olds.content) !== canon(news.content),
			replaces: moved ? ["file", "config"] : [],
			deleteBeforeReplace: true,
		};
	},
	// Refresh: the file on disk is the truth, so a hand edit or a deleted file shows up as drift.
	async read(id, props) {
		const { file, config } = props as Props;
		// ponytail: a missing file reads as `content: null`, which diff() turns into a rewrite.
		const content = fs.existsSync(path.resolve(file)) ? decryptSopsFile(path.resolve(file), config) : null;
		return { id, props: { file, config, content } };
	},
};

export interface SopsFileArgs<T extends object> {
	/** Target file (absolute, or relative to the Pulumi program directory). Created if missing, never needs to exist. */
	file: pulumi.Input<string>;
	/** SOPS config file overriding the `.sops.yaml` lookup (`--config`); relative to the program directory. */
	config?: pulumi.Input<string>;
	/** The whole JSON document (may contain secret Outputs). It replaces the file content. */
	content: pulumi.Input<T>;
}

/**
 * A whole SOPS-encrypted JSON file owned by Pulumi, written from an object.
 * Needs `sops` and the age key where `pulumi up` runs (workstation, or an Operator image that ships sops).
 * The creation rules of the nearest `.sops.yaml` (or of `config`) must match the file path.
 */
export class SopsFile<T extends object = Record<string, unknown>> extends pulumi.dynamic.Resource {
	public readonly content!: pulumi.Output<T>;

	constructor(name: string, args: SopsFileArgs<T>, opts?: pulumi.CustomResourceOptions) {
		// Type token `pulumi-nodejs:dynamic/sops:File` (the `pulumi-nodejs:dynamic` prefix is fixed by Pulumi).
		super(sopsFileProvider, name, args, { ...opts, additionalSecretOutputs: ["content"] }, "sops", "File");
	}
}
