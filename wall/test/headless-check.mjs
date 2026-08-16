/**
 * Headless verification of the wall page via Chrome DevTools Protocol:
 * launches headless Chrome/Edge, opens the wall page, waits for auto-discovery
 * to populate the grid, and reports pane/iframe counts + status text.
 *
 * Usage: node wall/test/headless-check.mjs [wall-url]
 * Requires 'ws' resolvable (e.g. the profile node_modules junction) and
 * Chrome or Edge installed.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const WALL_URL = process.argv[2] ?? "http://127.0.0.1:3999/";
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const browser = browsers.find(existsSync);
if (!browser) { console.error("no browser"); process.exit(1); }

const PORT = 9334;
const proc = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-extensions",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + tmpdir() + "/wall-cdp2",
  WALL_URL,
], { stdio: "ignore" });

try {
  let list = null;
  for (let i = 0; i < 40 && !list; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      list = await res.json();
    } catch { /* retry */ }
  }
  if (!list) throw new Error("no /json response");
  console.log("tabs:", list.map((t) => `${t.type} ${t.url.slice(0, 60)}`).join(" | "));
  const page = list.find((t) => t.type === "page" && t.url.includes("3999")) ?? list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  let id = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === mid) { ws.off("message", onMsg); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send("Runtime.enable");
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const { result } = await send("Runtime.evaluate", {
      expression: `JSON.stringify({ panes: document.querySelectorAll('.pane').length, iframes: document.querySelectorAll('.pane iframe').length, status: document.getElementById('status-text')?.textContent, ports: [...document.querySelectorAll('.pane-title')].map(e => e.textContent.trim()) })`,
      returnByValue: true,
    });
    const s = JSON.parse(result.value);
    console.log(`t+${(i + 1) * 0.5}s:`, JSON.stringify(s));
    if (s.panes > 0) break;
  }
  ws.close();
  process.exit(0);
} finally {
  proc.kill();
}
