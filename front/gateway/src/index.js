const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const WebSocket = require("ws");
const fs = require("fs/promises");
const path = require("path");

const SERIAL_PORT = process.env.SERIAL_PORT || "COM5";
const SERIAL_BAUD = Number(process.env.SERIAL_BAUD || 9600);
const WS_PORT = Number(process.env.WS_PORT || 8787);
const JOINT_CONFIG_PATH = path.resolve(__dirname, "../../web/joints.json");

const port = new SerialPort({
  path: SERIAL_PORT,
  baudRate: SERIAL_BAUD,
  autoOpen: false,
});

const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
const wss = new WebSocket.Server({ port: WS_PORT });

let isSerialOpen = false;

function log(...args) {
  const now = new Date().toISOString();
  console.log(`[${now}]`, ...args);
}

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload) {
  for (const ws of wss.clients) {
    safeSend(ws, payload);
  }
}

function writeSerialLine(line) {
  if (!isSerialOpen) {
    return false;
  }
  port.write(line.endsWith("\n") ? line : `${line}\n`);
  return true;
}

function parseMcuLine(rawLine) {
  const line = rawLine.trim();
  if (!line) {
    return { type: "empty", raw: rawLine };
  }

  if (line === "OK") {
    return { type: "ok" };
  }

  if (line.startsWith("ERR,")) {
    return { type: "error", code: line.slice(4) || "UNKNOWN" };
  }

  if (line.startsWith("P,")) {
    const parts = line.split(",");
    if (parts.length === 3) {
      return {
        type: "position",
        id: Number(parts[1]),
        pos: Number(parts[2]),
      };
    }
  }

  if (line.startsWith("V,")) {
    const parts = line.split(",");
    if (parts.length === 3) {
      return {
        type: "vin",
        id: Number(parts[1]),
        mv: Number(parts[2]),
      };
    }
  }

  if (line.startsWith("T,")) {
    const parts = line.split(",");
    if (parts.length === 3) {
      return {
        type: "temp",
        id: Number(parts[1]),
        celsius: Number(parts[2]),
      };
    }
  }

  if (line.startsWith("I,")) {
    const parts = line.split(",");
    if (parts.length === 3) {
      return {
        type: "actual_id",
        id: Number(parts[1]),
        actualId: Number(parts[2]),
      };
    }
  }

  return { type: "raw", line };
}

function normalizeRequestId(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 80) : "";
}

function validateJointConfigObject(config) {
  return !!config && typeof config === "object" && Array.isArray(config.joints);
}

async function readJointConfigFile() {
  const text = await fs.readFile(JOINT_CONFIG_PATH, "utf8");
  const parsed = JSON.parse(text);
  if (!validateJointConfigObject(parsed)) {
    throw new Error("joints.json missing joints[]");
  }
  return parsed;
}

async function writeJointConfigFile(config) {
  if (!validateJointConfigObject(config)) {
    throw new Error("bad config payload, joints[] required");
  }

  const text = `${JSON.stringify(config, null, 2)}\n`;
  await fs.writeFile(JOINT_CONFIG_PATH, text, "utf8");
}

async function handleConfigMessage(ws, data) {
  const requestId = normalizeRequestId(data.requestId);

  if (data.type === "config_read") {
    try {
      const config = await readJointConfigFile();
      safeSend(ws, {
        type: "config_read_ack",
        ok: true,
        requestId,
        path: JOINT_CONFIG_PATH,
        config
      });
    } catch (error) {
      safeSend(ws, {
        type: "config_read_ack",
        ok: false,
        requestId,
        path: JOINT_CONFIG_PATH,
        error: String(error?.message || error)
      });
    }
    return true;
  }

  if (data.type === "config_write") {
    try {
      await writeJointConfigFile(data.config);
      safeSend(ws, {
        type: "config_write_ack",
        ok: true,
        requestId,
        path: JOINT_CONFIG_PATH
      });
    } catch (error) {
      safeSend(ws, {
        type: "config_write_ack",
        ok: false,
        requestId,
        path: JOINT_CONFIG_PATH,
        error: String(error?.message || error)
      });
    }
    return true;
  }

  return false;
}

