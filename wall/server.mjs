#!/usr/bin/env node
/**
 * dsh-multi-wall server — zero-dependency multi-window wall for DSH.
 *
 * Serves the wall page (wall/public) and a tiny JSON API that discovers and
 * probes DSH instances running on other local ports. Every pane in the wall is
 * a plain <iframe> pointing at one DSH instance (http://127.0.0.1:<port>/), so
 * the original DSH interaction logic is untouched — this server only shows N
 * instances side by side, tmux-style.
 *
 * Usage:
 *   node server.mjs                  # wall on :3999, scan 3070-3110
 *   node server.mjs --port 4000      # wall on :4000
 *   node server.mjs --scan 3080-3090 # only scan this range
 *   node server.mjs --ports 3080,3081,3084  # fixed port list (no auto-scan)
 *
 * API:
 *   GET /api/ports                 -> auto-discovered DSH ports
 *   GET /api/status?ports=3080,..  -> liveness of specific ports
 *   GET /api/config                -> server config (scan range / fixed ports)
 */
import { createServer, get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC = join(ROOT, "wall", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function parseArgs(argv) {
  const args = { port: 3999, scan: null, ports: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--scan") args.scan = argv[++i];
    else if (a === "--ports") args.ports = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(`dsh-multi-wall server

Options:
  --port <n>        wall server port (default 3999)
  --scan <a-b>      auto-discover DSH instances in port range (default 3070-3110)
  --ports <a,b,..>  fixed port list; disables auto-scan
  --help            this help`);
      process.exit(0);
    }
  }
  return args;
}

function parseScanRange(s) {
  const m = /^(\d+)-(\d+)$/.exec(String(s ?? ""));
  if (!m) return { from: 3070, to: 3110 };
  return { from: Number(m[1]), to: Number(m[2]) };
}

function parsePortList(s) {
  return String(s ?? "")
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
}

/** Probe one local port: is it a live DSH instance? */
function probePort(port, timeoutMs = 600) {
  return new Promise((resolve) => {
    request(`http://127.0.0.1:${port}/`, timeoutMs)
      .then(({ status, body }) => {
        resolve({
          port,
          alive: status === 200 && body.includes("__DSH_BOOT__"),
          status,
        });
      })
      .catch(() => resolve({ port, alive: false, status: 0 }));
  });
}

function request(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? httpsGet : httpGet;
    const req = get(url, (res) => {
      let body = "";
      res.on("data", (c) => {
        body += c;
        if (body.length > 65536) req.destroy(new Error("too big"));
      });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

/** Concurrent probe of many ports. */
async function probePorts(ports) {
  const CHUNK = 16;
  const out = [];
  for (let i = 0; i < ports.length; i += CHUNK) {
    const chunk = ports.slice(i, i + CHUNK);
    out.push(...(await Promise.all(chunk.map((p) => probePort(p)))));
  }
  return out;
}

function serveStatic(req, res, pathname) {
  const target = resolve(normalize(join(PUBLIC, pathname)));
  if (target !== PUBLIC && !target.startsWith(PUBLIC + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const ext = extname(target) || ".html";
  readFile(target)
    .then((buf) => {
      let body = buf;
      // The wall page is served at the root here, but the same page is also
      // mounted at /multi by the plugin variant; a <base> tag keeps the
      // relative asset URLs correct in both cases.
      if (ext === ".html") {
        body = Buffer.from(String(buf).replace("<head>", `<head><base href="/">`));
      }
      res.writeHead(200, {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(body);
    })
    .catch(() => {
      // SPA fallback for unknown paths (the wall is a single page).
      readFile(join(PUBLIC, "index.html")).then((buf) => {
        res.writeHead(200, { "content-type": MIME[".html"] });
        res.end(buf);
      });
    });
}

function json(res, value, status = 200) {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

export function createWallServer(config = {}) {
  const port = config.port ?? 3999;
  const fixedPorts = config.ports ? parsePortList(config.ports) : null;
  const range = config.scan ? parseScanRange(config.scan) : { from: 3070, to: 3110 };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/ports") {
      // Query params override the server defaults; fixed ports still win when set.
      const qFromRaw = url.searchParams.get("from");
      const qToRaw = url.searchParams.get("to");
      const qFrom = qFromRaw !== null ? Number(qFromRaw) : NaN;
      const qTo = qToRaw !== null ? Number(qToRaw) : NaN;
      const lo = fixedPorts ? null : Number.isInteger(qFrom) ? qFrom : range.from;
      const hi = fixedPorts ? null : Number.isInteger(qTo) ? qTo : range.to;
      const ports = fixedPorts ?? [];
      if (!fixedPorts) for (let p = lo; p <= hi; p++) ports.push(p);
      const results = await probePorts(ports);
      json(res, { ports: results.filter((r) => r.alive) });
      return;
    }
    if (pathname === "/api/status") {
      const ports = parsePortList(url.searchParams.get("ports"));
      const results = await probePorts(ports);
      json(res, { ports: results });
      return;
    }
    if (pathname === "/api/config") {
      json(res, {
        port,
        scan: { from: range.from, to: range.to },
        fixedPorts,
        publicRoot: PUBLIC,
      });
      return;
    }
    if (pathname.startsWith("/api/")) {
      json(res, { error: "not found" }, 404);
      return;
    }

    serveStatic(req, res, pathname === "/" ? "index.html" : pathname);
  });

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve(server.address().port);
        });
      }),
  };
}

// Direct execution: node server.mjs ...
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const { server, listen } = createWallServer(args);
  listen().then((port) => {
    console.log(`dsh-multi-wall listening on http://127.0.0.1:${port}`);
    console.log(`scan range: ${args.scan ?? "3070-3110"}${args.ports ? ` (fixed ports: ${args.ports})` : ""}`);
  });
}
