/**
 * Headless verification that the multi-window wall renders INSIDE the official
 * DSH GUI as a conversation view: opens a dsh instance, waits for the shell,
 * clicks the sidebar footer "多窗口墙" shortcut (which activates the
 * 'conversation.view' ring entry — the header tab), and reports panes/iframes
 * rendered in the right-hand panel in place of the chat.
 *
 * Usage: node plugin/dsh-client-ui-multi-wall/test/gui-check.mjs <url>
 * Requires 'ws' resolvable and Chrome/Edge installed.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const WALL_URL = process.argv[2] ?? "http://127.0.0.1:3199/";
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const browser = browsers.find(existsSync);
if (!browser) { console.error("no browser"); process.exit(1); }

const PORT = 9440;
const proc = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-extensions",
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + tmpdir() + "/wall-gui-check",
  WALL_URL,
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

  const errors = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails?.text ?? "exception");
  });

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

  // 1. wait for the official shell to mount
  let shell = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    shell = await evalJs(`JSON.stringify({
      hasRoot: !!document.querySelector('[data-shell-overlay]'),
      toggleCount: [...document.querySelectorAll('button')].filter(b => (b.textContent||'').includes('多窗口墙') || b.getAttribute('aria-label') === '打开或关闭多窗口墙').length,
      bodyText: document.body.innerText.slice(0, 200),
    })`);
    if (JSON.parse(shell).toggleCount > 0) break;
  }
  const shellState = JSON.parse(shell ?? "{}");
  check("official shell mounted (shell.overlay layer present)", !!shellState.hasRoot, `hasRoot=${!!shellState.hasRoot}`);
  check("sidebar footer wall shortcut rendered", shellState.toggleCount >= 1, `toggleCount=${shellState.toggleCount}`);

  // 2. click the sidebar footer shortcut (opens the wall view). The view
  // ring's header tab carries the same label; either is a valid activation.
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '打开或关闭多窗口墙' || (b.textContent||'').includes('多窗口墙'));
    if (btn) btn.click();
    return true;
  })()`);

  // 3. wait for the wall view to render panes inside the right-hand panel
  let wall = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    wall = await evalJs(`JSON.stringify({
      panes: document.querySelectorAll('section[data-port]').length,
      iframes: [...document.querySelectorAll('iframe')].filter(f => (f.title||'').startsWith('DSH :')).length,
      viewRegion: !!document.querySelector('[aria-label="多窗口墙"][role="region"]'),
      ports: [...document.querySelectorAll('section[data-port] span')].map(e => e.textContent).filter(t => /127\\.0\\.0\\.1:/.test(t)),
    })`);
    if (JSON.parse(wall).panes > 0) break;
  }
  const wallState = JSON.parse(wall ?? "{}");
  check("wall view renders inside the right-hand panel", wallState.viewRegion === true, `viewRegion=${wallState.viewRegion}`);
  check("wall renders panes (one per live instance)", wallState.panes >= 1, `panes=${wallState.panes}`);
  check("each pane embeds an iframe", wallState.iframes === wallState.panes, `iframes=${wallState.iframes} panes=${wallState.panes}`);
  check("no console exceptions", errors.length === 0, errors.length ? errors.join("; ") : "");

  console.log(failures === 0 ? "\nGUI CHECK PASSED ✔ — wall renders as a conversation view in the official DSH GUI" : `\n${failures} CHECK(S) FAILED ✘`);
  ws.close();
  process.exit(failures === 0 ? 0 : 1);
} finally {
  proc.kill();
}
