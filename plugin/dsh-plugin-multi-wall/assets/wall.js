/**
 * dsh-multi-wall page logic.
 *
 * State: a list of pane descriptors ({port, title?}), grid columns, focused
 * port. Persisted to localStorage so the layout survives reloads.
 */
(() => {
  "use strict";

  const LS_KEY = "dsh-multi-wall:v1";
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const statusText = document.getElementById("status-text");
  const scanFrom = document.getElementById("scan-from");
  const scanTo = document.getElementById("scan-to");
  const addPort = document.getElementById("add-port");
  const columnsSel = document.getElementById("columns");

  // Mount-agnostic API base: standalone wall serves at "/", the integrated
  // plugin variant mounts the same page at "/multi". Both work with this page.
  const API_BASE = (() => {
    const dir = location.pathname.replace(/\/[^/]*$/, "");
    return dir === "" ? "" : dir.replace(/\/+$/, "");
  })();

  const state = loadState();
  let statusTimer = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return {
          ports: Array.isArray(s.ports) ? s.ports.map(Number).filter((p) => p > 0 && p < 65536) : [],
          columns: s.columns ?? "auto",
        };
      }
    } catch { /* corrupted state -> defaults */ }
    return { ports: [], columns: "auto" };
  }

  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ports: state.ports, columns: state.columns }));
    } catch { /* storage full / private mode -> ignore */ }
  }

  function setStatus(text) {
    statusText.textContent = text;
  }

  async function api(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── discovery ─────────────────────────────────────── */

  async function discover() {
    const from = Number(scanFrom.value) || 3070;
    const to = Number(scanTo.value) || 3110;
    setStatus(`扫描 ${from}–${to} …`);
    try {
      const data = await api(`/api/ports?from=${from}&to=${to}`);
      // /api/ports currently probes a full range regardless of query params;
      // normalize the response shape {ports:[{port,alive,status}]}.
      const found = (data.ports ?? [])
        .filter((p) => p.alive)
        .map((p) => p.port);
      if (found.length === 0) {
        setStatus(`区间 ${from}–${to} 未发现 DSH 实例`);
        return;
      }
      for (const port of found) addPane(port);
      setStatus(`发现 ${found.length} 个实例：${found.join(", ")}`);
    } catch (err) {
      setStatus(`扫描失败：${err.message}`);
    }
  }

  /* ── panes ─────────────────────────────────────────── */

  function addPane(port, { focus = false } = {}) {
    if (state.ports.includes(port)) return;
    state.ports.push(port);
    saveState();
    render();
    if (focus) focusPane(port);
  }

  function removePane(port) {
    state.ports = state.ports.filter((p) => p !== port);
    saveState();
    render();
  }

  function render() {
    grid.innerHTML = "";
    empty.classList.toggle("hidden", state.ports.length > 0);

    for (const port of state.ports) {
      const pane = document.createElement("section");
      pane.className = "pane";
      pane.dataset.port = port;

      const head = document.createElement("div");
      head.className = "pane-head";
      head.title = "点击放大 / 还原";

      const dot = document.createElement("span");
      dot.className = "dot";
      head.appendChild(dot);

      const title = document.createElement("span");
      title.className = "pane-title";
      title.textContent = `127.0.0.1:${port}`;
      const sub = document.createElement("small");
      sub.textContent = "DSH";
      title.appendChild(sub);
      head.appendChild(title);

      const actions = document.createElement("div");
      actions.className = "pane-actions";

      const btnZoom = mkAction("⛶", "放大 / 还原（双击或点击标题）");
      btnZoom.addEventListener("click", (e) => { e.stopPropagation(); toggleFocus(port); });
      actions.appendChild(btnZoom);

      const btnReload = mkAction("⟳", "重新加载该窗口");
      btnReload.addEventListener("click", (e) => {
        e.stopPropagation();
        const body = pane.querySelector(".pane-body");
        const iframe = body.querySelector("iframe");
        if (iframe) iframe.src = iframe.src;
      });
      actions.appendChild(btnReload);

      const btnOpen = mkAction("↗", "在新标签页打开");
      btnOpen.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(`http://127.0.0.1:${port}/`, `_blank`);
      });
      actions.appendChild(btnOpen);

      const btnClose = mkAction("✕", "关闭该窗口", true);
      btnClose.addEventListener("click", (e) => {
        e.stopPropagation();
        removePane(port);
      });
      actions.appendChild(btnClose);

      head.appendChild(actions);

      const body = document.createElement("div");
      body.className = "pane-body";
      const cover = document.createElement("div");
      cover.className = "loading-cover";
      cover.textContent = `加载 http://127.0.0.1:${port}/ …`;
      const iframe = document.createElement("iframe");
      iframe.src = `http://127.0.0.1:${port}/`;
      iframe.loading = "lazy";
      iframe.title = `DSH :${port}`;
      iframe.addEventListener("load", () => cover.remove());
      body.appendChild(cover);
      body.appendChild(iframe);

      pane.appendChild(head);
      pane.appendChild(body);
      grid.appendChild(pane);
    }

    grid.dataset.cols = state.columns;
    columnsSel.value = state.columns;
    updateDots();
    startStatusPolling();
  }

  function mkAction(label, title, danger = false) {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    if (danger) b.classList.add("danger");
    return b;
  }

  /* ── focus / zoom ──────────────────────────────────── */

  function focusPane(port) {
    document.querySelectorAll(".pane").forEach((p) => {
      p.classList.toggle("focused", Number(p.dataset.port) === port);
    });
    document.body.classList.add("zoomed");
  }

  function unfocus() {
    document.body.classList.remove("zoomed");
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("focused"));
  }

  function toggleFocus(port) {
    const isFocused = document.body.classList.contains("zoomed") &&
      document.querySelector(`.pane.focused`)?.dataset.port === String(port);
    if (isFocused) unfocus();
    else focusPane(port);
  }

  /* ── liveness dots ─────────────────────────────────── */

  function updateDots() {
    if (state.ports.length === 0) return;
    api(`/api/status?ports=${state.ports.join(",")}`)
      .then((data) => {
        const byPort = new Map((data.ports ?? []).map((p) => [p.port, p]));
        document.querySelectorAll(".pane").forEach((pane) => {
          const port = Number(pane.dataset.port);
          const info = byPort.get(port);
          const dot = pane.querySelector(".dot");
          if (!dot) return;
          dot.className = "dot " + (info ? (info.alive ? "ok" : "bad") : "scan");
        });
      })
      .catch(() => { /* keep previous dots */ });
  }

  function startStatusPolling() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(updateDots, 5000);
  }

  /* ── events ────────────────────────────────────────── */

  document.getElementById("btn-scan").addEventListener("click", discover);
  document.getElementById("btn-add").addEventListener("click", () => {
    const port = Number(addPort.value);
    if (!port) { setStatus("请输入端口号"); return; }
    addPane(port, { focus: state.ports.length === 0 });
    addPort.value = "";
    setStatus(`已添加 :${port}`);
  });
  addPort.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-add").click();
  });
  scanTo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-scan").click();
  });

  document.getElementById("btn-refresh-all").addEventListener("click", () => {
    document.querySelectorAll(".pane iframe").forEach((f) => { f.src = f.src; });
    setStatus("已刷新全部窗口");
  });

  columnsSel.addEventListener("change", () => {
    state.columns = columnsSel.value;
    saveState();
    grid.dataset.cols = state.columns;
  });

  // Double-click a pane header toggles zoom.
  grid.addEventListener("dblclick", (e) => {
    const pane = e.target.closest(".pane");
    if (pane) toggleFocus(Number(pane.dataset.port));
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") unfocus();
  });

  // Auto-discover on first load when the saved list is empty.
  render();
  if (state.ports.length === 0) discover();
})();
