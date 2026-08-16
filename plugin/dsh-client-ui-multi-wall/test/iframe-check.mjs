/** Check that iframes inside the wall actually render the DSH UI content. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const browser = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9444;
const proc = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-extensions",
  "--window-size=1680,1000",
  `--remote-debugging-port=${PORT}`, "--user-data-dir=" + tmpdir() + "/wall-iframe-check",
  "http://127.0.0.1:3199/",
], { stdio: "ignore" });

try {
  let list = null;
  for (let i = 0; i < 60 && !list; i++) {
    await sleep(300);
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch {}
  }
  const page = list.find((t) => t.type === "page" && !t.url.startsWith("chrome"));
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
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await evalJs(`document.querySelectorAll('section[data-port]').length > 0`)) break;
  }
  await sleep(10000);

  const state = await evalJs(`JSON.stringify([...document.querySelectorAll('iframe')].map(f => ({
    title: f.title,
    src: f.src,
    hasDoc: !!f.contentDocument,
    readyState: f.contentDocument?.readyState ?? '',
    bodyLen: f.contentDocument?.body?.innerText?.length ?? 0,
    bodyHead: f.contentDocument?.body?.innerText?.slice(0, 50) ?? '',
  })))`);
  console.log("iframe state:", state);
  ws.close();
} finally {
  proc.kill();
  process.exit(0);
}
