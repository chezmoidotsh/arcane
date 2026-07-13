import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from "path";

export interface LocalFileArgs {
	/** Absolute path to write `content` to. Parent directories are created as needed. */
	path: pulumi.Input<string>;
	content: pulumi.Input<string>;
}

interface LocalFileState {
	path: string;
	content: string;
}

/** Writes `content` to `path`, creating parent directories as needed. */
export function writeLocalFile(state: LocalFileState): void {
	fs.mkdirSync(path.dirname(state.path), { recursive: true });
	fs.writeFileSync(state.path, state.content);
}

/** True when `path`/`content` differ between `olds` and `news`. */
export function localFileChanged(
	olds: LocalFileState,
	news: LocalFileState,
): boolean {
	return olds.path !== news.path || olds.content !== news.content;
}

const provider: pulumi.dynamic.ResourceProvider<
	LocalFileState,
	LocalFileState
> = {
	async create(inputs) {
		writeLocalFile(inputs);
		return { id: inputs.path, outs: inputs };
	},
	async diff(_id, olds, news) {
		return { changes: localFileChanged(olds, news) };
	},
	async update(_id, _olds, news) {
		writeLocalFile(news);
		return { outs: news };
	},
	// Intentionally a no-op: this resource writes generated artifacts meant
	// to persist in git (e.g. docs/TRUENAS.md). Removing it from Pulumi
	// state shouldn't delete a file someone may have committed.
	async delete() {},
};

/**
 * Writes `content` to a local file as a tracked Pulumi resource, using a
 * dynamic provider (no external SDK — just `fs.writeFileSync` under the
 * hood). Useful for committing generated documentation/artifacts derived
 * from other resources' outputs.
 */
export class LocalFile extends pulumi.dynamic.Resource {
	constructor(
		name: string,
		args: LocalFileArgs,
		opts?: pulumi.CustomResourceOptions,
	) {
		super(provider, name, args, opts);
	}
}
