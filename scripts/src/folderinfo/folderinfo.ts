#!/usr/bin/env tsx
/*
 * Copyright (C) 2024 Alexandre Nicolaie (xunleii@users.noreply.github.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */

import * as fs from "fs";
import * as path from "path";

import * as yaml from "js-yaml";

enum TreeSymbol {
    Branch = "├── ",
    Indent = "    ",
    LastBranch = "└── ",
    Vertical = "│   ",
}

type FolderInfoTree = {
    name: string;
    description: string;
    childs?: Array<FolderInfoTree>;
};

/**
 * Recursively scan a folder for .folderinfo files and returns metadata found.
 * @param directoryPath folder to scan for .folderinfo files
 * @returns a description of the folder and its children
 */
async function folderinfo(directoryPath: string): Promise<FolderInfoTree | null> {
    const files = fs.readdirSync(directoryPath, { withFileTypes: true });
    const hasFolderInfo = files.find((file) => file.name === ".folderinfo") !== undefined;
    const childs = (
        await Promise.all(
            files
                .filter((f) => f.isDirectory())
                .filter((f) => f.name != ".git" && f.name != "node_modules") // Ignore GIT and node_modules folders
                .map((f) => folderinfo(path.join(directoryPath, f.name))),
        )
    ).filter(<T>(obj: T | null): obj is T => obj !== null);

    if (childs.length === 0 && !hasFolderInfo) {
        return null;
    }

    if (!hasFolderInfo) {
        return {
            name: path.basename(directoryPath),
            description: "",
            childs: childs,
        };
    }

    const info = yaml.load(fs.readFileSync(path.join(directoryPath, ".folderinfo"), "utf8")) as {
        description: string;
        files?: Record<string, string>;
    };
    return {
        name: path.basename(directoryPath),
        description: `# ${info.description}`,
        childs: [
            ...childs,
            ...(info.files
                ? Object.entries(info.files).map(([c, description]) => ({ name: c, description: `# ${description}` }))
                : []),
        ],
    };
}

/**
 * Calculate the maximum width of a tree
 * @param tree Tree to calculate the maximum width of
 * @param depth Current node depth
 * @returns Maximum width of the generated tree
 */
function maxWidthFnc(tree: FolderInfoTree, depth: number = 0): number {
    return Math.max(tree.name.length + depth * 4, ...(tree.childs || []).map((child) => maxWidthFnc(child, depth + 1)));
}

/**
 * Diplays the given tree in a tree-like structure with descriptions
 * @param tree Tree to display
 * @param prefix Prefix to display before all nodes
 * @param maxWidth Maximum width of the generated tree
 */
function showTree(tree: FolderInfoTree, prefix: string = "", maxWidth: number = maxWidthFnc(tree)) {
    if (prefix !== "") {
        console.log(`${prefix}${tree.name.padEnd(maxWidth - prefix.length)}  ${tree.description}`.trimEnd());
    }

    (tree.childs || []).forEach((child, index) => {
        const vprefix = prefix
            .replace(TreeSymbol.Branch, TreeSymbol.Vertical)
            .replace(TreeSymbol.LastBranch, TreeSymbol.Indent);
        showTree(
            child,
            `${vprefix}${index === tree.childs!.length - 1 ? TreeSymbol.LastBranch : TreeSymbol.Branch}`,
            maxWidth,
        );
    });
}

const scanDir = process.argv[2] || path.resolve(`${__dirname}/../../..`);
console.error(`Generating tree-like for ${path.relative(process.cwd(), scanDir) || "this folder"}`);

folderinfo(scanDir).then((tree) => {
    if (tree) {
        showTree(tree);
    } else {
        console.error("No .folderinfo found.");
    }
});
