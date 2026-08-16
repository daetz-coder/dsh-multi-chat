/**
 * @daetz-coder/dsh-plugin-multi-wall — DSH multi-window wall.
 *
 * Mounts the tmux-style multi-instance view at /multi inside an existing
 * `dsh web` instance. Registers exact/prefix routes on the webServer only:
 * every existing row and all original interaction logic stay untouched.
 *
 * Requires the webServer service (@deepseek-ai/dsh-host-webserver), which the
 * dsh-web-app bundle provides. Enable by inserting a loader row (see README):
 *
 *   - insert:
 *       - id: multi-wall
 *         name: '@daetz-coder/dsh-plugin-multi-wall'
 *
 * @module @daetz-coder/dsh-plugin-multi-wall
 */
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";

/** Stable Cordis plugin name. */
const name = "multi-wall";

/** Services required before routes can be registered. */
const inject = ["webServer"];

const Config = z.object({
  /** URL path the wall is mounted at (no trailing slash). */
  mount: z.string().default("/multi"),
  /** Auto-discovery scan range (only when no fixed ports are configured). */
  scanFrom: z.natural().default(3070),
  scanTo: z.natural().default(3110),
  /** Optional fixed port list; when set, discovery ignores the scan range. */
  ports: z.array(z.natural()).default([]),
  /** Extra DSH instances (host:port) always shown regardless of discovery. */
  extraHosts: z.array(z.string()).default([]),
});

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

/** GET a local URL with a short timeout; resolve {status, body} or throw. */
function request(url, timeoutMs = 600) {
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

/** Is this local port a live DSH instance? */
async function probePort(port) {
  try {
    const { status, body } = await request(`http://127.0.0.1:${port}/`);
    return { port, alive: status === 200 && body.includes("__DSH_BOOT__"), status };
  } catch {
    return { port, alive: false, status: 0 };
  }
}

async function probePorts(ports) {
  const CHUNK = 16;
  const out = [];
  for (let i = 0; i < ports.length; i += CHUNK) {
    out.push(...(await Promise.all(ports.slice(i, i + CHUNK).map((p) => probePort(p)))));
  }
  return out;
}

function json(res, value, status = 200) {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

/** Serve one asset, injecting a <base> tag into HTML so relative asset URLs
 * resolve under the mount path (the same page works at "/" and "/multi"). */
function serveAsset(req, res, pathname, baseHref = "/") {
  const target = resolve(normalize(join(ASSETS, pathname)));
  if (target !== ASSETS && !target.startsWith(ASSETS + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  readFile(target)
    .then((buf) => {
      let body = buf;
      if (extname(target) === ".html") {
        body = Buffer.from(String(buf).replace("<head>", `<head><base href="${baseHref}">`));
      }
      res.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(404);
      res.end();
    });
}

/**
 * Register the wall routes. Everything lives under `mount`, so the plugin is
 * purely additive: exact `mount` serves index.html, prefix `mount/` serves the
 * assets and the /api/* probe endpoints.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link Config}.
 */
function apply(ctx, config) {
  const mount = config.mount.replace(/\/+$/, "") || "/multi";
  const baseHref = mount + "/";

  ctx.effect(() =>
    ctx.webServer.register({
      kind: "exact",
      path: mount,
      handler: (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        serveAsset(req, res, "index.html", baseHref);
      },
    }),
    "multi-wall: mount page",
  );

  ctx.effect(() =>
    ctx.webServer.register({
      // NB: the webserver match() checks `pathname.startsWith(prefix + "/")`,
      // so a prefix must NOT end with "/" (a trailing slash would produce a
      // double slash and never match).
      kind: "prefix",
      path: mount,
      handler: (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        const url = new URL(req.url ?? "/", "http://x");
        const rest = decodeURIComponent(url.pathname.slice(mount.length)); // starts with '/'

        if (rest === "/" || rest === "") {
          serveAsset(req, res, "index.html", baseHref);
          return;
        }
        if (rest === "/api/ports") {
          const ports = [...config.ports];
          if (ports.length === 0) {
            for (let p = config.scanFrom; p <= config.scanTo; p++) ports.push(p);
          }
          probePorts(ports)
            .then((results) => json(res, { ports: results.filter((r) => r.alive) }))
            .catch(() => json(res, { ports: [] }, 500));
          return;
        }
        if (rest === "/api/status") {
          const ports = (url.searchParams.get("ports") ?? "")
            .split(",")
            .map(Number)
            .filter((p) => Number.isInteger(p) && p > 0);
          probePorts(ports)
            .then((results) => json(res, { ports: results }))
            .catch(() => json(res, { ports: [] }, 500));
          return;
        }
        if (rest === "/api/config") {
          json(res, {
            mount,
            scan: { from: config.scanFrom, to: config.scanTo },
            fixedPorts: config.ports,
            extraHosts: config.extraHosts,
          });
          return;
        }
        if (rest.startsWith("/api/")) {
          json(res, { error: "not found" }, 404);
          return;
        }

        serveAsset(req, res, rest.slice(1), baseHref);
      },
    }),
    "multi-wall: mount assets + api",
  );

  ctx.logger.info(`multi-wall mounted at ${mount}`);
}

export { Config, apply, inject, name };
