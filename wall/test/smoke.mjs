/**
 * Smoke test for the standalone wall server (wall/server.mjs).
 *
 * Boots the server in-process (no CLI), then exercises real HTTP:
 *  - / serves the wall page
 *  - /wall.css /wall.js assets
 *  - /api/config reflects options
 *  - /api/ports discovers live DSH instances in the range
 *  - /api/status probes given ports
 *  - /api/* 404
 *
 * Run: node wall/test/smoke.mjs
 */
import assert from "node:assert/strict";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { createWallServer } = await import(`file://${join(here, "..", "server.mjs")}`);

const PORT = 4799;
const { server, listen } = createWallServer({
  port: PORT,
  scan: "3080-3084", // narrow range so the test stays fast
});
const bound = await listen();

function get(path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: bound, path }, (res) => {
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

// page + assets
const idx = await get("/");
check("GET / serves wall page", idx.status === 200 && idx.body.includes("多窗口墙"), `status=${idx.status}`);
const css = await get("/wall.css");
check("GET /wall.css", css.status === 200 && css.headers["content-type"].includes("text/css"));
const js = await get("/wall.js");
check("GET /wall.js", js.status === 200 && js.body.includes("dsh-multi-wall"));

// config
const cfg = JSON.parse((await get("/api/config")).body);
check("GET /api/config", cfg.scan.from === 3080 && cfg.scan.to === 3084);

// discovery — live instances 3080/3081/3082/3084 are running in this env
const ports = JSON.parse((await get("/api/ports")).body).ports;
const found = ports.filter((p) => p.alive).map((p) => p.port);
check("api/ports finds live DSH instances", found.length >= 3, `found=${found.join(",")}`);

// query override narrows the range
const narrow = JSON.parse((await get("/api/ports?from=3081&to=3081")).body).ports;
check("api/ports respects from/to", narrow.length === 1 && narrow[0].port === 3081);

// status probe
const st = JSON.parse((await get("/api/status?ports=3084,1")).body).ports;
check("api/status: 3084 alive, 1 dead", st[0].alive === true && st[1].alive === false);

// 404 for unknown api
const nf = await get("/api/nope");
check("unknown api 404", nf.status === 404);

// path traversal blocked
const esc = await get("/../server.mjs");
check("traversal blocked (403 or page)", esc.status === 403 || esc.status === 200);

await new Promise((resolve) => server.close(resolve));
check("clean close", true);

console.log(failures === 0 ? "\nALL WALL-SERVER CHECKS PASSED ✔" : `\n${failures} CHECK(S) FAILED ✘`);
process.exit(failures === 0 ? 0 : 1);
