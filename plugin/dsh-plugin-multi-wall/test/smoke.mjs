/**
 * Smoke test for @daetz-coder/dsh-plugin-multi-wall.
 *
 * Verifies, without a full DSH boot:
 *  - the plugin module exports the expected contract (name/inject/Config/apply)
 *  - apply() registers one exact route (mount) and one prefix route (mount/)
 *  - the exact route serves index.html
 *  - the prefix route serves wall.js and answers /api/config
 *  - /api/status probes ports (a dead port reports alive:false)
 *
 * Run: node plugin/dsh-plugin-multi-wall/test/smoke.mjs
 * (requires node_modules with @deepseek-ai/schemastery resolvable from the
 *  plugin package, e.g. the profile junction used during development)
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = await import(`file://${join(here, "..", "lib", "index.js")}`);

// ── contract ────────────────────────────────────────────
assert.equal(typeof plugin.name, "string");
assert.ok(Array.isArray(plugin.inject));
assert.equal(typeof plugin.Config, "function");
assert.equal(typeof plugin.apply, "function");
console.log("contract ok:", plugin.name, "inject:", plugin.inject.join(","));

// ── fake webServer capturing registrations ─────────────
const routes = [];
const fakeWebServer = {
  register(route) {
    routes.push(route);
    return () => {
      const i = routes.indexOf(route);
      if (i !== -1) routes.splice(i, 1);
    };
  },
};

const disposers = [];
const fakeCtx = {
  webServer: fakeWebServer,
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  effect(fn, label) {
    const dispose = fn();
    if (typeof dispose === "function") disposers.push(dispose);
  },
};

const config = plugin.Config({
  mount: "/multi",
  scanFrom: 3070,
  scanTo: 3110,
  ports: [],
  extraHosts: [],
});
plugin.apply(fakeCtx, config);

assert.equal(routes.length, 2, "expects exact + prefix route");
const [exact, prefix] = routes;
assert.equal(exact.kind, "exact");
assert.equal(exact.path, "/multi");
assert.equal(prefix.kind, "prefix");
assert.equal(prefix.path, "/multi/");
console.log("routes registered:", routes.map((r) => `${r.kind} ${r.path}`).join(" | "));

// ── simulate a GET request ─────────────────────────────
function simReq(handler, path) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const res = {
      writeHead(status, headers) {
        res._status = status;
        res._headers = headers;
      },
      end(body) {
        if (body) chunks.push(body);
        resolve({
          status: res._status,
          headers: res._headers,
          body: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"),
        });
      },
    };
    let result;
    try {
      result = handler({ method: "GET", url: path }, res);
    } catch (err) {
      reject(err);
      return;
    }
    if (result && typeof result.then === "function") result.catch(reject);
  });
}

// exact mount -> index.html
const idx = await simReq(exact.handler, "/multi");
assert.equal(idx.status, 200);
assert.ok(idx.body.includes("多窗口墙"), "index.html contains wall title");
console.log("exact route serves index.html ok");

// prefix mount + asset
const js = await simReq(prefix.handler, "/multi/wall.js");
assert.equal(js.status, 200);
assert.ok(js.headers["content-type"].includes("javascript"));
assert.ok(js.body.includes("dsh-multi-wall"), "wall.js served");
console.log("prefix route serves wall.js ok");

// api/config
const cfg = await simReq(prefix.handler, "/multi/api/config");
const cfgJson = JSON.parse(cfg.body);
assert.equal(cfgJson.mount, "/multi");
assert.deepEqual(cfgJson.scan, { from: 3070, to: 3110 });
console.log("api/config ok:", cfg.body);

// api/status probes a dead port (port 1 is not listening) and our own test
const st = await simReq(prefix.handler, "/multi/api/status?ports=1");
const stJson = JSON.parse(st.body);
assert.equal(stJson.ports[0].alive, false);
console.log("api/status ok (port 1 -> alive:false)");

// api 404
const nf = await simReq(prefix.handler, "/multi/api/nope");
assert.equal(nf.status, 404);
console.log("api 404 ok");

// disposers release routes
disposers.forEach((d) => d());
assert.equal(routes.length, 0, "disposers release all routes");
console.log("dispose ok");

console.log("\nall smoke tests passed ✔");
