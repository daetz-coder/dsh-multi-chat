/**
 * Boot the multi-wall plugin standalone (real dsh-host-webserver + plugin) so
 * the integrated /multi variant can be exercised in a real browser.
 *
 * Usage: node wall/test/boot-plugin-wall.mjs [--port 4699]
 * Then:  node wall/test/headless-check.mjs http://127.0.0.1:4699/multi
 */
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = await import(`file://${join(here, "..", "..", "plugin", "dsh-plugin-multi-wall", "lib", "index.js")}`);

const portArg = process.argv.indexOf("--port");
const PORT = portArg !== -1 ? Number(process.argv[portArg + 1]) : 4699;

const ctx = new Context();
ctx.plugin(WebServer, { host: "127.0.0.1", port: PORT });
ctx.plugin(plugin, { mount: "/multi", scanFrom: 3070, scanTo: 3110, ports: [], extraHosts: [] });
await ctx.get("webServer");
console.log(`multi-wall plugin serving at http://127.0.0.1:${PORT}/multi (Ctrl+C to stop)`);

// keep alive
await new Promise(() => {});
