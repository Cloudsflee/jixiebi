const GATEWAY_URL_KEY = "teach_front_gateway_url";
const ENTRY_MODE_KEY = "teach_front_entry_mode";
const ENTRY_TS_KEY = "teach_front_entry_ts";

const dom = {
  wsUrl: document.getElementById("armWsUrl"),
  connectBtn: document.getElementById("armConnectBtn"),
  pingBtn: document.getElementById("armPingBtn"),
  enterBtn: document.getElementById("armEnterBtn"),
  skipBtn: document.getElementById("armSkipBtn"),
  status: document.getElementById("armLinkStatus"),
  hint: document.getElementById("armGateHint"),
  logs: document.getElementById("armLinkLogs")
};

const state = {
  ws: null,
  seq: 0,
  connecting: false,
  connected: false,
  canEnter: false
};

function log(message, detail) {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const ss = String(t.getSeconds()).padStart(2, "0");
  const prefix = `[${hh}:${mm}:${ss}]`;
  const line = detail === undefined
    ? `${prefix} ${message}`
    : `${prefix} ${message} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  if (dom.logs) {
    dom.logs.textContent = `${line}\n${dom.logs.textContent}`.slice(0, 12000);
  }
}

function setStatus(text, tone = "idle") {
  if (!dom.status) return;
  dom.status.textContent = text;
  dom.status.classList.remove("tone-ok", "tone-warn", "tone-bad");
  if (tone === "ok") dom.status.classList.add("tone-ok");
  if (tone === "warn") dom.status.classList.add("tone-warn");
  if (tone === "bad") dom.status.classList.add("tone-bad");
}

function syncButtons() {
  if (dom.connectBtn) {
    dom.connectBtn.disabled = state.connecting;
    dom.connectBtn.textContent = state.connecting ? "连接中..." : "连接机械臂";
  }
  if (dom.pingBtn) dom.pingBtn.disabled = !(state.ws && state.ws.readyState === WebSocket.OPEN);
  if (dom.enterBtn) dom.enterBtn.disabled = !state.canEnter;
}

function persistUrl(url) {
  try {
    sessionStorage.setItem(GATEWAY_URL_KEY, url);
  } catch {}
}

function markEntry(mode) {
  try {
    sessionStorage.setItem(ENTRY_MODE_KEY, String(mode || ""));
    sessionStorage.setItem(ENTRY_TS_KEY, String(Date.now()));
  } catch {}
}

function enterTeaching(mode) {
  const url = String(dom.wsUrl?.value || "ws://127.0.0.1:8787").trim();
  persistUrl(url);
  markEntry(mode);
  window.location.href = `./teaching.html?entry=${encodeURIComponent(mode)}`;
}

function send(payload) {
  if (!(state.ws && state.ws.readyState === WebSocket.OPEN)) return false;
  try {
    state.ws.send(JSON.stringify(payload));
    return true;
  } catch (e) {
    log("发送失败", String(e));
    return false;
  }
}

function handleGatewayMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "gateway_status") {
    const serialOpen = msg.serialOpen === true;
    const portText = msg.port ? ` (${msg.port})` : "";
    setStatus(serialOpen ? `机械臂在线${portText}` : `网关已连 / 串口未开${portText}`, serialOpen ? "ok" : "warn");
    state.canEnter = true;
    syncButtons();
    log("网关状态", { serialOpen, port: msg.port || "" });
    return;
  }
  if (msg.type === "error") {
    setStatus(`错误: ${msg.code || "unknown"}`, "bad");
    log("网关错误", msg);
    return;
  }
  log("RX", msg);
}

function connect() {
  const url = String(dom.wsUrl?.value || "").trim();
  if (!url) {
    setStatus("请输入 WS 地址", "warn");
    return;
  }
  persistUrl(url);
  state.seq += 1;
  const seq = state.seq;

  if (state.ws) {
    try { state.ws.close(); } catch {}
    state.ws = null;
  }

  state.connecting = true;
  state.connected = false;
  state.canEnter = false;
  setStatus("正在连接...", "warn");
  syncButtons();
  log("开始连接", { url });

  let ws;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    state.connecting = false;
    setStatus("连接失败", "bad");
    syncButtons();
    log("创建连接失败", String(e));
    return;
  }
  state.ws = ws;

  ws.addEventListener("open", () => {
    if (state.seq !== seq) return;
    state.connecting = false;
    state.connected = true;
    state.canEnter = true;
    setStatus("网关已连接", "ok");
    syncButtons();
    log("连接成功", { url });
    send({ type: "ping" });
  });

  ws.addEventListener("close", () => {
    if (state.seq !== seq) return;
    state.connecting = false;
    state.connected = false;
    state.ws = null;
    setStatus("连接已断开", "warn");
    syncButtons();
    log("连接关闭");
  });

  ws.addEventListener("error", () => {
    if (state.seq !== seq) return;
    state.connecting = false;
    state.connected = false;
    state.ws = null;
    setStatus("连接错误", "bad");
    syncButtons();
    log("连接错误");
  });

  ws.addEventListener("message", (evt) => {
    if (state.seq !== seq) return;
    try {
      handleGatewayMessage(JSON.parse(evt.data));
    } catch {
      log("RX(raw)", { data: evt.data });
    }
  });
}

function init() {
  try {
    const saved = sessionStorage.getItem(GATEWAY_URL_KEY);
    if (saved && dom.wsUrl) dom.wsUrl.value = saved;
  } catch {}

  setStatus("未连接", "idle");
  syncButtons();

  dom.connectBtn?.addEventListener("click", connect);
  dom.pingBtn?.addEventListener("click", () => {
    if (!send({ type: "ping" })) {
      setStatus("请先连接后再 PING", "warn");
    } else {
      log("PING sent");
    }
  });
  dom.enterBtn?.addEventListener("click", () => enterTeaching("connected"));
  dom.skipBtn?.addEventListener("click", () => {
    log("跳过连接，进入教学页");
    enterTeaching("skip");
  });
  dom.wsUrl?.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      connect();
    }
  });
}

init();
