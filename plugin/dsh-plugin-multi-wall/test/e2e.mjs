/**
 * End-to-end test: boot the REAL dsh-host-webserver service with the
 * multi-wall plugin through cordis, then exercise the wall over real HTTP.
 *
 * Verifies the plugin integrates with the actual webserver route registry
 * (exact + prefix matching, fallback 404, asset serving, API probing) exactly
 * as it will inside a dsh web boot.
 *
 * Run: node plugin/dsh-plugin-multi-wall/test/e2e.mjs
 * (requires node_modules with @deepseek-ai/cordis and
 *  @deepseek-ai/dsh-host-webserver resolvable, e.g. the profile junction)
 */
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = await import(`file://${join(here, "..", "lib", "index.js")}`);

const PORT = 4599;
const ctx = new Context();

ctx.plugin(WebServer, { host: "127.0.0.1", port: PORT });
ctx.plugin(plugin, {
  mount: "/multi",
  scanFrom: 3070,
  scanTo: 3110,
  ports: [],
  extraHosts: [],
});

// Services activate when awaited (cordis v4 semantics); awaiting webServer
// binds the listener, which mounts the plugin's routes.
await ctx.get("webServer");

function get(path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: PORT, path }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

// exact mount -> index.html
const idx = await get("/multi");
check("GET /multi serves wall page", idx.status === 200 && idx.body.includes("多窗口墙"), `status=${idx.status}`);

// asset under prefix
const js = await get("/multi/wall.js");
check("GET /multi/wall.js serves script", js.status === 200 && js.body.includes("dsh-multi-wall"));

// api/config
const cfg = JSON.parse((await get("/multi/api/config")).body);
check("GET /multi/api/config", cfg.mount === "/multi" && cfg.scan.from === 3070);

// api/status probes live DSH instances (3080/3081/3082/3084 are running here)
const st = JSON.parse((await get("/multi/api/status?ports=3080,3081,3084")).body);
const alive = st.ports.filter((p) => p.alive).map((p) => p.port);
check("api/status finds live DSH instances", alive.length >= 3, `alive=${alive.join(",")}`);

// unknown api -> 404
const nf = await get("/multi/api/nope");
check("unknown api 404", nf.status === 404);

// fallback seat: paths outside /multi still 404 through the webserver (the
// real dsh web app would claim the fallback with its dist; here none does)
const fb = await get("/other");
check("unclaimed path 404 by webserver", fb.status === 404);

await ctx.fiber.dispose();
check("clean stop", true);

console.log(failures === 0 ? "\nALL E2E CHECKS PASSED ✔" : `\n${failures} CHECK(S) FAILED ✘`);
process.exit(failures === 0 ? 0 : 1);
