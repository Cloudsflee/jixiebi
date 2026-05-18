const GATEWAY_URL_KEY = "teach_front_gateway_url";

function resolveGatewayUrl() {
  try {
    const saved = String(localStorage.getItem(GATEWAY_URL_KEY) || "").trim();
    if (saved) return saved;
  } catch (_e) {
    /* ignore */
  }
  const host = window.location.hostname || "127.0.0.1";
  return `ws://${host}:8787`;
}

function openGatewaySocket(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch (_e) {
        /* ignore */
      }
      reject(new Error("网关连接超时"));
    }, timeoutMs);

    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("网关连接失败"));
    });
  });
}

function sendMove(ws, id, pos, time) {
  ws.send(JSON.stringify({ type: "move", id, pos, time }));
}

function queryPosition(ws, id, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const requestId = `q_${Date.now()}_${id}`;
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMsg);
      reject(new Error(`query J${id} timeout`));
    }, timeoutMs);

    function onMsg(ev) {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "position" && Number(msg.id) === Number(id)) {
          clearTimeout(timer);
          ws.removeEventListener("message", onMsg);
          resolve(Number(msg.pos));
        }
      } catch (_e) {
        /* ignore */
      }
    }

    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ type: "query", id, requestId }));
  });
}

function degToCommandPos(deg, scale) {
  return Math.round(Number(deg) * scale);
}

export function initHardwareBridgeRuntime(app) {
  app.hardwareJoints = app.hardwareJoints || {};
  app.hardwareBridge = {
    getGatewayConfig() {
      return app.config?.gateway || {};
    },
    getServoId(jointName) {
      const map = app.config?.gateway?.jointServoIds || {};
      return map[jointName];
    }
  };
}

export async function syncTwinToHardwareRuntime(app) {
  if (app.isDemoPlaying) {
    app.log("演示播放中，已跳过实机同步");
    return { ok: false, reason: "demo_playing" };
  }

  const cfg = app.config?.gateway || {};
  const scale = Math.max(0.1, Number(cfg.commandScaleDeg) || 10);
  const timeMs = Math.max(400, Number(cfg.moveTimeMs) || 900);
  const ids = cfg.jointServoIds || { J1: 1, J2: 2, J3: 3, J4: 4 };

  if (!window.confirm("确认将当前数字孪生关节角同步到实体机械臂？请确保周围安全。")) {
    return { ok: false, reason: "cancelled" };
  }

  const url = resolveGatewayUrl();
  let ws;
  try {
    ws = await openGatewaySocket(url);
    const order = ["J1", "J2", "J3", "J4"];
    for (let i = 0; i < order.length; i += 1) {
      const name = order[i];
      const servoId = ids[name];
      if (!servoId) continue;
      const deg = Number(app.jointAngles[name] || 0);
      const pos = degToCommandPos(deg, scale);
      sendMove(ws, servoId, pos, timeMs);
      await new Promise((r) => setTimeout(r, timeMs + 120));
    }
    app.log("已下发实机同步指令");
    if (app.dom.kinHwStatus) {
      app.dom.kinHwStatus.textContent = "实机同步指令已发送，请观察实体臂动作。";
    }
    return { ok: true };
  } catch (err) {
    app.log("实机同步失败", err.message || err);
    if (app.dom.kinHwStatus) {
      app.dom.kinHwStatus.textContent = `同步失败：${err.message || err}`;
    }
    return { ok: false, reason: err.message || String(err) };
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close();
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

export async function readHardwareJointsRuntime(app) {
  if (app.isDemoPlaying) {
    return { ok: false, reason: "demo_playing" };
  }

  const cfg = app.config?.gateway || {};
  const scale = Math.max(0.1, Number(cfg.commandScaleDeg) || 10);
  const ids = cfg.jointServoIds || { J1: 1, J2: 2, J3: 3, J4: 4 };
  const url = resolveGatewayUrl();
  let ws;

  try {
    ws = await openGatewaySocket(url);
    const read = {};
    for (const [name, servoId] of Object.entries(ids)) {
      try {
        const pos = await queryPosition(ws, servoId);
        read[name] = pos / scale;
      } catch (_e) {
        read[name] = Number.NaN;
      }
    }
    app.hardwareJoints = read;
    updateTwinHardwareDeltaUi(app);
    app.log("已从实机读取关节", read);
    return { ok: true, joints: read };
  } catch (err) {
    if (app.dom.kinHwStatus) {
      app.dom.kinHwStatus.textContent = `读取失败：${err.message || err}`;
    }
    return { ok: false, reason: err.message || String(err) };
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close();
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

export function updateTwinHardwareDeltaUi(app) {
  if (!app.dom.kinHwStatus) return;
  const hw = app.hardwareJoints || {};
  const names = ["J1", "J2", "J3", "J4"];
  const parts = [];
  for (const n of names) {
    const twin = Number(app.jointAngles[n] || 0);
    const real = Number(hw[n]);
    if (!Number.isFinite(real)) {
      parts.push(`${n}: --`);
    } else {
      const d = Math.abs(twin - real);
      parts.push(`${n} Δ${d.toFixed(1)}°`);
    }
  }
  app.dom.kinHwStatus.textContent = parts.length ? `孪生-实机：${parts.join(" | ")}` : "尚未读取实机关节";
}
