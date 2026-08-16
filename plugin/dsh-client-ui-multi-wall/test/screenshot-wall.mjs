/**
 * Capture a screenshot of the wall INSIDE the official DSH GUI: opens a dsh
 * instance, clicks the sidebar footer "多窗口墙" toggle, waits for panes, and
 * saves a PNG via CDP.
 *
 * Usage: node plugin/dsh-client-ui-multi-wall/test/screenshot-wall.mjs <url> <out.png>
 * Requires 'ws' resolvable and Chrome/Edge installed.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const URL = process.argv[2] ?? "http://127.0.0.1:3199/";
const OUT = process.argv[3] ?? "wall-in-official-gui.png";
const browser = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9442;
const proc = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-extensions",
  "--window-size=1680,1000", "--force-device-scale-factor=1",
  `--remote-debugging-port=${PORT}`, "--user-data-dir=" + tmpdir() + "/wall-shot-cdp", URL,
], { stdio: "ignore" });

try {
  let list = null;
  for (let i = 0; i < 60 && !list; i++) {
    await sleep(300);
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch {}
  }
  const page = list?.find((t) => t.type === "page" && !t.url.startsWith("chrome"));
  if (!page) throw new Error("no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  let id = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const on = (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id === mid) { ws.off("message", on); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
    };
    ws.on("message", on);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expression) => {
    const { result } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return result.value;
  };

  // wait for the toggle, then ensure the wall is OPEN (toggle if closed)
  let found = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    found = await evalJs(`[...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === '打开或关闭多窗口墙')`);
    if (found) break;
  }
  if (!found) throw new Error("toggle not found");
  await evalJs(`(() => {
    const open = !!document.querySelector('[aria-label="多窗口墙"]');
    if (!open) { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '打开或关闭多窗口墙'); b?.click(); }
    return open;
  })()`);

  // wait for panes
  let panes = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    panes = await evalJs(`document.querySelectorAll('section[data-port]').length`);
    if (panes > 0) break;
  }
  await sleep(6000); // let iframes paint
  await send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 1000, deviceScaleFactor: 1, mobile: false });
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log(`saved ${OUT} with ${panes} pane(s)`);
  ws.close();
} finally {
  proc.kill();
  process.exit(0);
}