function handleWsMessage(ws, text) {
  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    safeSend(ws, { type: "error", code: "BAD_JSON" });
    return;
  }

  if (data && typeof data === "object" && (data.type === "config_read" || data.type === "config_write")) {
    handleConfigMessage(ws, data);
    return;
  }

  if (!isSerialOpen) {
    safeSend(ws, { type: "error", code: "SERIAL_NOT_OPEN" });
    return;
  }

  if (data.type === "ping") {
    writeSerialLine("PING");
    return;
  }

  if (data.type === "move") {
    const id = Number(data.id);
    const pos = Number(data.pos);
    const time = Number(data.time || 300);

    if (!Number.isInteger(id) || !Number.isInteger(pos) || !Number.isInteger(time)) {
      safeSend(ws, { type: "error", code: "BAD_ARG" });
      return;
    }

    writeSerialLine(`M,${id},${pos},${time}`);
    return;
  }

  if (data.type === "query") {
    const id = Number(data.id);
    if (!Number.isInteger(id)) {
      safeSend(ws, { type: "error", code: "BAD_ARG" });
      return;
    }
    writeSerialLine(`Q,${id}`);
    return;
  }

  if (data.type === "vin") {
    const id = Number(data.id);
    if (!Number.isInteger(id)) {
      safeSend(ws, { type: "error", code: "BAD_ARG" });
      return;
    }
    writeSerialLine(`V,${id}`);
    return;
  }

  if (data.type === "temp") {
    const id = Number(data.id);
    if (!Number.isInteger(id)) {
      safeSend(ws, { type: "error", code: "BAD_ARG" });
      return;
    }
    writeSerialLine(`T,${id}`);
    return;
  }

  if (data.type === "id_read") {
    const id = Number(data.id);
    if (!Number.isInteger(id)) {
      safeSend(ws, { type: "error", code: "BAD_ARG" });
      return;
    }
    writeSerialLine(`I,${id}`);
    return;
  }

  if (data.type === "raw") {
    if (typeof data.line !== "string") {
      safeSend(ws, { type: "error", code: "BAD_ARG" });
      return;
    }
    writeSerialLine(data.line);
    return;
  }

  safeSend(ws, { type: "error", code: "UNKNOWN_CMD" });
}

port.on("open", () => {
  isSerialOpen = true;
  log(`Serial opened: ${SERIAL_PORT} @ ${SERIAL_BAUD}`);
  broadcast({ type: "gateway_status", serialOpen: true, port: SERIAL_PORT, baud: SERIAL_BAUD });
});

port.on("close", () => {
  isSerialOpen = false;
  log("Serial closed");
  broadcast({ type: "gateway_status", serialOpen: false });
});

port.on("error", (err) => {
  log("Serial error:", err.message);
  broadcast({ type: "error", code: "SERIAL_ERROR", message: err.message });
});

parser.on("data", (line) => {
  const parsed = parseMcuLine(line);
  broadcast({ type: "mcu", raw: line.trim(), parsed });
});

wss.on("connection", (ws) => {
  log("WebSocket connected");
  safeSend(ws, {
    type: "gateway_status",
    serialOpen: isSerialOpen,
    port: SERIAL_PORT,
    baud: SERIAL_BAUD,
    wsPort: WS_PORT,
  });

  ws.on("message", (data) => handleWsMessage(ws, String(data)));
  ws.on("close", () => log("WebSocket disconnected"));
});

port.open((err) => {
  if (err) {
    log(`Failed to open serial: ${err.message}`);
  }
});

log(`Gateway listening on ws://127.0.0.1:${WS_PORT}`);
log(`Target serial: ${SERIAL_PORT} @ ${SERIAL_BAUD}`);
