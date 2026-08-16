#!/usr/bin/env node
/**
 * Sync the wall page assets from wall/public into the plugin package, so the
 * integrated variant (mounted at /multi inside a dsh instance) serves the
 * exact same UI as the standalone wall server.
 *
 * Run after editing anything under wall/public:
 *   node plugin/sync-assets.mjs
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "wall", "public");
const dst = join(root, "plugin", "dsh-plugin-multi-wall", "assets");

await mkdir(dst, { recursive: true });
for (const file of await readdir(src)) {
  await copyFile(join(src, file), join(dst, file));
  console.log(`synced ${file}`);
}
console.log("done");
