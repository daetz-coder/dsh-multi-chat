/**
 * Headless verification of the wall's STOP flow inside the official DSH GUI:
 * opens a dsh instance, opens the wall, clicks a pane's "关闭实例" twice
 * (arm + confirm), and verifies the pane is removed and the target process
 * terminates.
 *
 * Usage: node plugin/dsh-client-ui-multi-wall/test/stop-check.mjs <host-url> <victim-port>
 * Requires 'ws' resolvable and Chrome/Edge installed.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const HOST_URL = process.argv[2] ?? "http://127.0.0.1:3199/";
const VICTIM = Number(process.argv[3] ?? 3085);
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const browser = browsers.find(existsSync);
if (!browser) { console.error("no browser"); process.exit(1); }

const PORT = 9450;
const proc = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-extensions",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + tmpdir() + "/wall-stop-check",
  HOST_URL,
], { stdio: "ignore" });

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

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

  await send("Runtime.enable");

  // 1. wait for the toggle, open the wall
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await evalJs(`[...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === '打开或关闭多窗口墙')`)) break;
  }
  await evalJs(`(() => {
    if (!document.querySelector('[aria-label="多窗口墙"]')) {
      [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '打开或关闭多窗口墙')?.click();
    }
    return true;
  })()`);

  // 2. wait for the victim pane
  let found = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    found = await evalJs(`!!document.querySelector('section[data-port="${VICTIM}"]')`);
    if (found) break;
  }
  check(`victim pane :${VICTIM} visible in wall`, found);

  // 3. click the victim's stop button once (arm) — no stop yet
  await evalJs(`(() => {
    const pane = document.querySelector('section[data-port="${VICTIM}"]');
    const btn = pane?.querySelector('button[title="关闭实例"]');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(300);
  const armed = await evalJs(`(() => {
    const pane = document.querySelector('section[data-port="${VICTIM}"]');
    return pane?.querySelector('button[title="关闭实例"]')?.textContent ?? '';
  })()`);
  check("first click arms confirm (label swaps)", armed.includes('确定关闭'), `label=${JSON.stringify(armed)}`);

  // 4. second click executes the stop
  await evalJs(`(() => {
    const pane = document.querySelector('section[data-port="${VICTIM}"]');
    const btn = pane?.querySelector('button[title="关闭实例"]');
    if (btn) btn.click();
    return !!btn;
  })()`);

  // 5. pane disappears + status shows stopped
  let gone = false, status = "";
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    gone = await evalJs(`!document.querySelector('section[data-port="${VICTIM}"]')`);
    // CSS module classes are hashed; search the wall dialog's text directly.
    status = await evalJs(`document.querySelector('[aria-label="多窗口墙"]')?.textContent ?? ''`);
    if (gone) break;
  }
  check("victim pane removed after confirm", gone);
  check("status reports the stop", status.includes(`:${VICTIM}`), `status=${JSON.stringify(status.slice(0, 80))}`);

  // 6. victim process is actually gone
  let victimDown = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try { await fetch(`http://127.0.0.1:${VICTIM}/`, { signal: AbortSignal.timeout(1000) }); } catch { victimDown = true; break; }
  }
  check(`:${VICTIM} process terminated`, victimDown);

  console.log(failures === 0 ? "\nSTOP CHECK PASSED ✔" : `\n${failures} CHECK(S) FAILED ✘`);
  ws.close();
  process.exit(failures === 0 ? 0 : 1);
} finally {
  proc.kill();
}
