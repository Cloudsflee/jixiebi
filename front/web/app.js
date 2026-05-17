import * as THREE from "./vendor/three/three.module.js?v=20260515-232131";
import {
  DEFAULT_DEMO_ARM_MODEL,
  normalizeDemoArmModel,
  forwardKinematics as runDemoForwardKinematics,
  inverseKinematics as runDemoInverseKinematics
} from "./modules/demo_kinematics.js?v=20260515-232131";
import {
  DEFAULT_PSEUDO_FEA_MODEL,
  normalizePseudoFeaModel,
  evaluatePseudoFea
} from "./modules/demo_fea.js?v=20260515-232131";
import {
  TARGET_ORDER,
  PRESET_STORAGE_KEY,
  PRESET_SCHEMA_VERSION,
  PRESET_MAX_COUNT,
  FRONT_MINIMAL_MODE,
  FALLBACK_CONFIG,
  defaultParentTargetForTarget
} from "./modules/app_constants.js?v=20260518-022000";
import {
  sanitizePossibleMojibakeText,
  clampInt,
  clampNumber,
  normalizeCommandScale,
  estimateDefaultCommandScaleByJointRange,
  toFiniteNumber
} from "./modules/app_utils.js?v=20260518-022000";
import {
  safeAxis,
  axisNameFromVector,
  axisVectorFromAxisName,
  toVec3,
  normalizePivotArray,
  normalizeAxisVectorArray,
  normalizePivotSpace,
  normalizePhysicalPointSpace,
  parseOptionalVec3,
  projectVec3ToPlane2,
  wrapAngleDeg,
  absAngleDiffDeg
} from "./modules/app_geometry_utils.js?v=20260518-022000";
import {
  buildAutoPresetName,
  normalizePresetName,
  readPresetList as readPresetListRaw,
  writePresetList as writePresetListRaw,
  serializeConfig,
  downloadConfigFile,
  supportsFileSystemAccess,
  readJointConfigFromFileHandle as readJointConfigFromFileHandleRaw,
  writeConfigToFileOrDownload as writeConfigToFileOrDownloadRaw
} from "./modules/app_preset_io.js?v=20260518-025500";
import { createGatewayBridge } from "./modules/app_gateway.js?v=20260518-030500";
import {
  createRobotHierarchyStructure,
  loadRobotMeshes as loadRobotMeshesRaw,
  fitCameraToObject as fitCameraToObjectRaw,
  setPlaneView as setPlaneViewRaw,
  resolveFrameCalibrationConfig as resolveFrameCalibrationConfigRaw
} from "./modules/app_viewer_helpers.js?v=20260518-032500";
import {
  createNumberInput,
  replaceMojibakeInDom,
  createPanelSection
} from "./modules/app_panel_ui.js?v=20260518-035000";
import { buildJointCardLayout } from "./modules/app_joint_card_layout.js?v=20260518-041500";
import { attachJointCardBehavior } from "./modules/app_joint_card_bindings.js?v=20260518-043500";
import { initializeJointCardState } from "./modules/app_joint_card_state_bindings.js?v=20260518-145500";
import { createPresetController } from "./modules/app_preset_controller.js?v=20260518-051500";
import { applyPresetGlobalSettingsRaw, applyPresetJointToStateRaw } from "./modules/app_preset_apply.js?v=20260518-122500";
import { writeJointConfigAction } from "./modules/app_config_writer.js?v=20260518-052500";
import { createMotionCommandController } from "./modules/app_motion_commands.js?v=20260518-124500";
import { createPollingController } from "./modules/app_polling_controller.js?v=20260518-130500";
import { shouldRealtimeSendRaw, scheduleRealtimeMoveRaw } from "./modules/app_realtime_scheduler.js?v=20260518-133500";
import { initViewerRuntime } from "./modules/app_viewer_runtime.js?v=20260518-135500";
import { alignRobotFrameByJ1AndFrontRaw } from "./modules/app_frame_calibration.js?v=20260518-141500";
import { initJointStatesRaw } from "./modules/app_joint_state_init.js?v=20260518-153500";
import {
  getStateMeshWorldBoxRaw,
  getTargetMeshWorldBoxRaw,
  inferJointPivotWorldByBoxesRaw,
  maybeAutoInferAssemblyPivotsRaw,
  applyConfiguredPivotsRaw
} from "./modules/app_pivot_inference.js?v=20260518-143500";
import { setPivotKeepingWorldRaw } from "./modules/app_pivot_transform.js?v=20260518-151500";
import { createCoordProbeController } from "./modules/app_coord_probe_controller.js?v=20260518-054500";
import { createCoordProbeVisualController } from "./modules/app_coord_probe_visual.js?v=20260518-073500";
import { createAxisHelperController } from "./modules/app_axis_helper_controller.js?v=20260518-080500";
import { createAxisLineEditorStateAdapter } from "./modules/app_axis_line_editor_state.js?v=20260518-084500";
import { bindAxisLineEditorPointerEventsRaw } from "./modules/app_axis_line_editor_events.js?v=20260518-100500";
import { pickAxisLineFromPointerEventRaw } from "./modules/app_axis_line_editor_pick.js?v=20260518-102500";
import {
  setAxisLineEditorGeometryRaw,
  refreshAxisLineEditorFromRuntimeRaw
} from "./modules/app_axis_line_editor_runtime.js?v=20260518-104500";
import {
  setAxisLineEditorModeRaw,
  setAxisLineEditorLinePinnedRaw
} from "./modules/app_axis_line_editor_mode.js?v=20260518-110500";
import {
  notifyAxisLineEditorStateRaw,
  updateAxisLineEditorModeVisualsRaw
} from "./modules/app_axis_line_editor_ui.js?v=20260518-112500";
import {
  syncAxisLineEditorControlStateRaw,
  startAxisLineEditorRaw,
  stopAxisLineEditorRaw
} from "./modules/app_axis_line_editor_lifecycle.js?v=20260518-114500";
import { ensureAxisLineEditorGizmoRaw } from "./modules/app_axis_line_editor_gizmo.js?v=20260518-120500";
import {
  applyAxisLineEditorAxisWorldRaw,
  setAxisLineEditorPivotWorldRaw
} from "./modules/app_axis_line_editor_apply.js?v=20260518-120500";
import {
  getAxisLineEditorNdcFromEvent as getAxisLineEditorNdcFromEventRaw,
  collectAxisLineEditorPickMeshes as collectAxisLineEditorPickMeshesRaw,
  getAxisLineEditorWorldNormalFromHit as getAxisLineEditorWorldNormalFromHitRaw
} from "./modules/app_axis_line_editor_helpers.js?v=20260518-093500";
import { createPhysicalAxisController } from "./modules/app_physical_axis_controller.js?v=20260518-061500";
import { createDemoController } from "./modules/app_demo_controller.js?v=20260518-063500";
import { createDemoReadoutController } from "./modules/app_demo_readout_controller.js?v=20260518-071500";
import { bindServoPanelEvents } from "./modules/app_servo_panel_events.js?v=20260518-065500";
import { renderServoPanelLayout } from "./modules/app_servo_panel_layout.js?v=20260518-082500";
import { buildServoPanelFallback as buildServoPanelFallbackView } from "./modules/app_servo_panel_fallback.js?v=20260518-090500";
import {
  buildPanelHeader,
  buildPanelTools,
  buildViewTools,
  buildPresetTools,
  buildConfigTools,
  buildCoordTools,
  buildPhysicalTools,
  buildDemoPanelBlock
} from "./modules/app_servo_panel_blocks.js?v=20260518-045000";

if (typeof window !== "undefined") {
  window.__APP_MODULE_LOADED__ = true;
  window.__APP_MODULE_STAMP__ = "20260518-012900";
}

const wsUrlInput = document.getElementById("wsUrl");
const connectBtn = document.getElementById("connectBtn");
const pingBtn = document.getElementById("pingBtn");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const servoPanel = document.getElementById("servoPanel");
const viewerEl = document.getElementById("viewer");
const viewerStatusEl = document.getElementById("viewerStatus");
const togglePanelBtn = document.getElementById("togglePanelBtn");
const refreshPanelBtn = document.getElementById("refreshPanelBtn");
const workspaceEl = document.querySelector(".workspace");
const panelCardEl = document.querySelector(".panel-card");

let ws = null;
let pollTimer = null;
let pollCursor = 0;
let expectedQueryId = null;

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let stlLoader = null;
let displayRoot = null;
let robotRoot = null;
let groupsByTarget = null;
let meshGroupsByTarget = null;
let pivotsByTarget = null;
let selectedJointState = null;
let axisHelperGroup = null;
let axisHelperLine = null;
let axisHelperPivotMarker = null;
let axisLineEditorGroup = null;
let axisLineEditorLine = null;
let axisLineEditorHandle = null;
let axisLineEditorPivotMarker = null;
let axisLineEditorActive = false;
let axisLineEditorDragging = false;
let axisLineEditorDragKind = "";
let axisLineEditorTarget = "";
let axisLineEditorMode = "direction";
let axisLineEditorLinePinned = false;
let axisLineEditorBoundDom = null;
const axisLineEditorRaycaster = new THREE.Raycaster();
const axisLineEditorPointer = new THREE.Vector2();
const axisLineEditorPivotWorld = new THREE.Vector3();
const axisLineEditorAxisWorld = new THREE.Vector3(1, 0, 0);
const axisLineEditorLineAnchorWorld = new THREE.Vector3();
const axisLineEditorDragAxisWorld = new THREE.Vector3(1, 0, 0);
const axisLineEditorDragLinePointWorld = new THREE.Vector3();
const axisLineEditorDragPlane = new THREE.Plane();
let axisLineEditorLength = 150;
let axisLineEditorOnAxisUpdated = null;
let axisLineEditorOnStateChanged = null;
let coordProbeGroup = null;
let coordProbeLastWorldPoint = null;
let coordProbeReadoutUpdater = null;
let updateCoordReadoutRef = null;
let demoReadoutUpdater = null;
let demoOverlayGroup = null;
let demoTargetMarker = null;
let demoFkMarker = null;
let demoErrorLine = null;
let demoReachRing = null;

const jointStates = [];
const reachableServoIds = new Set();
const noPosMuteUntilById = new Map();
const lastVoltageById = new Map();
const lastTempById = new Map();
const lastActualIdByQueryId = new Map();
const meshMaterialByTarget = new Map();
const baseMaterialColorByTarget = new Map();
const baseMeshScaleByTarget = new Map();

let sliderAutoSendDelayMs = 100;
let positionPollIntervalMs = 350;
let globalRealtimeSendEnabled = true;
let loadedJointConfig = null;
let jointConfigFileHandle = null;
const coordProbeVisualController = createCoordProbeVisualController({
  THREE,
  getScene: () => scene,
  getCoordProbeGroup: () => coordProbeGroup,
  setCoordProbeGroup: (group) => { coordProbeGroup = group; },
  setCoordProbeLastWorldPoint: (point) => { coordProbeLastWorldPoint = point; }
});
const axisHelperController = createAxisHelperController({
  THREE,
  getScene: () => scene,
  getAxisHelperGroup: () => axisHelperGroup,
  setAxisHelperGroup: (group) => { axisHelperGroup = group; },
  setAxisHelperLine: (line) => { axisHelperLine = line; },
  setAxisHelperPivotMarker: (marker) => { axisHelperPivotMarker = marker; },
  getAxisHelperLine: () => axisHelperLine,
  getAxisHelperPivotMarker: () => axisHelperPivotMarker,
  getSelectedJointState: () => selectedJointState,
  getRobotRoot: () => robotRoot,
  getJointAxisWorld,
  getJointAxisDisplayLength
});
const axisLineEditorStateAdapter = createAxisLineEditorStateAdapter({
  getAxisLineEditorActive: () => axisLineEditorActive,
  getAxisLineEditorTarget: () => axisLineEditorTarget,
  getAxisLineEditorMode: () => axisLineEditorMode,
  getAxisLineEditorLinePinned: () => axisLineEditorLinePinned,
  getAxisLineEditorDragging: () => axisLineEditorDragging,
  setAxisLineEditorOnAxisUpdatedRaw: (handler) => { axisLineEditorOnAxisUpdated = handler; },
  setAxisLineEditorOnStateChangedRaw: (handler) => { axisLineEditorOnStateChanged = handler; }
});
let automaticPinConstraint = null;
let autoPinConstraintReady = false;
let demoArmModel = normalizeDemoArmModel(DEFAULT_DEMO_ARM_MODEL);
let demoFeaModel = normalizePseudoFeaModel(DEFAULT_PSEUDO_FEA_MODEL);
const DEMO_TREND_DEFAULT_WINDOW_MS = 6000;
const DEMO_TREND_WINDOW_OPTIONS = Object.freeze([3000, 6000, 10000]);
const DEMO_TREND_MAX_POINTS = 180;
const DEMO_TREND_SAMPLE_GAP_MS = 90;
const UI_BUILD_STAMP = "20260518-012900";
const demoTrendHistory = [];
let demoTrendLastSampleMs = 0;
let demoTrendWindowMs = DEMO_TREND_DEFAULT_WINDOW_MS;
const demoRuntime = {
  enabled: false,
  autoFea: true,
  payloadNewton: 8,
  elbow: "down",
  wristPitchDeg: 0,
  target: { x: 240, y: 170, z: 0 },
  lastFk: null,
  lastIk: null,
  lastFea: null
};
const assemblyLockRuntime = {
  enabled: false,
  disableCouplings: true,
  autoInferPivots: true,
  maxAutoShiftMm: 280,
  source: "",
  note: ""
};
const motionLocksRuntime = {
  axisByTarget: Object.create(null),
  parentAxisByTarget: Object.create(null)
};
let motionCommandController = null;
let pollingController = null;

const gatewayBridge = createGatewayBridge({
  getWs: () => ws,
  log: (message, obj) => log(message, obj)
});

const LOG_MAX_LINES = 420;
const LOG_LEVELS = Object.freeze({
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  SUCCESS: "SUCCESS",
  DEBUG: "DEBUG"
});
let logBuffer = [];
let logBufferInitialized = false;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLogTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function safeInlineText(value, maxLen = 72) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function summarizeLogValue(value) {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "number" || type === "boolean" || type === "bigint") return String(value);
  if (type === "string") return `"${safeInlineText(value, 64)}"`;
  if (Array.isArray(value)) return `[len:${value.length}]`;
  if (type === "object") return "{...}";
  return safeInlineText(value, 32);
}

function summarizeLogPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  const entries = Object.entries(payload);
  if (!entries.length) return "";
  const maxItems = 6;
  const shown = entries.slice(0, maxItems).map(([key, value]) => `${key}=${summarizeLogValue(value)}`);
  const remain = entries.length - shown.length;
  if (remain > 0) shown.push(`...+${remain}`);
  return ` | ${shown.join(" ")}`;
}

function inferLogLevel(message, payload) {
  const lower = String(message || "").toLowerCase();
  if (lower.startsWith("rx")) return LOG_LEVELS.DEBUG;
  if (lower.includes("error") || lower.includes("failed") || lower.includes("fatal")) return LOG_LEVELS.ERROR;
  if (lower.includes("warn") || lower.includes("skipped") || lower.includes("retry")) return LOG_LEVELS.WARN;
  if (lower.includes("ready") || lower.includes("connected") || lower.includes("loaded") || lower.includes("aligned")) return LOG_LEVELS.SUCCESS;
  if (payload && typeof payload === "object" && payload.error) return LOG_LEVELS.ERROR;
  return LOG_LEVELS.INFO;
}

function inferLogModule(message) {
  const lower = String(message || "").toLowerCase();
  if (lower.includes("websocket") || lower.startsWith("rx")) return "Gateway";
  if (lower.includes("viewer") || lower.includes("mesh") || lower.includes("frame")) return "Viewer";
  if (lower.includes("panel") || lower.includes("ui")) return "Panel";
  if (lower.includes("assembly") || lower.includes("pivot") || lower.includes("axis")) return "Model";
  if (lower.includes("boot") || lower.includes("init")) return "Boot";
  return "System";
}

function initLogBufferFromDom() {
  if (logBufferInitialized) return;
  logBufferInitialized = true;
  if (!logEl) return;
  const raw = String(logEl.textContent || "");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 0) {
    logBuffer = lines.slice(-LOG_MAX_LINES);
  }
}

function renderLogBuffer() {
  if (!logEl) return;
  logEl.textContent = logBuffer.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

function appendLogLine(line) {
  initLogBufferFromDom();
  logBuffer.push(line);
  if (logBuffer.length > LOG_MAX_LINES) {
    logBuffer = logBuffer.slice(logBuffer.length - LOG_MAX_LINES);
  }
  if (logEl) {
    renderLogBuffer();
  } else {
    console.log(line);
  }
}

function log(message, obj, meta) {
  const now = new Date();
  const safeMessage = sanitizePossibleMojibakeText(message);
  const payload = obj && typeof obj === "object" ? obj : null;
  const metaObj = meta && typeof meta === "object" ? meta : {};
  const level = String(metaObj.level || inferLogLevel(safeMessage, payload)).toUpperCase();
  const moduleName = sanitizePossibleMojibakeText(metaObj.module || inferLogModule(safeMessage));
  const summary = summarizeLogPayload(payload);
  const line = `[${formatLogTime(now)}] [${level}] [${moduleName}] ${safeMessage}${summary}`;
  appendLogLine(line);
}

function setViewerStatus(text) {
  if (viewerStatusEl) {
    viewerStatusEl.textContent = `Viewer: ${text}`;
  } else {
    console.log(`Viewer: ${text}`);
  }
}

function updateStatus(text) {
  if (statusEl) {
    statusEl.textContent = `Gateway: ${text}`;
  } else {
    console.log(`Gateway: ${text}`);
  }
}

function updatePanelToggleButtonLabel() {
  if (!togglePanelBtn || !panelCardEl) return;
  const visible = !panelCardEl.classList.contains("is-hidden");
  togglePanelBtn.textContent = visible ? "Hide Debug Panel" : "Show Debug Panel";
  togglePanelBtn.title = visible
    ? "Collapse right debug panel and keep 3D view"
    : "Expand right debug panel";
}

function setDebugPanelVisible(visible) {
  if (!panelCardEl) return;
  panelCardEl.classList.toggle("is-hidden", !visible);
  if (workspaceEl) {
    workspaceEl.classList.toggle("is-panel-hidden", !visible);
  }
  updatePanelToggleButtonLabel();
}

function normalizeAssemblyLockConfig(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: src.enabled === true,
    disableCouplings: src.disableCouplings !== false,
    autoInferPivots: src.autoInferPivots !== false,
    maxAutoShiftMm: clampNumber(src.maxAutoShiftMm, 5, 2000, 280),
    source: String(src.source || ""),
    note: String(src.note || "")
  };
}

function applyAssemblyLockFromConfig(config = null) {
  const cfg = config && typeof config === "object" ? config : {};
  const normalized = normalizeAssemblyLockConfig(cfg.assemblyLock);
  assemblyLockRuntime.enabled = normalized.enabled;
  assemblyLockRuntime.disableCouplings = normalized.disableCouplings;
  assemblyLockRuntime.autoInferPivots = normalized.autoInferPivots;
  assemblyLockRuntime.maxAutoShiftMm = normalized.maxAutoShiftMm;
  assemblyLockRuntime.source = normalized.source;
  assemblyLockRuntime.note = normalized.note;
}

function normalizeMotionLocksConfig(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const axisByTargetRaw = src.axisByTarget && typeof src.axisByTarget === "object"
    ? src.axisByTarget
    : {};
  const worldAxisCompatRaw = src.worldAxisByTarget && typeof src.worldAxisByTarget === "object"
    ? src.worldAxisByTarget
    : {};
  const parentAxisByTargetRaw = src.parentAxisByTarget && typeof src.parentAxisByTarget === "object"
    ? src.parentAxisByTarget
    : worldAxisCompatRaw;
  const axisByTarget = Object.create(null);
  const parentAxisByTarget = Object.create(null);
  Object.keys(axisByTargetRaw).forEach((target) => {
    const key = String(target || "").trim();
    if (!key) return;
    axisByTarget[key] = safeAxis(axisByTargetRaw[target]);
  });
  Object.keys(parentAxisByTargetRaw).forEach((target) => {
    const key = String(target || "").trim();
    if (!key) return;
    const rawAxis = parentAxisByTargetRaw[target];
    if (!Array.isArray(rawAxis) || rawAxis.length < 3) return;
    const x = toFiniteNumber(rawAxis[0], 0);
    const y = toFiniteNumber(rawAxis[1], 0);
    const z = toFiniteNumber(rawAxis[2], 0);
    const len = Math.hypot(x, y, z);
    if (len < 1e-6) return;
    parentAxisByTarget[key] = [x / len, y / len, z / len];
  });
  return { axisByTarget, parentAxisByTarget };
}

function applyMotionLocksFromConfig(config = null) {
  const cfg = config && typeof config === "object" ? config : {};
  const normalized = normalizeMotionLocksConfig(cfg.motionLocks);
  motionLocksRuntime.axisByTarget = normalized.axisByTarget;
  motionLocksRuntime.parentAxisByTarget = normalized.parentAxisByTarget;
}

function normalizeDemoTrendWindowMs(value, fallback = DEMO_TREND_DEFAULT_WINDOW_MS) {
  const ms = Math.round(Number(value));
  return DEMO_TREND_WINDOW_OPTIONS.includes(ms) ? ms : fallback;
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function resetDemoTrendHistory() {
  demoTrendHistory.length = 0;
  demoTrendLastSampleMs = 0;
}

function trimDemoTrendHistory(nowMs = getNowMs()) {
  const cutoff = nowMs - normalizeDemoTrendWindowMs(demoTrendWindowMs);
  while (demoTrendHistory.length > 0 && demoTrendHistory[0].tMs < cutoff) {
    demoTrendHistory.shift();
  }
  while (demoTrendHistory.length > DEMO_TREND_MAX_POINTS) {
    demoTrendHistory.shift();
  }
}

function pushDemoTrendSample(sample = {}) {
  const nowMs = getNowMs();
  const nextSample = {
    tMs: nowMs,
    errorMm: Math.max(0, toFiniteNumber(sample.errorMm, 0)),
    maxRatio: Number.isFinite(Number(sample.maxRatio)) ? Number(sample.maxRatio) : NaN,
    deformationMm: Number.isFinite(Number(sample.deformationMm)) ? Number(sample.deformationMm) : NaN
  };

  if (demoTrendHistory.length > 0 && (nowMs - demoTrendLastSampleMs) < DEMO_TREND_SAMPLE_GAP_MS) {
    demoTrendHistory[demoTrendHistory.length - 1] = nextSample;
  } else {
    demoTrendHistory.push(nextSample);
  }

  demoTrendLastSampleMs = nowMs;
  trimDemoTrendHistory(nowMs);
}

function drawDemoTrendChart(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = Math.max(220, Math.round(canvas.clientWidth || 300));
  const height = Math.max(96, Math.round(canvas.clientHeight || 120));
  const dpr = Math.max(1, Math.min(
    typeof window !== "undefined" && Number.isFinite(Number(window.devicePixelRatio))
      ? Number(window.devicePixelRatio)
      : 1,
    2
  ));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdff";
  ctx.fillRect(0, 0, width, height);

  const padLeft = 12;
  const padRight = 10;
  const padTop = 8;
  const padBottom = 18;
  const plotWidth = Math.max(10, width - padLeft - padRight);
  const plotHeight = Math.max(10, height - padTop - padBottom);
  const ratioTop = 1.15;
  const activeWindowMs = normalizeDemoTrendWindowMs(demoTrendWindowMs);
  const nowMs = getNowMs();
  const cutoff = nowMs - activeWindowMs;
  trimDemoTrendHistory(nowMs);
  const samples = demoTrendHistory.filter((item) => item.tMs >= cutoff);

  ctx.strokeStyle = "#e3eaf4";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
  }

  const xAt = (tMs) => {
    const ratio = clampNumber((tMs - cutoff) / activeWindowMs, 0, 1, 0);
    return padLeft + ratio * plotWidth;
  };
  const yAtNorm = (valueNorm) => {
    const ratio = clampNumber(valueNorm / ratioTop, 0, 1, 0);
    return padTop + (1 - ratio) * plotHeight;
  };

  const warnY = yAtNorm(1);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#f4c177";
  ctx.beginPath();
  ctx.moveTo(padLeft, warnY);
  ctx.lineTo(width - padRight, warnY);
  ctx.stroke();
  ctx.setLineDash([]);

  const drawSeries = (metricGetter, color, lineWidth = 1.8) => {
    let started = false;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      const metricValue = metricGetter(sample);
      if (!Number.isFinite(metricValue)) continue;
      const x = xAt(sample.tMs);
      const y = yAtNorm(metricValue);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (!started) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  drawSeries((sample) => sample.errorMm / 40, "#2f8fff", 2.1);
  drawSeries((sample) => sample.maxRatio, "#ff9a2d", 1.9);
  drawSeries((sample) => sample.deformationMm / 18, "#22b9a9", 1.9);

  ctx.fillStyle = "#60758b";
  ctx.font = '11px "IBM Plex Sans", "Noto Sans SC", sans-serif';
  ctx.fillText(`-${Math.round(activeWindowMs / 1000)}s`, padLeft, height - 4);
  ctx.fillText("now", Math.max(padLeft + 24, width - padRight - 22), height - 4);

  if (samples.length < 2) {
    ctx.fillStyle = "#8ca0b5";
    ctx.font = '12px "IBM Plex Sans", "Noto Sans SC", sans-serif';
    ctx.fillText("Waiting for samples...", padLeft + 4, padTop + 16);
  }
}

function ensureDemoOverlay() {
  if (demoOverlayGroup || !scene) return;

  demoOverlayGroup = new THREE.Group();
  demoOverlayGroup.visible = false;

  const targetMat = new THREE.MeshBasicMaterial({
    color: 0xff4fb0,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  demoTargetMarker = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 20), targetMat);
  demoTargetMarker.renderOrder = 1300;

  const fkMat = new THREE.MeshBasicMaterial({
    color: 0x23c2ff,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  demoFkMarker = new THREE.Mesh(new THREE.SphereGeometry(3.8, 16, 16), fkMat);
  demoFkMarker.renderOrder = 1301;

  const errGeo = new THREE.BufferGeometry();
  errGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const errMat = new THREE.LineBasicMaterial({
    color: 0x3ac36d,
    transparent: true,
    opacity: 0.96,
    depthTest: false
  });
  demoErrorLine = new THREE.Line(errGeo, errMat);
  demoErrorLine.renderOrder = 1299;

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x3ac36d,
    transparent: true,
    opacity: 0.5,
    depthTest: false
  });
  demoReachRing = new THREE.Mesh(new THREE.TorusGeometry(11, 0.85, 10, 48), ringMat);
  demoReachRing.rotation.x = Math.PI / 2;
  demoReachRing.renderOrder = 1298;

  demoOverlayGroup.add(demoReachRing);
  demoOverlayGroup.add(demoErrorLine);
  demoOverlayGroup.add(demoTargetMarker);
  demoOverlayGroup.add(demoFkMarker);
  scene.add(demoOverlayGroup);
}

function updateDemoOverlay(options = {}) {
  const forceVisible = options?.forceVisible === true;
  const fkInput = options?.fk;
  const ikPreviewInput = options?.ikPreview;
  if (!scene) return;
  ensureDemoOverlay();
  if (!demoOverlayGroup || !demoTargetMarker || !demoFkMarker || !demoErrorLine || !demoReachRing) return;

  const shouldShow = forceVisible || demoRuntime.enabled === true;
  if (!shouldShow || !robotRoot) {
    demoOverlayGroup.visible = false;
    return;
  }

  const targetLocal = new THREE.Vector3(
    toFiniteNumber(demoRuntime.target?.x, 0),
    toFiniteNumber(demoRuntime.target?.y, 0),
    toFiniteNumber(demoRuntime.target?.z, 0)
  );
  const targetWorld = robotLocalToWorld(targetLocal);

  const fk = fkInput && fkInput.tcp ? fkInput : runDemoForwardFromCurrentPose();
  const fkWorld = fk?.tcp
    ? robotLocalToWorld(new THREE.Vector3(fk.tcp.x, fk.tcp.y, fk.tcp.z))
    : targetWorld.clone();

  demoTargetMarker.position.copy(targetWorld);
  demoFkMarker.position.copy(fkWorld);
  demoReachRing.position.copy(targetWorld);

  const posAttr = demoErrorLine.geometry.getAttribute("position");
  posAttr.setXYZ(0, targetWorld.x, targetWorld.y, targetWorld.z);
  posAttr.setXYZ(1, fkWorld.x, fkWorld.y, fkWorld.z);
  posAttr.needsUpdate = true;
  demoErrorLine.geometry.computeBoundingSphere();

  const errMm = targetWorld.distanceTo(fkWorld);
  const errRatio = clampNumber(errMm / 20, 0, 1, 0);
  const okColor = new THREE.Color(0x37c978);
  const warnColor = new THREE.Color(0xffb020);
  const badColor = new THREE.Color(0xff3b30);
  const lineColor = errRatio < 0.55
    ? okColor.clone().lerp(warnColor, errRatio / 0.55)
    : warnColor.clone().lerp(badColor, (errRatio - 0.55) / 0.45);
  demoErrorLine.material.color.copy(lineColor);

  const ikPreview = ikPreviewInput || runDemoInverseKinematics(demoArmModel, demoRuntime.target, {
    elbow: demoRuntime.elbow,
    wristPitchDeg: demoRuntime.wristPitchDeg
  });
  const reachable = ikPreview ? ikPreview.reachable !== false : true;
  demoReachRing.material.color.set(reachable ? 0x2ecf76 : 0xff4a45);
  const ringScale = reachable ? 1 : 1.22;
  demoReachRing.scale.set(ringScale, ringScale, ringScale);

  demoOverlayGroup.visible = true;
}

function triggerDemoReadoutUpdate() {
  if (typeof demoReadoutUpdater === "function") {
    demoReadoutUpdater();
    return;
  }
  updateDemoOverlay();
}

function setDemoRuntimeDefaultsFromConfig(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const demoKinRaw = cfg.demoKinematics && typeof cfg.demoKinematics === "object"
    ? cfg.demoKinematics
    : {};
  const physicalRaw = cfg.physicalKinematics && typeof cfg.physicalKinematics === "object"
    ? cfg.physicalKinematics
    : {};
  const physicalJ2 = toFiniteNumber(physicalRaw?.joints?.j2?.activeLinkLength, 0);
  const physicalJ3 = toFiniteNumber(physicalRaw?.joints?.j3?.activeLinkLength, 0);

  const mergedDemoKin = {
    ...demoKinRaw
  };
  if (!Number.isFinite(Number(mergedDemoKin.link2)) || Number(mergedDemoKin.link2) <= 0) {
    if (physicalJ2 > 0) mergedDemoKin.link2 = physicalJ2;
  }
  if (!Number.isFinite(Number(mergedDemoKin.link3)) || Number(mergedDemoKin.link3) <= 0) {
    if (physicalJ3 > 0) mergedDemoKin.link3 = physicalJ3;
  }

  demoArmModel = normalizeDemoArmModel({
    ...DEFAULT_DEMO_ARM_MODEL,
    ...mergedDemoKin
  });

  const demoFeaRaw = cfg.demoFea && typeof cfg.demoFea === "object"
    ? cfg.demoFea
    : {};
  const mergedDemoFea = {
    ...DEFAULT_PSEUDO_FEA_MODEL,
    ...demoFeaRaw,
    sections: {
      ...DEFAULT_PSEUDO_FEA_MODEL.sections,
      ...(demoFeaRaw.sections && typeof demoFeaRaw.sections === "object" ? demoFeaRaw.sections : {}),
      j2: {
        ...DEFAULT_PSEUDO_FEA_MODEL.sections.j2,
        ...(demoFeaRaw.sections?.j2 || {}),
        leverMm: toFiniteNumber(demoFeaRaw.sections?.j2?.leverMm, demoArmModel.link2)
      },
      j3: {
        ...DEFAULT_PSEUDO_FEA_MODEL.sections.j3,
        ...(demoFeaRaw.sections?.j3 || {}),
        leverMm: toFiniteNumber(demoFeaRaw.sections?.j3?.leverMm, demoArmModel.link3)
      }
    }
  };
  demoFeaModel = normalizePseudoFeaModel(mergedDemoFea);

  const runtimeRaw = cfg.demoRuntime && typeof cfg.demoRuntime === "object"
    ? cfg.demoRuntime
    : {};
  demoRuntime.enabled = runtimeRaw.enabled === true;
  demoRuntime.autoFea = runtimeRaw.autoFea !== false;
  demoRuntime.payloadNewton = clampNumber(
    runtimeRaw.payloadNewton,
    0,
    1000,
    demoRuntime.payloadNewton
  );
  demoRuntime.elbow = String(runtimeRaw.elbow || demoRuntime.elbow).trim().toLowerCase() === "up" ? "up" : "down";
  demoRuntime.wristPitchDeg = clampNumber(runtimeRaw.wristPitchDeg, -180, 180, demoRuntime.wristPitchDeg);
  const targetRaw = runtimeRaw.target && typeof runtimeRaw.target === "object"
    ? runtimeRaw.target
    : {};
  demoRuntime.target = {
    x: clampNumber(targetRaw.x, -2000, 2000, demoRuntime.target.x),
    y: clampNumber(targetRaw.y, -2000, 2000, demoRuntime.target.y),
    z: clampNumber(targetRaw.z, -2000, 2000, demoRuntime.target.z)
  };
}

function syncDemoRuntimeIntoLoadedConfig() {
  if (!loadedJointConfig || typeof loadedJointConfig !== "object") return;
  loadedJointConfig.demoKinematics = { ...demoArmModel };
  loadedJointConfig.demoFea = {
    ...demoFeaModel,
    sections: {
      ...demoFeaModel.sections,
      j2: { ...demoFeaModel.sections.j2 },
      j3: { ...demoFeaModel.sections.j3 },
      j4: { ...demoFeaModel.sections.j4 }
    }
  };
  loadedJointConfig.demoRuntime = {
    enabled: demoRuntime.enabled,
    autoFea: demoRuntime.autoFea,
    payloadNewton: demoRuntime.payloadNewton,
    elbow: demoRuntime.elbow,
    wristPitchDeg: demoRuntime.wristPitchDeg,
    target: {
      x: demoRuntime.target.x,
      y: demoRuntime.target.y,
      z: demoRuntime.target.z
    }
  };
}

function getCurrentDemoJointDeg() {
  const result = { j1: 0, j2: 0, j3: 0, j4: 0 };
  const map = [
    ["j1", "j1"],
    ["j2", "j2"],
    ["j3", "j3"],
    ["j4", "j4"]
  ];

  map.forEach(([jointKey, target]) => {
    const state = findJointStateByTarget(target);
    if (!state) return;
    result[jointKey] = posToDeg(state, state.currentPos);
  });

  return result;
}

function clearDemoFeaVisualization() {
  for (const [target, material] of meshMaterialByTarget.entries()) {
    const base = baseMaterialColorByTarget.get(target);
    if (material && base) {
      material.color.copy(base);
      if (material.emissive) {
        material.emissive.setRGB(0, 0, 0);
      }
    }
  }

  for (const [target, meshGroup] of Object.entries(meshGroupsByTarget || {})) {
    if (!meshGroup) continue;
    const baseScale = baseMeshScaleByTarget.get(target);
    if (baseScale) {
      meshGroup.scale.copy(baseScale);
    } else {
      meshGroup.scale.set(1, 1, 1);
    }
  }
}

function applyDemoFeaVisualization(feaResult) {
  if (!feaResult || !feaResult.byTarget) {
    clearDemoFeaVisualization();
    return;
  }

  const hotColor = new THREE.Color(0xff3b30);
  const warmColor = new THREE.Color(0xffa136);

  Object.entries(feaResult.byTarget).forEach(([target, node]) => {
    const material = meshMaterialByTarget.get(target);
    const base = baseMaterialColorByTarget.get(target);
    if (material && base) {
      const heat = clampNumber(node?.heatRatio, 0, 1, 0);
      const blend = base.clone().lerp(warmColor, heat * 0.72).lerp(hotColor, heat * 0.28);
      material.color.copy(blend);
      if (material.emissive) {
        material.emissive.copy(hotColor.clone().multiplyScalar(heat * 0.2));
      }
    }

    const meshGroup = meshGroupsByTarget?.[target];
    if (meshGroup) {
      const baseScale = baseMeshScaleByTarget.get(target) || new THREE.Vector3(1, 1, 1);
      const deform = clampNumber(node?.deformationMm, 0, 40, 0);
      const gain = deform / 240;
      meshGroup.scale.set(
        baseScale.x * (1 + gain * 0.45),
        baseScale.y * (1 - gain * 0.25),
        baseScale.z * (1 + gain * 0.2)
      );
    }
  });
}

function runDemoForwardFromCurrentPose() {
  const joints = getCurrentDemoJointDeg();
  const fk = runDemoForwardKinematics(demoArmModel, joints);
  demoRuntime.lastFk = fk;
  return fk;
}

function runDemoFeaFromCurrentPose(payloadNewton = demoRuntime.payloadNewton) {
  const joints = getCurrentDemoJointDeg();
  const fea = evaluatePseudoFea(demoFeaModel, {
    jointDeg: joints,
    payloadNewton
  });
  demoRuntime.lastFea = fea;
  applyDemoFeaVisualization(fea);
  return fea;
}

function applyDemoJointAnglesDeg(nextJointDeg = {}, options = {}) {
  const j4State = findJointStateByTarget("j4");
  if (j4State && Object.prototype.hasOwnProperty.call(nextJointDeg, "j4")) {
    const q4Eff = Number(nextJointDeg.j4);
    if (Number.isFinite(q4Eff)) {
      const j2State = findJointStateByTarget("j2");
      const j3State = findJointStateByTarget("j3");
      if (j2State && j3State) {
        const q2 = posToDeg(j2State, j2State.currentPos);
        const q3 = posToDeg(j3State, j3State.currentPos);
        j4State.derivedOffsetDeg = q4Eff + q2 + q3;
      }
    }
  }

  const map = [
    ["j1", "j1"],
    ["j2", "j2"],
    ["j3", "j3"],
    ["j4", "j4"]
  ];

  map.forEach(([jointKey, target]) => {
    const deg = Number(nextJointDeg[jointKey]);
    if (!Number.isFinite(deg)) return;
    const state = findJointStateByTarget(target);
    if (!state) return;
    const pos = clampByGuard(state, degToPos(state, deg));
    applyJointVisual(state, pos, {
      lockClosureForSelf: true,
      skipCouplings: true,
      suppressHooks: true
    });
  });

  if (selectedJointState) {
    updateAxisHelperFromSelectedJoint();
  }

  if (demoRuntime.enabled && demoRuntime.autoFea && options.runFea !== false) {
    runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
  }
  triggerDemoReadoutUpdate();
}

function runDemoInverseAndApply(target, options = {}) {
  const ik = runDemoInverseKinematics(demoArmModel, target, {
    elbow: options.elbow || demoRuntime.elbow,
    wristPitchDeg: options.wristPitchDeg ?? demoRuntime.wristPitchDeg
  });
  demoRuntime.lastIk = ik;
  if (ik?.jointDeg) {
    applyDemoJointAnglesDeg(ik.jointDeg, { runFea: true });
  } else {
    triggerDemoReadoutUpdate();
  }
  return ik;
}

function getLockedAxisForTarget(target) {
  const key = String(target || "").trim();
  if (!key) return null;
  const axis = motionLocksRuntime.axisByTarget?.[key];
  return axis ? safeAxis(axis) : null;
}

function getLockedParentAxisForTarget(target) {
  const key = String(target || "").trim();
  if (!key) return null;
  const axis = motionLocksRuntime.parentAxisByTarget?.[key];
  if (!Array.isArray(axis) || axis.length < 3) return null;
  const v = new THREE.Vector3(
    toFiniteNumber(axis[0], 0),
    toFiniteNumber(axis[1], 0),
    toFiniteNumber(axis[2], 0)
  );
  const len = v.length();
  if (len < 1e-6) return null;
  return v.multiplyScalar(1 / len);
}

function ensureMotionLocksConfig(config) {
  if (!config || typeof config !== "object") return null;
  if (!config.motionLocks || typeof config.motionLocks !== "object") {
    config.motionLocks = {};
  }
  const locks = config.motionLocks;
  if (!locks.axisByTarget || typeof locks.axisByTarget !== "object") {
    locks.axisByTarget = {};
  }
  if (!locks.parentAxisByTarget || typeof locks.parentAxisByTarget !== "object") {
    locks.parentAxisByTarget = {};
  }
  if (locks.worldAxisByTarget !== undefined) {
    delete locks.worldAxisByTarget;
  }
  return locks;
}

function getParentAxisVectorForTarget(target) {
  const key = String(target || "").trim();
  if (!key) return [1, 0, 0];
  const fromLock = motionLocksRuntime.parentAxisByTarget?.[key];
  if (Array.isArray(fromLock) && fromLock.length >= 3) {
    return normalizeAxisVectorArray(fromLock, [1, 0, 0]);
  }
  const state = findJointStateByTarget(key);
  const axis = state ? safeAxis(state.axis) : "x";
  return normalizeAxisVectorArray(axisVectorFromAxisName(axis), [1, 0, 0]);
}

function setParentAxisVectorForTarget(target, axisVector, options = {}) {
  const key = String(target || "").trim();
  if (!key) return null;
  const fallback = getParentAxisVectorForTarget(key);
  const normalized = normalizeAxisVectorArray(axisVector, fallback);
  const axisName = axisNameFromVector(new THREE.Vector3(normalized[0], normalized[1], normalized[2]));

  if (!motionLocksRuntime.parentAxisByTarget || typeof motionLocksRuntime.parentAxisByTarget !== "object") {
    motionLocksRuntime.parentAxisByTarget = Object.create(null);
  }
  if (!motionLocksRuntime.axisByTarget || typeof motionLocksRuntime.axisByTarget !== "object") {
    motionLocksRuntime.axisByTarget = Object.create(null);
  }
  motionLocksRuntime.parentAxisByTarget[key] = [normalized[0], normalized[1], normalized[2]];
  motionLocksRuntime.axisByTarget[key] = axisName;

  if (options.updateConfig !== false) {
    if (!loadedJointConfig || typeof loadedJointConfig !== "object") {
      loadedJointConfig = cloneConfig(FALLBACK_CONFIG);
    }
    const locks = ensureMotionLocksConfig(loadedJointConfig);
    if (locks) {
      locks.axisByTarget[key] = axisName;
      locks.parentAxisByTarget[key] = [normalized[0], normalized[1], normalized[2]];
    }
    applyMotionLocksFromConfig(loadedJointConfig);
  }

  const state = findJointStateByTarget(key);
  if (state && options.applyVisual !== false) {
    enforceMotionAxisLockOnState(state);
    applyJointVisual(state, state.currentPos, { lockClosureForSelf: true });
  }
  updateAxisHelperFromSelectedJoint();
  return [normalized[0], normalized[1], normalized[2]];
}

function getEffectiveJointAxis(state) {
  const lockedAxis = getLockedAxisForTarget(state?.target);
  if (lockedAxis) return lockedAxis;
  return safeAxis(state?.axis || "z");
}

function getEffectiveJointAxisDisplayName(state) {
  const lockedParentAxis = getLockedParentAxisForTarget(state?.target);
  if (lockedParentAxis) {
    return axisNameFromVector(lockedParentAxis);
  }
  return getEffectiveJointAxis(state);
}

function enforceMotionAxisLockOnState(state, { syncUi = true } = {}) {
  if (!state) return;
  const lockedAxis = getLockedAxisForTarget(state.target);
  const lockedParentAxis = getLockedParentAxisForTarget(state.target);
  if (lockedAxis) {
    state.axis = lockedAxis;
  }

  if (!syncUi || !state.axisInput) return;
  if (lockedParentAxis) {
    const axisName = lockedAxis || axisNameFromVector(lockedParentAxis);
    state.axisInput.value = axisName;
    state.axisInput.disabled = true;
    state.axisInput.title = `Axis is locked by motionLocks.parentAxisByTarget: [${lockedParentAxis.x.toFixed(3)}, ${lockedParentAxis.y.toFixed(3)}, ${lockedParentAxis.z.toFixed(3)}]`;
  } else if (lockedAxis) {
    state.axisInput.value = lockedAxis;
    state.axisInput.disabled = true;
    state.axisInput.title = "Axis is locked by motionLocks.axisByTarget";
  } else {
    state.axisInput.disabled = false;
    state.axisInput.title = "";
    state.axisInput.value = getEffectiveJointAxisDisplayName(state);
  }
}

function getAxisUnitVector(axis) {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function getJointAxisWorld(state) {
  if (!state?.pivotGroup) return null;
  const lockedParentAxis = getLockedParentAxisForTarget(state?.target);
  if (lockedParentAxis) {
    const axisWorld = lockedParentAxis.clone();
    if (state.pivotGroup.parent) {
      state.pivotGroup.parent.updateWorldMatrix(true, false);
      const parentQuat = new THREE.Quaternion();
      state.pivotGroup.parent.getWorldQuaternion(parentQuat);
      axisWorld.applyQuaternion(parentQuat).normalize();
    }
    return axisWorld;
  }
  const axisLocal = getAxisUnitVector(getEffectiveJointAxis(state));
  const q = new THREE.Quaternion();
  state.pivotGroup.getWorldQuaternion(q);
  return axisLocal.applyQuaternion(q).normalize();
}

function getJointAxisDisplayLength(state) {
  const box = new THREE.Box3().setFromObject(state?.meshGroup || state?.targetGroup);
  if (box.isEmpty()) return 140;
  const diag = box.getSize(new THREE.Vector3()).length();
  return clampNumber(diag * 0.52, 100, 420, 160);
}

function robotLocalToWorld(vec) {
  const p = vec ? vec.clone() : new THREE.Vector3(0, 0, 0);
  if (!robotRoot) return p;
  robotRoot.updateWorldMatrix(true, false);
  return robotRoot.localToWorld(p);
}

function worldToRobotLocal(vec) {
  const p = vec ? vec.clone() : new THREE.Vector3(0, 0, 0);
  if (!robotRoot) return p;
  robotRoot.updateWorldMatrix(true, false);
  return robotRoot.worldToLocal(p);
}

function isPhysicalKinematicsEnabled(config = loadedJointConfig) {
  return config?.physicalKinematics?.enabled === true;
}

function getJointPivotWorldFromState(state) {
  if (!state) return new THREE.Vector3(0, 0, 0);
  const pivot = toVec3(normalizePivotArray(state.pivot, [0, 0, 0]));
  const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");
  return pivotSpace === "local" ? robotLocalToWorld(pivot) : pivot;
}

function convertWorldPointToPhysicalSpace(worldPoint, physicalSpace = "robot_local") {
  const safeWorld = worldPoint ? worldPoint.clone() : new THREE.Vector3(0, 0, 0);
  return normalizePhysicalPointSpace(physicalSpace, "robot_local") === "world"
    ? safeWorld
    : worldToRobotLocal(safeWorld);
}

function ensurePhysicalKinematicsConfig(config) {
  if (!config || typeof config !== "object") return null;
  if (!config.physicalKinematics || typeof config.physicalKinematics !== "object") {
    config.physicalKinematics = {};
  }
  const physical = config.physicalKinematics;
  if (!physical.type) physical.type = "four_bar_dual_hole";
  physical.space = normalizePhysicalPointSpace(physical.space, "robot_local");
  physical.planeAxis = safeAxis(physical.planeAxis || "z");
  if (!physical.driverTarget) physical.driverTarget = "j2";
  if (!physical.branch) physical.branch = "closest";
  if (!physical.joints || typeof physical.joints !== "object") {
    physical.joints = {};
  }
  if (!physical.endEffector || typeof physical.endEffector !== "object") {
    physical.endEffector = {};
  }
  if (!Array.isArray(physical.endEffector.yellowHoleLocal)) {
    physical.endEffector.yellowHoleLocal = [0, 0, 0];
  }
  if (!Array.isArray(physical.endEffector.greenHoleLocal)) {
    physical.endEffector.greenHoleLocal = [0, 0, 0];
  }
  return physical;
}

function ensurePhysicalJointConfigEntry(physical, key) {
  if (!physical || typeof physical !== "object") return null;
  if (!physical.joints || typeof physical.joints !== "object") {
    physical.joints = {};
  }
  if (!physical.joints[key] || typeof physical.joints[key] !== "object") {
    physical.joints[key] = {};
  }
  const entry = physical.joints[key];
  if (!entry.target) entry.target = key;
  if (!Array.isArray(entry.pivot)) entry.pivot = [0, 0, 0];
  if (key === "j2" || key === "j3") {
    entry.activeLinkLength = Math.max(0, toFiniteNumber(entry.activeLinkLength, 0));
  }
  entry.angleOffsetDeg = toFiniteNumber(entry.angleOffsetDeg, 0);
  return entry;
}

function findPhysicalJointConfigEntryByTarget(physical, target) {
  if (!physical || typeof physical !== "object") return null;
  if (!physical.joints || typeof physical.joints !== "object") return null;
  const targetText = String(target || "");
  if (!targetText) return null;

  for (const key of Object.keys(physical.joints)) {
    const entry = physical.joints[key];
    const entryTarget = String(entry?.target || key || "");
    if (entryTarget === targetText || String(key) === targetText) {
      return { key, entry };
    }
  }

  return null;
}

function syncPhysicalKinematicsRuntimeData(config, targetStates = null) {
  if (!config || typeof config !== "object") return;

  const runtimePhysical = loadedJointConfig?.physicalKinematics;
  if (runtimePhysical && typeof runtimePhysical === "object") {
    config.physicalKinematics = cloneConfig({ physicalKinematics: runtimePhysical }).physicalKinematics;
  }

  if (!config.physicalKinematics || typeof config.physicalKinematics !== "object") return;
  const physical = ensurePhysicalKinematicsConfig(config);
  if (!physical) return;

  ensurePhysicalJointConfigEntry(physical, "j2");
  ensurePhysicalJointConfigEntry(physical, "j3");
  ensurePhysicalJointConfigEntry(physical, "j4");

  const states = Array.isArray(targetStates) ? targetStates : [];
  const pointSpace = normalizePhysicalPointSpace(physical.space, "robot_local");

  states.forEach((state) => {
    const target = String(state?.target || "");
    if (!target) return;
    const hit = findPhysicalJointConfigEntryByTarget(physical, target);
    if (!hit || !hit.entry) return;

    const pivotWorld = getJointPivotWorldFromState(state);
    const pivotConfig = convertWorldPointToPhysicalSpace(pivotWorld, pointSpace);
    hit.entry.pivot = [pivotConfig.x, pivotConfig.y, pivotConfig.z];
  });
}

function syncMotionLocksRuntimeData(config) {
  if (!config || typeof config !== "object") return;
  const locks = ensureMotionLocksConfig(config);
  if (!locks) return;

  locks.axisByTarget = {};
  const axisByTarget = motionLocksRuntime.axisByTarget && typeof motionLocksRuntime.axisByTarget === "object"
    ? motionLocksRuntime.axisByTarget
    : {};
  Object.keys(axisByTarget).forEach((target) => {
    const key = String(target || "").trim();
    if (!key) return;
    locks.axisByTarget[key] = safeAxis(axisByTarget[key]);
  });

  locks.parentAxisByTarget = {};
  const parentAxisByTarget = motionLocksRuntime.parentAxisByTarget && typeof motionLocksRuntime.parentAxisByTarget === "object"
    ? motionLocksRuntime.parentAxisByTarget
    : {};
  Object.keys(parentAxisByTarget).forEach((target) => {
    const key = String(target || "").trim();
    if (!key) return;
    locks.parentAxisByTarget[key] = normalizeAxisVectorArray(parentAxisByTarget[key], [1, 0, 0]);
  });
}

function toRobotLocalFromConfigPoint(pointArray, space = "robot_local") {
  const arr = parseOptionalVec3(pointArray);
  if (!arr) return null;
  const base = new THREE.Vector3(arr[0], arr[1], arr[2]);
  const normalizedSpace = String(space || "robot_local").trim().toLowerCase();
  if (normalizedSpace === "robot_local" || normalizedSpace === "local") {
    return base;
  }
  if (normalizedSpace === "world") {
    return worldToRobotLocal(base);
  }
  return base;
}

function buildAutomaticPinConstraint() {
  const cfg = loadedJointConfig || FALLBACK_CONFIG;
  const raw = cfg?.physicalKinematics;
  if (!raw || raw.enabled !== true) return null;

  const type = String(raw.type || "").trim().toLowerCase();
  if (type && type !== "four_bar_dual_hole") {
    log("physicalKinematics type not supported", { type: raw.type });
    return null;
  }

  const pointSpace = String(raw.space || "robot_local").trim().toLowerCase();
  const planeAxis = safeAxis(raw.planeAxis || "z");
  const branch = String(raw.branch || "closest").trim().toLowerCase();

  const j2Raw = raw?.joints?.j2 || {};
  const j3Raw = raw?.joints?.j3 || {};
  const j4Raw = raw?.joints?.j4 || {};
  const endRaw = raw?.endEffector || {};

  const j2Target = String(j2Raw.target || "j2");
  const j3Target = String(j3Raw.target || "j3");
  const j4Target = String(j4Raw.target || "j4");

  const j2PivotLocal = toRobotLocalFromConfigPoint(j2Raw.pivot, pointSpace);
  const j3PivotLocal = toRobotLocalFromConfigPoint(j3Raw.pivot, pointSpace);
  const j4PivotLocal = toRobotLocalFromConfigPoint(j4Raw.pivot, pointSpace);
  const yellowHoleLocal = parseOptionalVec3(endRaw.yellowHoleLocal);
  const greenHoleLocal = parseOptionalVec3(endRaw.greenHoleLocal);

  const link2 = Math.abs(toFiniteNumber(j2Raw.activeLinkLength, 0));
  const link3 = Math.abs(toFiniteNumber(j3Raw.activeLinkLength, 0));
  if (!j2PivotLocal || !j3PivotLocal || !yellowHoleLocal || !greenHoleLocal || link2 <= 0 || link3 <= 0) {
    log("physicalKinematics incomplete. Missing CAD dimensions or hole coordinates.");
    return null;
  }

  const yellowLocal2 = projectVec3ToPlane2(new THREE.Vector3(...yellowHoleLocal), planeAxis);
  const greenLocal2 = projectVec3ToPlane2(new THREE.Vector3(...greenHoleLocal), planeAxis);
  const localHoleVec = greenLocal2.clone().sub(yellowLocal2);
  const holeDistance = localHoleVec.length();
  if (holeDistance <= 1e-6) {
    log("physicalKinematics invalid: endEffector hole distance is zero.");
    return null;
  }

  return {
    mode: "physical_four_bar",
    branch,
    planeAxis,
    driverTarget: String(raw.driverTarget || j2Target),
    dependentTargets: [j3Target, j4Target],
    joints: {
      j2: {
        target: j2Target,
        pivotLocal: j2PivotLocal.clone(),
        pivot2: projectVec3ToPlane2(j2PivotLocal, planeAxis),
        activeLinkLength: link2,
        angleOffsetDeg: toFiniteNumber(j2Raw.angleOffsetDeg, 0)
      },
      j3: {
        target: j3Target,
        pivotLocal: j3PivotLocal.clone(),
        pivot2: projectVec3ToPlane2(j3PivotLocal, planeAxis),
        activeLinkLength: link3,
        angleOffsetDeg: toFiniteNumber(j3Raw.angleOffsetDeg, 0)
      },
      j4: {
        target: j4Target,
        pivotLocal: j4PivotLocal ? j4PivotLocal.clone() : null,
        angleOffsetDeg: toFiniteNumber(j4Raw.angleOffsetDeg, 0)
      }
    },
    endEffector: {
      yellowHoleLocal: new THREE.Vector3(...yellowHoleLocal),
      greenHoleLocal: new THREE.Vector3(...greenHoleLocal),
      localHoleAngleDeg: THREE.MathUtils.radToDeg(Math.atan2(localHoleVec.y, localHoleVec.x)),
      holeDistance
    }
  };
}

function applyConstraintPivotsToStates(constraint) {
  if (!constraint || constraint.mode !== "physical_four_bar") return;

  const j2State = findJointStateByTarget(constraint.joints.j2.target);
  const j3State = findJointStateByTarget(constraint.joints.j3.target);
  const j4State = findJointStateByTarget(constraint.joints.j4.target);

  if (j2State) {
    j2State.pivotSpace = "local";
    applyJointPivot(j2State, [
      constraint.joints.j2.pivotLocal.x,
      constraint.joints.j2.pivotLocal.y,
      constraint.joints.j2.pivotLocal.z
    ]);
  }

  if (j3State) {
    j3State.pivotSpace = "local";
    applyJointPivot(j3State, [
      constraint.joints.j3.pivotLocal.x,
      constraint.joints.j3.pivotLocal.y,
      constraint.joints.j3.pivotLocal.z
    ]);
  }

  if (j4State && constraint.joints.j4.pivotLocal) {
    j4State.pivotSpace = "local";
    applyJointPivot(j4State, [
      constraint.joints.j4.pivotLocal.x,
      constraint.joints.j4.pivotLocal.y,
      constraint.joints.j4.pivotLocal.z
    ]);
  }
}

function intersectCircles2D(centerA, radiusA, centerB, radiusB) {
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d <= 1e-9) return [];
  if (d > (radiusA + radiusB) || d < Math.abs(radiusA - radiusB)) return [];

  const a = ((radiusA * radiusA) - (radiusB * radiusB) + (d * d)) / (2 * d);
  const h2 = (radiusA * radiusA) - (a * a);
  if (!Number.isFinite(h2) || h2 < -1e-6) return [];
  const h = Math.sqrt(Math.max(0, h2));

  const px = centerA.x + (a * dx) / d;
  const py = centerA.y + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;

  const p1 = new THREE.Vector2(px + rx, py + ry);
  const p2 = new THREE.Vector2(px - rx, py - ry);
  if (p1.distanceToSquared(p2) <= 1e-9) {
    return [p1];
  }
  return [p1, p2];
}

function pickFourBarIntersection(candidatePoints, sourcePoint, pivot3, branchMode, currentJ3Deg, offsetDeg) {
  if (!Array.isArray(candidatePoints) || candidatePoints.length === 0) return null;
  if (candidatePoints.length === 1) return candidatePoints[0];

  if (branchMode === "positive" || branchMode === "negative") {
    const base = pivot3.clone().sub(sourcePoint);
    let selected = candidatePoints[0];
    let selectedSignValue = 0;
    for (const point of candidatePoints) {
      const v = point.clone().sub(pivot3);
      const cross = base.x * v.y - base.y * v.x;
      if ((branchMode === "positive" && cross >= selectedSignValue) ||
          (branchMode === "negative" && cross <= selectedSignValue)) {
        selected = point;
        selectedSignValue = cross;
      }
    }
    return selected;
  }

  // closest: pick the branch that is closest to current J3 angle.
  let best = candidatePoints[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const point of candidatePoints) {
    const angleDeg = THREE.MathUtils.radToDeg(
      Math.atan2(point.y - pivot3.y, point.x - pivot3.x)
    ) - offsetDeg;
    const diff = absAngleDiffDeg(angleDeg, currentJ3Deg);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = point;
    }
  }
  return best;
}

function solveDrivenJointByPinConstraint(constraint, { lockedTargets = null, sourceState = null } = {}) {
  if (!constraint || constraint.mode !== "physical_four_bar") return null;

  const j2State = findJointStateByTarget(constraint.joints.j2.target);
  const j3State = findJointStateByTarget(constraint.joints.j3.target);
  const j4State = findJointStateByTarget(constraint.joints.j4.target);
  if (!j2State || !j3State || !j4State) return null;

  const sourceTarget = String(sourceState?.target || "");
  const lockJ3 = sourceTarget === j3State.target || (lockedTargets && lockedTargets.has(j3State.target));
  const lockJ4 = sourceTarget === j4State.target || (lockedTargets && lockedTargets.has(j4State.target));
  if (lockJ3 || lockJ4) return null;

  const theta2Deg = posToDeg(j2State, j2State.currentPos) + constraint.joints.j2.angleOffsetDeg;
  const theta2Rad = THREE.MathUtils.degToRad(theta2Deg);
  const sourcePoint = new THREE.Vector2(
    constraint.joints.j2.pivot2.x + constraint.joints.j2.activeLinkLength * Math.cos(theta2Rad),
    constraint.joints.j2.pivot2.y + constraint.joints.j2.activeLinkLength * Math.sin(theta2Rad)
  );

  const candidates = intersectCircles2D(
    constraint.joints.j3.pivot2,
    constraint.joints.j3.activeLinkLength,
    sourcePoint,
    constraint.endEffector.holeDistance
  );
  if (candidates.length === 0) {
    return null;
  }

  const currentJ3Deg = posToDeg(j3State, j3State.currentPos);
  const pick = pickFourBarIntersection(
    candidates,
    sourcePoint,
    constraint.joints.j3.pivot2,
    constraint.branch,
    currentJ3Deg,
    constraint.joints.j3.angleOffsetDeg
  );
  if (!pick) return null;

  const theta3DegRaw = THREE.MathUtils.radToDeg(
    Math.atan2(pick.y - constraint.joints.j3.pivot2.y, pick.x - constraint.joints.j3.pivot2.x)
  ) - constraint.joints.j3.angleOffsetDeg;
  const theta3Deg = wrapAngleDeg(theta3DegRaw);

  const globalHoleAngleDeg = THREE.MathUtils.radToDeg(
    Math.atan2(pick.y - sourcePoint.y, pick.x - sourcePoint.x)
  );
  const theta4DegRaw = globalHoleAngleDeg
    - constraint.endEffector.localHoleAngleDeg
    - constraint.joints.j4.angleOffsetDeg;
  const theta4Deg = wrapAngleDeg(theta4DegRaw);

  const pos3 = clampByGuard(j3State, degToPos(j3State, theta3Deg));
  const pos4 = clampByGuard(j4State, degToPos(j4State, theta4Deg));

  j3State.currentPos = pos3;
  if (j3State.rangeInput) j3State.rangeInput.value = String(pos3);
  if (j3State.valueInput) j3State.valueInput.value = String(pos3);
  setJointRotationByPos(j3State, pos3);
  updateJointTelemetry(j3State);

  j4State.currentPos = pos4;
  if (j4State.rangeInput) j4State.rangeInput.value = String(pos4);
  if (j4State.valueInput) j4State.valueInput.value = String(pos4);
  setJointRotationByPos(j4State, pos4);
  updateJointTelemetry(j4State);

  return {
    theta3Deg,
    theta4Deg,
    pos3,
    pos4
  };
}

function applyAutomaticPinConstraint({ lockedTargets = null, sourceState = null } = {}) {
  if (assemblyLockRuntime.enabled && assemblyLockRuntime.disableCouplings) return;
  if (!automaticPinConstraint || automaticPinConstraint.mode !== "physical_four_bar") return;

  const sourceTarget = String(sourceState?.target || "");
  const driverTarget = String(automaticPinConstraint.driverTarget || "");
  const allowedSource = !sourceTarget || sourceTarget === driverTarget || sourceTarget === "j1" || sourceTarget === "j2";
  if (!allowedSource) {
    return;
  }

  solveDrivenJointByPinConstraint(automaticPinConstraint, {
    lockedTargets,
    sourceState
  });
}

function initAutomaticPinConstraint() {
  if (assemblyLockRuntime.enabled && assemblyLockRuntime.disableCouplings) {
    automaticPinConstraint = null;
    autoPinConstraintReady = false;
    return;
  }

  automaticPinConstraint = null;
  autoPinConstraintReady = false;

  const constraint = buildAutomaticPinConstraint();
  if (!constraint) {
    log("Physical closed-chain solver disabled. Fill CAD parameters in joints.json.");
    return;
  }

  automaticPinConstraint = constraint;
  autoPinConstraintReady = true;
  applyConstraintPivotsToStates(constraint);
  log("Physical closed-chain solver ready", {
    driver: constraint.driverTarget,
    branch: constraint.branch,
    planeAxis: constraint.planeAxis,
    holeDistance: Number(constraint.endEffector.holeDistance.toFixed(3))
  });
}

function getCoordinateSpaceLabel(space) {
  if (space === "world") return "world";
  if (space === "display_local") return "display_local";
  if (space === "robot_local") return "robot_local";
  if (space === "selected_parent_local") return "selected_parent_local";
  return String(space || "unknown_space");
}

function getSelectedJointParentObject() {
  return selectedJointState?.pivotGroup?.parent || null;
}

function convertPointFromSpaceToWorld(point, space) {
  const p = point.clone();
  if (space === "world") {
    return { point: p };
  }

  if (space === "display_local") {
    if (!displayRoot) return { error: "displayRoot not ready" };
    displayRoot.updateWorldMatrix(true, false);
    return { point: displayRoot.localToWorld(p) };
  }

  if (space === "robot_local") {
    if (!robotRoot) return { error: "robotRoot not ready" };
    robotRoot.updateWorldMatrix(true, false);
    return { point: robotRoot.localToWorld(p) };
  }

  if (space === "selected_parent_local") {
    const parent = getSelectedJointParentObject();
    if (!parent) return { error: "No selected joint parent object" };
    parent.updateWorldMatrix(true, false);
    return { point: parent.localToWorld(p) };
  }

  return { error: `Unknown space: ${space}` };
}

function convertPointFromWorldToSpace(worldPoint, space) {
  const p = worldPoint.clone();
  if (space === "world") {
    return { point: p };
  }

  if (space === "display_local") {
    if (!displayRoot) return { error: "displayRoot not ready" };
    displayRoot.updateWorldMatrix(true, false);
    return { point: displayRoot.worldToLocal(p) };
  }

  if (space === "robot_local") {
    if (!robotRoot) return { error: "robotRoot not ready" };
    robotRoot.updateWorldMatrix(true, false);
    return { point: robotRoot.worldToLocal(p) };
  }

  if (space === "selected_parent_local") {
    const parent = getSelectedJointParentObject();
    if (!parent) return { error: "No selected joint parent object" };
    parent.updateWorldMatrix(true, false);
    return { point: parent.worldToLocal(p) };
  }

  return { error: `Unknown space: ${space}` };
}

function formatVec3(vec, digits = 3) {
  if (!vec) return "(n/a)";
  const x = Number(vec.x || 0).toFixed(digits);
  const y = Number(vec.y || 0).toFixed(digits);
  const z = Number(vec.z || 0).toFixed(digits);
  return `(${x}, ${y}, ${z})`;
}

function buildCoordinateSpaceGuideText() {
  const selectedText = selectedJointState
    ? `selected_parent_local = parent space of ${selectedJointState.name}`
    : "selected_parent_local = parent space of currently selected joint";
  return [
    "Coordinate Spaces:",
    "world: Three.js world space.",
    "display_local: local space of displayRoot.",
    "robot_local: local space of robotRoot.",
    `${selectedText}.`,
    "",
    "Input coordinate will be converted to world/display_local/robot_local/selected_parent_local."
  ].join("\n");
}

function buildCoordinateProbeReport(worldPoint, sourceSpace) {
  const lines = [];
  lines.push(`Input Space: ${getCoordinateSpaceLabel(sourceSpace)}`);

  const worldText = formatVec3(worldPoint);
  lines.push(`world: ${worldText}`);

  const displayConv = convertPointFromWorldToSpace(worldPoint, "display_local");
  lines.push(`display_local: ${displayConv.point ? formatVec3(displayConv.point) : `error(${displayConv.error})`}`);

  const robotConv = convertPointFromWorldToSpace(worldPoint, "robot_local");
  lines.push(`robot_local: ${robotConv.point ? formatVec3(robotConv.point) : `error(${robotConv.error})`}`);

  const parentConv = convertPointFromWorldToSpace(worldPoint, "selected_parent_local");
  const parentLabel = selectedJointState
    ? `${selectedJointState.name} parent_local`
    : "selected_parent_local";
  lines.push(`${parentLabel}: ${parentConv.point ? formatVec3(parentConv.point) : `error(${parentConv.error})`}`);
  return lines.join("\n");
}

function isWsOpen() {
  return gatewayBridge.isWsOpen();
}

function send(payload, silentWhenClosed = false) {
  return gatewayBridge.send(payload, silentWhenClosed);
}

function clearPendingGatewayRequests(reason = "gateway request canceled") {
  gatewayBridge.clearPendingGatewayRequests(reason);
}

function consumeGatewayRequestReply(msg) {
  return gatewayBridge.consumeGatewayRequestReply(msg);
}

function sendGatewayRequest(type, payload = {}, timeoutMs = 5000) {
  return gatewayBridge.sendGatewayRequest(type, payload, timeoutMs);
}

function readPresetList() {
  return readPresetListRaw(PRESET_STORAGE_KEY, PRESET_SCHEMA_VERSION, {
    onError: (message) => log(message)
  });
}

function writePresetList(list) {
  return writePresetListRaw(PRESET_STORAGE_KEY, list, {
    onError: (message, obj) => log(message, obj)
  });
}

function cloneConfig(config) {
  try {
    return JSON.parse(JSON.stringify(config || FALLBACK_CONFIG));
  } catch {
    return JSON.parse(JSON.stringify(FALLBACK_CONFIG));
  }
}

function buildJointConfigPatchFromState(state) {
  const min = clampInt(state.min, 0, 1000);
  const max = clampInt(state.max, 0, 1000);
  const guardMin = clampInt(state.guardMin, 0, 1000);
  const guardMax = clampInt(state.guardMax, 0, 1000);
  const tmp = {
    ...state,
    min,
    max,
    guardMin,
    guardMax
  };
  normalizeJointLimits(tmp);
  const pivot = normalizePivotArray(state.pivot, [0, 0, 0]);

  return {
    name: String(state.name || ""),
    target: String(state.target || ""),
    parentTarget: String(state.parentTarget || defaultParentTargetForTarget(state.target)).trim().toLowerCase(),
    servoId: getJointServoId(state),
    servoMapPoints: cloneServoMapPoints(state.servoMapPoints, state),
    backlash: normalizeBacklashConfig(state.backlash),
    pivotSpace: normalizePivotSpace(state.pivotSpace, "world"),
    closureEnabled: state.closureEnabled === true,
    closureParentTarget: String(state.closureParentTarget || ""),
    closureGain: toFiniteNumber(state.closureGain, 1),
    closureMaxDeg: toFiniteNumber(state.closureMaxDeg, 0),
    closureOffsetDeg: toFiniteNumber(state.closureOffsetDeg, 0),
    closureInvert: state.closureInvert === true,
    axis: getEffectiveJointAxis(state),
    invert: !!state.invert,
    min: tmp.min,
    max: tmp.max,
    guardMin: tmp.guardMin,
    guardMax: tmp.guardMax,
    minDeg: Number(state.minDeg ?? -90),
    maxDeg: Number(state.maxDeg ?? 90),
    commandScale: normalizeCommandScale(
      state.commandScale,
      estimateDefaultCommandScaleByJointRange(state.minDeg, state.maxDeg)
    ),
    defaultPos: clampByGuard(tmp, state.defaultPos),
    defaultTime: clampInt(getJointTime(state), 20, 30000),
    pivot: [pivot[0], pivot[1], pivot[2]]
  };
}

function findConfigJointIndex(joints, state) {
  if (!Array.isArray(joints)) return -1;

  let idx = joints.findIndex((joint) => String(joint?.target || "") === String(state.target || ""));
  if (idx >= 0) return idx;

  idx = joints.findIndex((joint) => String(joint?.name || "") === String(state.name || ""));
  return idx;
}

function applyStatePatchToConfigJointEntry(entry, state) {
  const patch = buildJointConfigPatchFromState(state);
  entry.name = patch.name;
  entry.target = patch.target;
  entry.parentTarget = patch.parentTarget;
  entry.servoId = patch.servoId;
  entry.servoMapPoints = patch.servoMapPoints;
  entry.backlash = patch.backlash;
  entry.pivotSpace = patch.pivotSpace;
  entry.closureEnabled = patch.closureEnabled;
  entry.closureParentTarget = patch.closureParentTarget;
  entry.closureGain = patch.closureGain;
  entry.closureMaxDeg = patch.closureMaxDeg;
  entry.closureOffsetDeg = patch.closureOffsetDeg;
  entry.closureInvert = patch.closureInvert;
  entry.axis = patch.axis;
  entry.invert = patch.invert;
  entry.min = patch.min;
  entry.max = patch.max;
  entry.guardMin = patch.guardMin;
  entry.guardMax = patch.guardMax;
  entry.minDeg = patch.minDeg;
  entry.maxDeg = patch.maxDeg;
  entry.commandScale = patch.commandScale;
  entry.defaultPos = patch.defaultPos;
  entry.defaultTime = patch.defaultTime;
  entry.pivot = patch.pivot;
}

function syncJointStateFromInputs(state) {
  if (!state) return;

  state.servoId = getJointServoId(state);
  state.defaultTime = getJointTime(state);

  state.min = clampInt(state.minInput ? state.minInput.value : state.min, 0, 1000);
  state.max = clampInt(state.maxInput ? state.maxInput.value : state.max, 0, 1000);
  state.guardMin = clampInt(state.guardMinInput ? state.guardMinInput.value : state.guardMin, 0, 1000);
  state.guardMax = clampInt(state.guardMaxInput ? state.guardMaxInput.value : state.guardMax, 0, 1000);
  state.defaultPos = clampInt(state.defaultPosInput ? state.defaultPosInput.value : state.defaultPos, 0, 1000);

  state.minDeg = clampNumber(state.minDegInput ? state.minDegInput.value : state.minDeg, -360, 360, state.minDeg);
  state.maxDeg = clampNumber(state.maxDegInput ? state.maxDegInput.value : state.maxDeg, -360, 360, state.maxDeg);
  state.commandScale = normalizeCommandScale(
    state.commandScaleInput ? state.commandScaleInput.value : state.commandScale,
    estimateDefaultCommandScaleByJointRange(state.minDeg, state.maxDeg)
  );
  state.axis = safeAxis(state.axisInput ? state.axisInput.value : state.axis);
  enforceMotionAxisLockOnState(state);
  state.invert = state.invertInput ? !!state.invertInput.checked : !!state.invert;
  state.realtimeSendEnabled = state.realtimeInput ? !!state.realtimeInput.checked : state.realtimeSendEnabled !== false;
  state.servoMapPoints = parseServoMapPoints(state.servoMapPoints, state);
  state.backlash = normalizeBacklashConfig(state.backlash);

  const currentPivot = normalizePivotArray(state.pivot, [0, 0, 0]);
  state.pivot = [
    clampNumber(state.pivotXInput ? state.pivotXInput.value : currentPivot[0], -5000, 5000, currentPivot[0]),
    clampNumber(state.pivotYInput ? state.pivotYInput.value : currentPivot[1], -5000, 5000, currentPivot[1]),
    clampNumber(state.pivotZInput ? state.pivotZInput.value : currentPivot[2], -5000, 5000, currentPivot[2])
  ];

  normalizeJointLimits(state);
  state.defaultPos = clampByGuard(state, state.defaultPos);
  state.currentPos = clampByGuard(state, state.valueInput ? state.valueInput.value : state.currentPos);

  if (state.idInput) state.idInput.value = String(state.servoId);
  if (state.timeInput) state.timeInput.value = String(state.defaultTime);
  if (state.minDegInput) state.minDegInput.value = String(state.minDeg);
  if (state.maxDegInput) state.maxDegInput.value = String(state.maxDeg);
  if (state.commandScaleInput) state.commandScaleInput.value = String(state.commandScale);
  if (state.axisInput) state.axisInput.value = getEffectiveJointAxisDisplayName(state);
  if (state.invertInput) state.invertInput.checked = !!state.invert;
  if (state.defaultPosInput) state.defaultPosInput.value = String(state.defaultPos);
  if (state.realtimeInput) state.realtimeInput.checked = !!state.realtimeSendEnabled;

  syncJointRangeBounds(state);
  applyJointPivot(state, state.pivot);
  applyJointVisual(state, state.currentPos);
}

function collectWriteTargetStates({ selectedOnly = false } = {}) {
  const targets = selectedOnly ? [selectedJointState].filter(Boolean) : jointStates.slice();
  targets.forEach((state) => syncJointStateFromInputs(state));
  return targets;
}

function buildRuntimeJointConfig({ selectedOnly = false, baseConfig = null, targetStates = null } = {}) {
  const config = cloneConfig(baseConfig || loadedJointConfig || FALLBACK_CONFIG);
  if (!Array.isArray(config.joints)) {
    config.joints = [];
  }

  const targets = Array.isArray(targetStates)
    ? targetStates
    : (selectedOnly ? [selectedJointState].filter(Boolean) : jointStates.slice());
  for (const state of targets) {
    const idx = findConfigJointIndex(config.joints, state);
    if (idx >= 0) {
      applyStatePatchToConfigJointEntry(config.joints[idx], state);
    } else {
      config.joints.push(buildJointConfigPatchFromState(state));
    }
  }

  syncPhysicalKinematicsRuntimeData(config, targets);
  syncMotionLocksRuntimeData(config);
  config.demoKinematics = { ...demoArmModel };
  config.demoFea = {
    ...demoFeaModel,
    sections: {
      ...demoFeaModel.sections,
      j2: { ...demoFeaModel.sections.j2 },
      j3: { ...demoFeaModel.sections.j3 },
      j4: { ...demoFeaModel.sections.j4 }
    }
  };
  config.demoRuntime = {
    enabled: demoRuntime.enabled,
    autoFea: demoRuntime.autoFea,
    payloadNewton: demoRuntime.payloadNewton,
    elbow: demoRuntime.elbow,
    wristPitchDeg: demoRuntime.wristPitchDeg,
    target: {
      x: demoRuntime.target.x,
      y: demoRuntime.target.y,
      z: demoRuntime.target.z
    }
  };

  return config;
}

async function bindJointConfigFileHandle() {
  if (!supportsFileSystemAccess()) {
    return null;
  }

  try {
    const handles = await window.showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: "JSON config",
          accept: { "application/json": [".json"] }
        }
      ]
    });
    jointConfigFileHandle = handles?.[0] || null;
    return jointConfigFileHandle;
  } catch (error) {
    if (String(error?.name || "") === "AbortError") {
      return null;
    }
    throw error;
  }
}

async function ensureJointConfigFileHandle({ promptIfMissing = true } = {}) {
  if (jointConfigFileHandle) {
    return jointConfigFileHandle;
  }
  if (!promptIfMissing) {
    return null;
  }
  return bindJointConfigFileHandle();
}

async function readJointConfigFromFileHandle(handle) {
  return readJointConfigFromFileHandleRaw(handle, {
    onError: (message, obj) => log(message, obj)
  });
}

async function writeConfigToFileOrDownload(
  config,
  { preferFileName = "joints.json", fileHandle = null, promptForFileHandle = true } = {}
) {
  return writeConfigToFileOrDownloadRaw(config, {
    preferFileName,
    fileHandle,
    promptForFileHandle,
    ensureFileHandle: ensureJointConfigFileHandle
  });
}

async function readJointConfigViaGateway() {
  const reply = await sendGatewayRequest("config_read", {}, 1800);
  if (reply?.ok !== true) {
    throw new Error(String(reply?.error || "config_read failed"));
  }
  if (!reply.config || !Array.isArray(reply.config.joints)) {
    throw new Error("config_read missing joints[]");
  }
  return reply.config;
}

async function writeJointConfigViaGateway(config) {
  const reply = await sendGatewayRequest("config_write", { config }, 2200);
  if (reply?.ok !== true) {
    throw new Error(String(reply?.error || "config_write failed"));
  }
  return reply;
}

function captureJointSnapshot(state) {
  const pivot = normalizePivotArray(state.pivot, [0, 0, 0]);
  return {
    target: String(state.target || ""),
    parentTarget: String(state.parentTarget || defaultParentTargetForTarget(state.target)).trim().toLowerCase(),
    name: String(state.name || ""),
    servoId: getJointServoId(state),
    servoMapPoints: cloneServoMapPoints(state.servoMapPoints, state),
    backlash: normalizeBacklashConfig(state.backlash),
    pivotSpace: normalizePivotSpace(state.pivotSpace, "world"),
    closureEnabled: state.closureEnabled === true,
    closureParentTarget: String(state.closureParentTarget || ""),
    closureGain: toFiniteNumber(state.closureGain, 1),
    closureMaxDeg: toFiniteNumber(state.closureMaxDeg, 0),
    closureOffsetDeg: toFiniteNumber(state.closureOffsetDeg, 0),
    closureInvert: state.closureInvert === true,
    min: clampInt(state.min, 0, 1000),
    max: clampInt(state.max, 0, 1000),
    guardMin: clampInt(state.guardMin, 0, 1000),
    guardMax: clampInt(state.guardMax, 0, 1000),
    minDeg: Number(state.minDeg ?? -90),
    maxDeg: Number(state.maxDeg ?? 90),
    commandScale: normalizeCommandScale(
      state.commandScale,
      estimateDefaultCommandScaleByJointRange(state.minDeg, state.maxDeg)
    ),
    axis: getEffectiveJointAxis(state),
    invert: Boolean(state.invert),
    defaultPos: clampByGuard(state, state.defaultPos),
    currentPos: clampByGuard(state, state.currentPos),
    moveTime: getJointTime(state),
    pivot: [pivot[0], pivot[1], pivot[2]],
    realtimeSendEnabled: state.realtimeSendEnabled !== false
  };
}

function buildPresetRecord(name) {
  return {
    version: PRESET_SCHEMA_VERSION,
    name,
    updatedAt: new Date().toISOString(),
    global: {
      positionPollIntervalMs,
      sliderAutoSendDelayMs,
      globalRealtimeSendEnabled
    },
    joints: jointStates.map((state) => captureJointSnapshot(state))
  };
}

function normalizeJointLimits(state) {
  state.min = clampInt(state.min, 0, 1000);
  state.max = clampInt(state.max, 0, 1000);

  if (state.min > state.max) {
    const t = state.min;
    state.min = state.max;
    state.max = t;
  }

  const guardMinRaw = Number.isFinite(Number(state.guardMin)) ? Number(state.guardMin) : state.min;
  const guardMaxRaw = Number.isFinite(Number(state.guardMax)) ? Number(state.guardMax) : state.max;
  state.guardMin = clampInt(Math.min(guardMinRaw, guardMaxRaw), state.min, state.max);
  state.guardMax = clampInt(Math.max(guardMinRaw, guardMaxRaw), state.min, state.max);
}

function clampByGuard(state, value) {
  normalizeJointLimits(state);
  return clampInt(value, state.guardMin, state.guardMax);
}

function getJointServoId(state) {
  return clampInt(state.idInput ? state.idInput.value : state.servoId, 1, 253);
}

function getJointPos(state) {
  return clampByGuard(state, state.valueInput ? state.valueInput.value : state.defaultPos);
}

function getJointTime(state) {
  return clampInt(state.timeInput ? state.timeInput.value : state.defaultTime, 20, 30000);
}

function findJointStateByServoId(id) {
  for (const state of jointStates) {
    if (getJointServoId(state) === id) {
      return state;
    }
  }
  return null;
}

function buildPollIdList() {
  const ids = new Set();
  jointStates.forEach((state) => ids.add(getJointServoId(state)));
  reachableServoIds.forEach((id) => ids.add(id));
  return Array.from(ids).filter((id) => Number.isFinite(id) && id > 0);
}

function shouldLogGatewayMessage(msg) {
  if (!msg || typeof msg !== "object") return true;

  if (msg.type === "mcu" && msg.parsed?.type === "error" && msg.parsed?.code === "NO_POS") {
    if (!Number.isFinite(expectedQueryId)) {
      return false;
    }

    const now = Date.now();
    const mutedUntil = noPosMuteUntilById.get(expectedQueryId) || 0;
    if (now < mutedUntil) {
      return false;
    }

    noPosMuteUntilById.set(expectedQueryId, now + 4000);
  }

  return true;
}

function parseServoMapPoints(rawPoints, state) {
  const points = [];
  if (Array.isArray(rawPoints)) {
    for (const item of rawPoints) {
      if (Array.isArray(item) && item.length >= 2) {
        const deg = Number(item[0]);
        const pos = Number(item[1]);
        if (Number.isFinite(deg) && Number.isFinite(pos)) {
          points.push({ deg, pos: clampInt(pos, 0, 1000) });
        }
        continue;
      }
      if (item && typeof item === "object") {
        const deg = Number(item.deg);
        const pos = Number(item.pos);
        if (Number.isFinite(deg) && Number.isFinite(pos)) {
          points.push({ deg, pos: clampInt(pos, 0, 1000) });
        }
      }
    }
  }

  if (points.length < 2) {
    points.push(
      { deg: Number(state.minDeg ?? -90), pos: clampInt(state.min ?? 0, 0, 1000) },
      { deg: Number(state.maxDeg ?? 90), pos: clampInt(state.max ?? 1000, 0, 1000) }
    );
  }

  points.sort((a, b) => a.deg - b.deg);
  const dedup = [];
  for (const pt of points) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last.deg - pt.deg) > 1e-9) {
      dedup.push({ deg: pt.deg, pos: pt.pos });
    } else {
      last.pos = pt.pos;
    }
  }

  if (dedup.length < 2) {
    const fallbackMinDeg = Number(state.minDeg ?? -90);
    const fallbackMaxDeg = Number(state.maxDeg ?? 90);
    const fallbackMinPos = clampInt(state.min ?? 0, 0, 1000);
    const fallbackMaxPos = clampInt(state.max ?? 1000, 0, 1000);
    return [
      { deg: fallbackMinDeg, pos: fallbackMinPos },
      { deg: fallbackMaxDeg, pos: fallbackMaxPos }
    ];
  }
  return dedup;
}

function cloneServoMapPoints(points, state) {
  return parseServoMapPoints(points, state).map((pt) => ({ deg: pt.deg, pos: pt.pos }));
}

function normalizeBacklashConfig(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: cfg.enabled === true,
    forwardPos: clampNumber(cfg.forwardPos ?? cfg.plusPos ?? 0, 0, 120, 0),
    reversePos: clampNumber(cfg.reversePos ?? cfg.minusPos ?? 0, 0, 120, 0),
    switchExtraPos: clampNumber(cfg.switchExtraPos ?? cfg.switchPos ?? 0, 0, 120, 0)
  };
}

function interpolateByX(points, x, xKey, yKey) {
  if (!Array.isArray(points) || points.length === 0) return 0;
  const safeX = Number(x);
  if (!Number.isFinite(safeX)) return Number(points[0][yKey]) || 0;
  if (points.length === 1) return Number(points[0][yKey]) || 0;

  if (safeX <= Number(points[0][xKey])) return Number(points[0][yKey]) || 0;
  if (safeX >= Number(points[points.length - 1][xKey])) return Number(points[points.length - 1][yKey]) || 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const x0 = Number(p0[xKey]);
    const x1 = Number(p1[xKey]);
    if (safeX < x0 || safeX > x1) continue;
    const span = x1 - x0;
    if (Math.abs(span) <= 1e-9) {
      return Number(p0[yKey]) || 0;
    }
    const ratio = (safeX - x0) / span;
    return (Number(p0[yKey]) || 0) + ratio * ((Number(p1[yKey]) || 0) - (Number(p0[yKey]) || 0));
  }

  return Number(points[points.length - 1][yKey]) || 0;
}

function getServoMapByDeg(state) {
  return Array.isArray(state?.servoMapPoints) && state.servoMapPoints.length >= 2
    ? state.servoMapPoints
    : parseServoMapPoints(null, state);
}

function getServoMapByPos(state) {
  const byDeg = getServoMapByDeg(state);
  const byPos = byDeg.map((pt) => ({ deg: pt.deg, pos: pt.pos })).sort((a, b) => a.pos - b.pos);
  const dedup = [];
  for (const pt of byPos) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last.pos - pt.pos) > 1e-9) {
      dedup.push(pt);
    } else {
      last.deg = pt.deg;
    }
  }
  return dedup.length >= 2 ? dedup : byPos;
}

function posToDeg(state, pos) {
  const min = Number(state.min ?? 0);
  const max = Number(state.max ?? 1000);
  const safePos = clampInt(pos, min, max);

  const byPos = getServoMapByPos(state);
  const sourceDeg = interpolateByX(byPos, safePos, "pos", "deg");
  const finalDeg = state.invert ? -sourceDeg : sourceDeg;
  return finalDeg;
}

function degToPos(state, deg) {
  const min = Number(state.min ?? 0);
  const max = Number(state.max ?? 1000);
  const safeDegRaw = Number(deg);
  const safeDeg = Number.isFinite(safeDegRaw) ? safeDegRaw : 0;
  const sourceDeg = state.invert ? -safeDeg : safeDeg;
  const byDeg = getServoMapByDeg(state);
  const pos = interpolateByX(byDeg, sourceDeg, "deg", "pos");
  return clampInt(pos, min, max);
}

function compensateCommandPosByBacklash(state, desiredPos) {
  const safePos = clampByGuard(state, desiredPos);
  const backlash = normalizeBacklashConfig(state?.backlash);
  if (!backlash.enabled) {
    state.lastCommandBasePos = safePos;
    state.lastCommandDir = 0;
    state.lastCommandSentPos = safePos;
    return safePos;
  }

  const prevBase = Number.isFinite(state.lastCommandBasePos) ? state.lastCommandBasePos : safePos;
  const prevDir = Number.isFinite(state.lastCommandDir) ? state.lastCommandDir : 0;
  const delta = safePos - prevBase;
  let dir = prevDir;
  let offset = 0;
  if (Math.abs(delta) > 1e-9) {
    dir = delta > 0 ? 1 : -1;
    offset = dir > 0 ? backlash.forwardPos : -backlash.reversePos;
    if (prevDir !== 0 && dir !== prevDir) {
      offset += dir * backlash.switchExtraPos;
    }
  }

  const compensated = clampByGuard(state, safePos + offset);
  state.lastCommandBasePos = safePos;
  state.lastCommandDir = dir;
  state.lastCommandSentPos = compensated;
  return compensated;
}

function posToRad(state, pos) {
  return THREE.MathUtils.degToRad(posToDeg(state, pos));
}

function setJointRotationByPos(state, pos) {
  if (!state?.pivotGroup) return;
  const angleRad = posToRad(state, pos);
  const lockedParentAxis = getLockedParentAxisForTarget(state?.target);
  if (lockedParentAxis) {
    const localAxis = lockedParentAxis.clone().normalize();
    state.pivotGroup.quaternion.setFromAxisAngle(localAxis, angleRad);
    return;
  }

  state.pivotGroup.rotation.set(0, 0, 0);
  state.pivotGroup.rotation[getEffectiveJointAxis(state)] = angleRad;
}

function findJointStateByTarget(target) {
  const t = String(target || "");
  if (!t) return null;
  for (const state of jointStates) {
    if (String(state?.target || "") === t) return state;
  }
  return null;
}

function normalizeDerivedType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "follow" || type === "offset_minus_sum") return type;
  return "";
}

function computeDerivedJointDeg(state) {
  const type = normalizeDerivedType(state?.derivedType);
  if (!type) return null;

  if (type === "follow") {
    const srcTarget = String(state?.derivedSourceTarget || "").trim().toLowerCase();
    if (!srcTarget) return null;
    const src = findJointStateByTarget(srcTarget);
    if (!src) return null;
    const srcDeg = posToDeg(src, src.currentPos);
    const gain = toFiniteNumber(state?.derivedGain, 1);
    const offset = toFiniteNumber(state?.derivedOffsetDeg, 0);
    return srcDeg * gain + offset;
  }

  if (type === "offset_minus_sum") {
    const srcTargetsRaw = Array.isArray(state?.derivedSourceTargets) && state.derivedSourceTargets.length > 0
      ? state.derivedSourceTargets
      : ["j2", "j3"];
    const offsetCfg = toFiniteNumber(state?.derivedOffsetDeg, 0);
    const offsetState = findJointStateByTarget("j4");
    const offsetDeg = offsetState && offsetState !== state
      ? posToDeg(offsetState, offsetState.currentPos)
      : offsetCfg;
    let deg = offsetDeg;
    for (const srcTargetRaw of srcTargetsRaw) {
      const srcTarget = String(srcTargetRaw || "").trim().toLowerCase();
      if (!srcTarget) continue;
      const src = findJointStateByTarget(srcTarget);
      if (!src) return null;
      deg -= posToDeg(src, src.currentPos);
    }
    return deg;
  }

  return null;
}

function applyDerivedJointVisuals(options = {}) {
  if (!Array.isArray(jointStates) || jointStates.length === 0) return;
  const lockedTargets = options && options.lockedTargets instanceof Set
    ? options.lockedTargets
    : null;

  const maxPass = Math.max(1, jointStates.length);
  for (let pass = 0; pass < maxPass; pass += 1) {
    let changed = false;

    for (const state of jointStates) {
      const type = normalizeDerivedType(state?.derivedType);
      if (!type) continue;

      const stateTarget = String(state?.target || "");
      if (lockedTargets && stateTarget && lockedTargets.has(stateTarget)) continue;

      const desiredDeg = computeDerivedJointDeg(state);
      if (!Number.isFinite(desiredDeg)) continue;
      const desiredPos = clampByGuard(state, degToPos(state, desiredDeg));
      const prevPos = clampByGuard(state, state.currentPos);
      state.currentPos = desiredPos;
      if (state.rangeInput) state.rangeInput.value = String(state.currentPos);
      if (state.valueInput) state.valueInput.value = String(state.currentPos);
      setJointRotationByPos(state, state.currentPos);
      updateJointTelemetry(state);
      if (desiredPos !== prevPos) changed = true;
    }

    if (!changed) break;
  }
}

function getClosureDrivenDeg(state, parentState) {
  let deg = posToDeg(parentState, parentState.currentPos) * toFiniteNumber(state.closureGain, 1);
  deg += toFiniteNumber(state.closureOffsetDeg, 0);
  if (state.closureInvert) deg = -deg;

  const maxAbs = Math.abs(toFiniteNumber(state.closureMaxDeg, 0));
  if (Number.isFinite(maxAbs) && maxAbs > 0) {
    deg = clampNumber(deg, -maxAbs, maxAbs, deg);
  }
  return deg;
}

function applyClosureVisuals(options = {}) {
  if (!Array.isArray(jointStates) || jointStates.length === 0) return;
  if (assemblyLockRuntime.enabled && assemblyLockRuntime.disableCouplings) return;
  if (autoPinConstraintReady && automaticPinConstraint?.mode === "physical_four_bar") {
    return;
  }
  const lockedTargets = options && options.lockedTargets instanceof Set
    ? options.lockedTargets
    : null;

  const maxPass = Math.max(1, jointStates.length + 2);
  for (let pass = 0; pass < maxPass; pass++) {
    let changed = false;

    for (const state of jointStates) {
      if (state?.closureEnabled !== true) continue;
      const stateTarget = String(state?.target || "");
      if (lockedTargets && stateTarget && lockedTargets.has(stateTarget)) {
        continue;
      }
      const parent = findJointStateByTarget(state.closureParentTarget);
      if (!parent || parent === state) continue;

      const desiredDeg = getClosureDrivenDeg(state, parent);
      const desiredPos = clampByGuard(state, degToPos(state, desiredDeg));
      const prevPos = clampByGuard(state, state.currentPos);
      const nextPos = clampByGuard(state, desiredPos);

      if (nextPos !== prevPos) {
        state.currentPos = nextPos;
        changed = true;
      } else {
        state.currentPos = prevPos;
      }

      if (state.rangeInput) state.rangeInput.value = String(state.currentPos);
      if (state.valueInput) state.valueInput.value = String(state.currentPos);
      setJointRotationByPos(state, state.currentPos);
      updateJointTelemetry(state);
    }

    if (!changed) break;
  }
}

function updateJointTelemetry(state) {
  if (!state) return;

  const pos = clampByGuard(state, state.currentPos);
  const deg = posToDeg(state, pos);
  const servoId = getJointServoId(state);
  const vin = lastVoltageById.get(servoId);
  const temp = lastTempById.get(servoId);
  const actualId = lastActualIdByQueryId.get(servoId);

  if (state.posChipEl) state.posChipEl.textContent = `POS ${pos}`;
  if (state.degChipEl) state.degChipEl.textContent = `DEG ${deg.toFixed(1)}`;
  if (state.idChipEl) state.idChipEl.textContent = `ID ${servoId}`;
  if (state.vinChipEl) state.vinChipEl.textContent = Number.isFinite(vin) ? `VIN ${(vin / 1000).toFixed(2)}V` : "VIN --";
  if (state.tempChipEl) state.tempChipEl.textContent = Number.isFinite(temp) ? `TEMP ${temp.toFixed(1)}C` : "TEMP --";
  if (state.actualIdChipEl) state.actualIdChipEl.textContent = Number.isFinite(actualId) ? `ACTID ${actualId}` : "ACTID --";
  if (state.actualIdReadoutEl) {
    state.actualIdReadoutEl.textContent = Number.isFinite(actualId)
      ? `Actual Servo ID: ${actualId}`
      : "Actual Servo ID: --";
  }
}

function syncJointRangeBounds(state) {
  normalizeJointLimits(state);

  const softMin = Math.min(state.guardMin, state.guardMax);
  const softMax = Math.max(state.guardMin, state.guardMax);

  if (state.rangeInput) {
    state.rangeInput.min = String(softMin);
    state.rangeInput.max = String(softMax);
  }

  if (state.valueInput) {
    state.valueInput.min = String(softMin);
    state.valueInput.max = String(softMax);
  }

  if (state.minInput) {
    state.minInput.value = String(state.min);
    state.minInput.min = "0";
    state.minInput.max = "1000";
  }

  if (state.maxInput) {
    state.maxInput.value = String(state.max);
    state.maxInput.min = "0";
    state.maxInput.max = "1000";
  }

  if (state.guardMinInput) {
    state.guardMinInput.value = String(state.guardMin);
    state.guardMinInput.min = String(state.min);
    state.guardMinInput.max = String(state.max);
  }

  if (state.guardMaxInput) {
    state.guardMaxInput.value = String(state.guardMax);
    state.guardMaxInput.min = String(state.min);
    state.guardMaxInput.max = String(state.max);
  }
}

function applyJointVisual(state, pos, options = {}) {
  const finalPos = clampByGuard(state, pos);
  state.currentPos = finalPos;

  if (state.rangeInput) state.rangeInput.value = String(finalPos);
  if (state.valueInput) state.valueInput.value = String(finalPos);

  // SuArmT wrist semantics: J4 is derived by q4 = q4_offset - q2 - q3.
  // If caller sets J4 directly (for demo IK or external patch), treat it as
  // "effective wrist angle target" and back-compute the offset term.
  const stateDerivedType = normalizeDerivedType(state?.derivedType);
  if (stateDerivedType === "offset_minus_sum" && String(state?.target || "") === "j4") {
    const j2 = findJointStateByTarget("j2");
    const j3 = findJointStateByTarget("j3");
    if (j2 && j3) {
      const desiredQ4 = posToDeg(state, finalPos);
      const q2 = posToDeg(j2, j2.currentPos);
      const q3 = posToDeg(j3, j3.currentPos);
      state.derivedOffsetDeg = desiredQ4 + q2 + q3;
    }
  }

  setJointRotationByPos(state, finalPos);
  updateJointTelemetry(state);
  const skipCouplings = options?.skipCouplings === true
    || demoRuntime.enabled === true
    || (assemblyLockRuntime.enabled && assemblyLockRuntime.disableCouplings);
  const lockClosureForSelf = options?.lockClosureForSelf === true;
  const lockedTargets = lockClosureForSelf && state?.target && stateDerivedType !== "offset_minus_sum"
    ? new Set([String(state.target)])
    : null;
  if (!skipCouplings) {
    applyClosureVisuals({ lockedTargets });
    applyAutomaticPinConstraint({ lockedTargets, sourceState: state });
  }
  applyDerivedJointVisuals({ lockedTargets });
  if (state === selectedJointState) {
    updateAxisHelperFromSelectedJoint();
  } else if (selectedJointState) {
    updateAxisHelperFromSelectedJoint();
  }

  if (options?.suppressHooks === true) return;
  if (demoRuntime.enabled && demoRuntime.autoFea) {
    runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
  }
  triggerDemoReadoutUpdate();
}

function ensureAxisHelper() {
  axisHelperController.ensureAxisHelper();
}

function notifyAxisLineEditorState() {
  notifyAxisLineEditorStateRaw({
    axisLineEditorOnStateChanged,
    axisLineEditorActive,
    axisLineEditorTarget,
    axisLineEditorMode,
    axisLineEditorLinePinned,
    axisLineEditorDragging
  });
}

function updateAxisLineEditorModeVisuals() {
  updateAxisLineEditorModeVisualsRaw({
    axisLineEditorLine,
    axisLineEditorHandle,
    axisLineEditorPivotMarker,
    axisLineEditorMode
  });
}

function syncAxisLineEditorControlState() {
  syncAxisLineEditorControlStateRaw({
    controls,
    axisLineEditorActive,
    axisLineEditorMode,
    axisLineEditorDragging
  });
}

function setAxisLineEditorMode(mode = "direction") {
  setAxisLineEditorModeRaw({
    mode,
    setAxisLineEditorModeState: (v) => { axisLineEditorMode = v; },
    updateAxisLineEditorModeVisuals,
    getAxisLineEditorActive: () => axisLineEditorActive,
    setAxisLineEditorGeometry,
    axisLineEditorPivotWorld,
    axisLineEditorAxisWorld,
    syncAxisLineEditorControlState,
    notifyAxisLineEditorState
  });
}

function setAxisLineEditorLinePinned(pinned) {
  setAxisLineEditorLinePinnedRaw({
    pinned,
    setAxisLineEditorLinePinnedState: (v) => { axisLineEditorLinePinned = v; },
    axisLineEditorLineAnchorWorld,
    axisLineEditorPivotWorld,
    getAxisLineEditorActive: () => axisLineEditorActive,
    setAxisLineEditorGeometry,
    axisLineEditorAxisWorld,
    notifyAxisLineEditorState
  });
}

function setAxisLineEditorGeometry(pivotWorld, axisWorld) {
  setAxisLineEditorGeometryRaw({
    getAxisLineEditorLine: () => axisLineEditorLine,
    getAxisLineEditorHandle: () => axisLineEditorHandle,
    getAxisLineEditorPivotMarker: () => axisLineEditorPivotMarker,
    axisLineEditorLineAnchorWorld,
    getAxisLineEditorLinePinned: () => axisLineEditorLinePinned,
    getAxisLineEditorLength: () => axisLineEditorLength,
    toFiniteNumber
  }, pivotWorld, axisWorld);
}

function refreshAxisLineEditorFromRuntime() {
  refreshAxisLineEditorFromRuntimeRaw({
    getAxisLineEditorActive: () => axisLineEditorActive,
    getAxisLineEditorGroup: () => axisLineEditorGroup,
    getAxisLineEditorTarget: () => axisLineEditorTarget,
    findJointStateByTarget,
    getParentAxisVectorForTarget,
    setAxisLineEditorLength: (v) => { axisLineEditorLength = v; },
    axisLineEditorPivotWorld,
    getAxisLineEditorLinePinned: () => axisLineEditorLinePinned,
    axisLineEditorLineAnchorWorld,
    axisLineEditorAxisWorld,
    updateAxisLineEditorModeVisuals,
    setAxisLineEditorGeometry,
    getJointAxisDisplayLength
  });
}

function getAxisLineEditorNdcFromEvent(evt) {
  return getAxisLineEditorNdcFromEventRaw(renderer?.domElement, evt);
}

function getAxisLineEditorTargetState() {
  const target = String(axisLineEditorTarget || "");
  if (!target) {
    return { target: "", state: null };
  }
  return { target, state: findJointStateByTarget(target) };
}

function collectAxisLineEditorPickMeshes(target) {
  return collectAxisLineEditorPickMeshesRaw({
    target,
    findJointStateByTarget,
    meshGroupsByTarget
  });
}

function getAxisLineEditorWorldNormalFromHit(hit) {
  return getAxisLineEditorWorldNormalFromHitRaw(THREE, hit);
}

function applyAxisLineEditorAxisWorld(target, axisWorld) {
  return applyAxisLineEditorAxisWorldRaw({
    target,
    axisWorld,
    findJointStateByTarget,
    axisLineEditorAxisWorld,
    axisLineEditorOnAxisUpdated
  });
}

function setAxisLineEditorPivotWorld(target, pivotWorld) {
  return setAxisLineEditorPivotWorldRaw({
    target,
    pivotWorld,
    findJointStateByTarget,
    normalizePivotSpace,
    worldToRobotLocal,
    applyJointPivot,
    axisLineEditorPivotWorld,
    getAxisLineEditorLinePinned: () => axisLineEditorLinePinned,
    axisLineEditorLineAnchorWorld
  });
}

function pickAxisLineFromPointerEvent(evt) {
  return pickAxisLineFromPointerEventRaw({
    getAxisLineEditorActive: () => axisLineEditorActive,
    getCamera: () => camera,
    getAxisLineEditorTargetState,
    getAxisLineEditorNdcFromEvent,
    axisLineEditorPointer,
    axisLineEditorRaycaster,
    collectAxisLineEditorPickMeshes,
    log,
    getAxisLineEditorWorldNormalFromHit,
    axisLineEditorLineAnchorWorld,
    setAxisLineEditorPivotWorld,
    applyAxisLineEditorAxisWorld,
    setAxisLineEditorGeometry,
    axisLineEditorPivotWorld,
    axisLineEditorAxisWorld,
    showCoordinateProbe,
    updateCoordReadout: updateCoordReadoutRef
  }, evt);
}

function bindAxisLineEditorPointerEvents() {
  bindAxisLineEditorPointerEventsRaw({
    rendererDom: renderer?.domElement || null,
    setAxisLineEditorBoundDom: (dom) => { axisLineEditorBoundDom = dom; },
    getAxisLineEditorBoundDom: () => axisLineEditorBoundDom,
    getAxisLineEditorActive: () => axisLineEditorActive,
    getCamera: () => camera,
    getAxisLineEditorMode: () => axisLineEditorMode,
    getAxisLineEditorDragging: () => axisLineEditorDragging,
    pickAxisLineFromPointerEvent,
    getAxisLineEditorPivotMarker: () => axisLineEditorPivotMarker,
    getAxisLineEditorHandle: () => axisLineEditorHandle,
    getAxisLineEditorNdcFromEvent,
    axisLineEditorPointer,
    axisLineEditorRaycaster,
    setAxisLineEditorDragging: (v) => { axisLineEditorDragging = !!v; },
    setAxisLineEditorDragKind: (v) => { axisLineEditorDragKind = String(v || ""); },
    getAxisLineEditorDragKind: () => axisLineEditorDragKind,
    axisLineEditorDragAxisWorld,
    axisLineEditorAxisWorld,
    getAxisLineEditorLinePinned: () => axisLineEditorLinePinned,
    axisLineEditorLineAnchorWorld,
    axisLineEditorPivotWorld,
    axisLineEditorDragLinePointWorld,
    axisLineEditorDragPlane,
    syncAxisLineEditorControlState,
    notifyAxisLineEditorState,
    getAxisLineEditorTargetState,
    setAxisLineEditorPivotWorld,
    setAxisLineEditorGeometry,
    applyAxisLineEditorAxisWorld
  });
}

function ensureAxisLineEditorGizmo() {
  ensureAxisLineEditorGizmoRaw({
    getAxisLineEditorGroup: () => axisLineEditorGroup,
    getScene: () => scene,
    setAxisLineEditorGroup: (v) => { axisLineEditorGroup = v; },
    setAxisLineEditorLine: (v) => { axisLineEditorLine = v; },
    setAxisLineEditorHandle: (v) => { axisLineEditorHandle = v; },
    setAxisLineEditorPivotMarker: (v) => { axisLineEditorPivotMarker = v; },
    updateAxisLineEditorModeVisuals
  });
}

function startAxisLineEditor(target) {
  startAxisLineEditorRaw({
    ensureAxisLineEditorGizmo,
    bindAxisLineEditorPointerEvents,
    target,
    setAxisLineEditorTarget: (v) => { axisLineEditorTarget = v; },
    setAxisLineEditorActive: (v) => { axisLineEditorActive = !!v; },
    setAxisLineEditorDragging: (v) => { axisLineEditorDragging = !!v; },
    setAxisLineEditorDragKind: (v) => { axisLineEditorDragKind = String(v || ""); },
    syncAxisLineEditorControlState,
    refreshAxisLineEditorFromRuntime,
    updateAxisLineEditorModeVisuals,
    getAxisLineEditorGroup: () => axisLineEditorGroup,
    notifyAxisLineEditorState
  });
}

function stopAxisLineEditor() {
  stopAxisLineEditorRaw({
    setAxisLineEditorActive: (v) => { axisLineEditorActive = !!v; },
    setAxisLineEditorDragging: (v) => { axisLineEditorDragging = !!v; },
    setAxisLineEditorDragKind: (v) => { axisLineEditorDragKind = String(v || ""); },
    setAxisLineEditorTarget: (v) => { axisLineEditorTarget = v; },
    setAxisLineEditorModeState: (v) => { axisLineEditorMode = v; },
    setAxisLineEditorLinePinnedState: (v) => { axisLineEditorLinePinned = !!v; },
    syncAxisLineEditorControlState,
    getAxisLineEditorGroup: () => axisLineEditorGroup,
    notifyAxisLineEditorState
  });
}

function showCoordinateProbe(worldPoint) {
  coordProbeVisualController.showCoordinateProbe(worldPoint);
}

function hideCoordinateProbe() {
  coordProbeVisualController.hideCoordinateProbe();
}

function updateAxisHelperFromSelectedJoint() {
  axisHelperController.updateAxisHelperFromSelectedJoint();
}

function refreshJointSelectionUI() {
  jointStates.forEach((state) => {
    if (state.cardEl) {
      state.cardEl.classList.toggle("is-selected", state === selectedJointState);
    }
    if (state.showAxisBtn) {
      state.showAxisBtn.textContent = state === selectedJointState ? "Hide Axis" : "Show Axis";
    }
  });
}

function setSelectedJointState(nextState) {
  selectedJointState = nextState || null;
  refreshJointSelectionUI();
  updateAxisHelperFromSelectedJoint();
  if (typeof coordProbeReadoutUpdater === "function") {
    coordProbeReadoutUpdater();
  }
  triggerDemoReadoutUpdate();
}

function syncJointPivotInputs(state) {
  const pivot = normalizePivotArray(state?.pivot, [0, 0, 0]);
  if (state.pivotXInput) state.pivotXInput.value = String(pivot[0]);
  if (state.pivotYInput) state.pivotYInput.value = String(pivot[1]);
  if (state.pivotZInput) state.pivotZInput.value = String(pivot[2]);
}

function applyJointPivot(state, pivotArray = null) {
  if (!state) return;

  const current = normalizePivotArray(state.pivot, [0, 0, 0]);
  const safe = normalizePivotArray(pivotArray, current);
  const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");
  state.pivot = safe;

  if (state.pivotGroup && state.targetGroup) {
    const pivotWorld = pivotSpace === "local"
      ? robotLocalToWorld(toVec3(safe))
      : toVec3(safe);
    setPivotKeepingWorld(state, pivotWorld);
    setJointRotationByPos(state, state.currentPos);
  }

  syncJointPivotInputs(state);
  if (state === selectedJointState) {
    updateAxisHelperFromSelectedJoint();
  }
}

function applyPresetGlobalSettings(preset, ui) {
  applyPresetGlobalSettingsRaw({
    preset,
    ui,
    getPositionPollIntervalMs: () => positionPollIntervalMs,
    getSliderAutoSendDelayMs: () => sliderAutoSendDelayMs,
    getGlobalRealtimeSendEnabled: () => globalRealtimeSendEnabled,
    setPositionPollIntervalMs: (v) => { positionPollIntervalMs = v; },
    setSliderAutoSendDelayMs: (v) => { sliderAutoSendDelayMs = v; },
    setGlobalRealtimeSendEnabled: (v) => { globalRealtimeSendEnabled = !!v; },
    clampInt,
    jointStates,
    restartPositionPolling
  });
}

function applyPresetJointToState(state, presetJoint) {
  applyPresetJointToStateRaw({
    state,
    presetJoint,
    defaultParentTargetForTarget,
    clampInt,
    clampNumber,
    normalizeCommandScale,
    estimateDefaultCommandScaleByJointRange,
    safeAxis,
    enforceMotionAxisLockOnState,
    cloneServoMapPoints,
    normalizeBacklashConfig,
    normalizePivotSpace,
    toFiniteNumber,
    normalizePivotArray,
    normalizeJointLimits,
    clampByGuard,
    getEffectiveJointAxisDisplayName,
    syncJointPivotInputs,
    syncJointRangeBounds,
    applyJointPivot,
    applyJointVisual,
    jointStates,
    getJointServoId,
    reachableServoIds,
    lastActualIdByQueryId,
    lastVoltageById,
    lastTempById
  });
}

function shouldRealtimeSend(state) {
  return shouldRealtimeSendRaw({
    globalRealtimeSendEnabled,
    state
  });
}

function scheduleRealtimeMove(state) {
  scheduleRealtimeMoveRaw({
    state,
    shouldRealtimeSend,
    sendMoveCommand,
    sliderAutoSendDelayMs
  });
}

function getJointCommandScale(state) {
  if (!state) return 1;
  const fallback = estimateDefaultCommandScaleByJointRange(state.minDeg, state.maxDeg);
  return normalizeCommandScale(state.commandScale, fallback);
}

function mapDesiredPosToCommandPos(state, desiredPos) {
  const targetPos = clampByGuard(state, desiredPos);
  const anchorPos = clampByGuard(state, state.defaultPos);
  const gain = getJointCommandScale(state);
  const scaledPos = clampByGuard(state, Math.round(anchorPos + (targetPos - anchorPos) * gain));
  return scaledPos;
}

function getMotionCommandController() {
  if (motionCommandController) return motionCommandController;
  motionCommandController = createMotionCommandController({
    getExpectedQueryId: () => expectedQueryId,
    setExpectedQueryId: (v) => { expectedQueryId = v; },
    send,
    buildPollIdList,
    getAutoPinConstraintReady: () => autoPinConstraintReady,
    getAutomaticPinConstraint: () => automaticPinConstraint,
    findJointStateByTarget,
    shouldRealtimeSend,
    getJointServoId,
    getJointPos,
    getJointTime,
    mapDesiredPosToCommandPos,
    compensateCommandPosByBacklash,
    jointStates,
    normalizeDerivedType,
    applyJointVisual
  });
  return motionCommandController;
}

 
function sendPhysicalDependentMoves(sourceState, time, silentWhenClosed = true) {
  getMotionCommandController().sendPhysicalDependentMoves(sourceState, time, silentWhenClosed);
}

function sendMoveCommand(state, { silentWhenClosed = true } = {}) {
  getMotionCommandController().sendMoveCommand(state, { silentWhenClosed });
}

function resetArmToDefaults({ silentWhenClosed = false } = {}) {
  getMotionCommandController().resetArmToDefaults({ silentWhenClosed });
}

function sendQueryById(id, silentWhenClosed = true) {
  return getMotionCommandController().sendQueryById(id, silentWhenClosed);
}

function scheduleQueryById(id, delayMs = 0) {
  getMotionCommandController().scheduleQueryById(id, delayMs);
}

function queryAllPositionsStaggered() {
  getMotionCommandController().queryAllPositionsStaggered();
}

function getPollingController() {
  if (pollingController) return pollingController;
  pollingController = createPollingController({
    stopPositionPolling: () => {
      const timer = pollTimer;
      if (timer) {
        clearInterval(timer);
        pollTimer = null;
      }
    },
    setPollCursor: (v) => { pollCursor = v; },
    isWsOpen,
    getJointStatesLength: () => jointStates.length,
    buildPollIdList,
    setPollTimer: (v) => { pollTimer = v; },
    getPollCursor: () => pollCursor,
    sendQueryById,
    send,
    getPositionPollIntervalMs: () => positionPollIntervalMs,
    getPollTimer: () => pollTimer
  });
  return pollingController;
}

function startPositionPolling() {
  getPollingController().startPositionPolling();
}

function stopPositionPolling() {
  getPollingController().stopPositionPolling();
}

function restartPositionPolling() {
  getPollingController().restartPositionPolling();
}

function initViewer() {
  const runtime = initViewerRuntime({
    viewerEl,
    ensureAxisHelper,
    updateAxisHelperFromSelectedJoint,
    refreshAxisLineEditorFromRuntime,
    getAxisLineEditorActive: () => axisLineEditorActive,
    getAxisLineEditorDragging: () => axisLineEditorDragging
  });
  scene = runtime.scene;
  camera = runtime.camera;
  renderer = runtime.renderer;
  controls = runtime.controls;
  displayRoot = runtime.displayRoot;
  stlLoader = runtime.stlLoader;
  return true;
}

function createRobotHierarchy(config = null) {
  const hierarchy = createRobotHierarchyStructure(config, {
    displayRoot,
    targetOrder: TARGET_ORDER,
    defaultParentTargetForTarget
  });
  robotRoot = hierarchy.robotRoot;
  groupsByTarget = hierarchy.groupsByTarget;
  meshGroupsByTarget = hierarchy.meshGroupsByTarget;
  pivotsByTarget = hierarchy.pivotsByTarget;

  meshMaterialByTarget.clear();
  baseMaterialColorByTarget.clear();
  baseMeshScaleByTarget.clear();
}

async function loadRobotMeshes(config) {
  return loadRobotMeshesRaw(config, {
    stlLoader,
    meshGroupsByTarget,
    meshMaterialByTarget,
    baseMaterialColorByTarget,
    baseMeshScaleByTarget,
    setViewerStatus,
    log
  });
}

function fitCameraToObject(object3d) {
  fitCameraToObjectRaw(camera, controls, object3d);
}

function setPlaneView(plane) {
  setPlaneViewRaw(plane, { camera, controls, displayRoot, robotRoot, log });
}

function resolveFrameCalibrationConfig(options = {}) {
  return resolveFrameCalibrationConfigRaw(loadedJointConfig, options, clampNumber);
}

function alignRobotFrameByJ1AndFront(options = {}) {
  return alignRobotFrameByJ1AndFrontRaw({
    displayRoot,
    robotRoot,
    resolveFrameCalibrationConfig,
    findJointStateByTarget,
    getJointAxisWorld,
    normalizePivotSpace,
    syncJointPivotInputs,
    loadedJointConfig,
    jointStates,
    findConfigJointIndex,
    normalizePivotArray,
    updateAxisHelperFromSelectedJoint,
    fitCameraToObject
  }, options);
}

function setPivotKeepingWorld(state, worldPivot) {
  setPivotKeepingWorldRaw(state, worldPivot);
}

function getStateMeshWorldBox(state) {
  return getStateMeshWorldBoxRaw(state);
}

function getTargetMeshWorldBox(target) {
  return getTargetMeshWorldBoxRaw({
    target,
    findJointStateByTarget,
    getStateMeshWorldBox,
    meshGroupsByTarget
  });
}

function inferJointPivotWorldByBoxes(parentBox, childBox) {
  return inferJointPivotWorldByBoxesRaw(parentBox, childBox);
}

function maybeAutoInferAssemblyPivots() {
  maybeAutoInferAssemblyPivotsRaw({
    assemblyLockRuntime,
    robotRoot,
    toFiniteNumber,
    jointStates,
    defaultParentTargetForTarget,
    getTargetMeshWorldBox,
    getStateMeshWorldBox,
    inferJointPivotWorldByBoxes,
    getJointPivotWorldFromState,
    syncJointPivotInputs,
    log
  });
}

function applyConfiguredPivots() {
  applyConfiguredPivotsRaw({
    robotRoot,
    isPhysicalKinematicsEnabled,
    jointStates,
    normalizePivotSpace,
    toVec3,
    worldToRobotLocal,
    applyJointPivot
  });
}

function createJointCard(state) {
  const built = buildJointCardLayout(state, { posToDeg, normalizePivotSpace });
  const card = built.card;
  initializeJointCardState({
    state,
    card,
    refs: built.refs,
    onHeaderClick: setSelectedJointState,
    enforceMotionAxisLockOnState,
    syncJointRangeBounds,
    syncJointPivotInputs,
    applyJointVisual
  });

  attachJointCardBehavior({
    state,
    refs: built.refs,
    jointStates,
    reachableServoIds,
    lastActualIdByQueryId,
    lastVoltageById,
    lastTempById,
    funcs: {
      clampInt,
      clampNumber,
      normalizeCommandScale,
      estimateDefaultCommandScaleByJointRange,
      safeAxis,
      normalizePivotArray,
      normalizePivotSpace,
      normalizeJointLimits,
      clampByGuard,
      shouldRealtimeSend,
      scheduleRealtimeMove,
      enforceMotionAxisLockOnState,
      getEffectiveJointAxisDisplayName,
      applyJointPivot,
      applyJointVisual,
      sendMoveCommand,
      setSelectedJointState,
      isSelectedJointState: (s) => selectedJointState === s,
      sendQueryById,
      send,
      getJointServoId,
      scheduleQueryById,
      updateJointTelemetry,
      worldToRobotLocal,
      syncJointRangeBounds
    }
  });
  return card;
}

function initServoPanel(states) {
  servoPanel.innerHTML = "";
  coordProbeReadoutUpdater = null;
  demoReadoutUpdater = null;

  const panelHeader = buildPanelHeader(FRONT_MINIMAL_MODE);

  const pollInput = createNumberInput(positionPollIntervalMs, 100, 3000, 10);
  const delayInput = createNumberInput(sliderAutoSendDelayMs, 20, 1200, 10);

  const globalRealtimeInput = document.createElement("input");
  globalRealtimeInput.type = "checkbox";
  globalRealtimeInput.checked = globalRealtimeSendEnabled;
  globalRealtimeInput.title = "When enabled, slider changes auto-send move commands after delay.";
  const panelToolsBuilt = buildPanelTools({
    frontMinimalMode: FRONT_MINIMAL_MODE,
    pollInput,
    delayInput,
    globalRealtimeInput
  });
  const panelTools = panelToolsBuilt.panelTools;
  const queryAllBtn = panelToolsBuilt.queryAllBtn;
  const defaultBtn = panelToolsBuilt.defaultBtn;
  const hardResetBtn = panelToolsBuilt.hardResetBtn;

  const viewToolsBuilt = buildViewTools();
  const viewTools = viewToolsBuilt.viewTools;
  const frontViewBtn = viewToolsBuilt.frontViewBtn;
  const sideViewBtn = viewToolsBuilt.sideViewBtn;
  const topViewBtn = viewToolsBuilt.topViewBtn;

  const presetToolsBuilt = buildPresetTools();
  const presetTools = presetToolsBuilt.presetTools;
  const presetSelect = presetToolsBuilt.presetSelect;
  const presetNameInput = presetToolsBuilt.presetNameInput;
  const savePresetBtn = presetToolsBuilt.savePresetBtn;
  const loadPresetBtn = presetToolsBuilt.loadPresetBtn;
  const loadSendPresetBtn = presetToolsBuilt.loadSendPresetBtn;
  const deletePresetBtn = presetToolsBuilt.deletePresetBtn;

  const configToolsBuilt = buildConfigTools();
  const configTools = configToolsBuilt.configTools;
  const bindJointConfigBtn = configToolsBuilt.bindJointConfigBtn;
  const writeSelectedJointBtn = configToolsBuilt.writeSelectedJointBtn;
  const writeAllJointsBtn = configToolsBuilt.writeAllJointsBtn;
  const downloadJointConfigBtn = configToolsBuilt.downloadJointConfigBtn;

  const coordToolsBuilt = buildCoordTools();
  const coordTools = coordToolsBuilt.coordTools;
  const coordSpaceSelect = coordToolsBuilt.coordSpaceSelect;
  const coordXInput = coordToolsBuilt.coordXInput;
  const coordYInput = coordToolsBuilt.coordYInput;
  const coordZInput = coordToolsBuilt.coordZInput;
  const locateCoordBtn = coordToolsBuilt.locateCoordBtn;
  const usePivotBtn = coordToolsBuilt.usePivotBtn;
  const hideCoordBtn = coordToolsBuilt.hideCoordBtn;
  const alignFrameBtn = coordToolsBuilt.alignFrameBtn;

  const physicalToolsBuilt = buildPhysicalTools();
  const physicalTools = physicalToolsBuilt.physicalTools;
  const physicalEnabledInput = physicalToolsBuilt.physicalEnabledInput;
  const physicalSpaceSelect = physicalToolsBuilt.physicalSpaceSelect;
  const physicalTargetSelect = physicalToolsBuilt.physicalTargetSelect;
  const physicalPivotXInput = physicalToolsBuilt.physicalPivotXInput;
  const physicalPivotYInput = physicalToolsBuilt.physicalPivotYInput;
  const physicalPivotZInput = physicalToolsBuilt.physicalPivotZInput;
  const physicalJ2LengthInput = physicalToolsBuilt.physicalJ2LengthInput;
  const physicalJ3LengthInput = physicalToolsBuilt.physicalJ3LengthInput;
  const physicalReloadBtn = physicalToolsBuilt.physicalReloadBtn;
  const physicalUseSelectedPivotBtn = physicalToolsBuilt.physicalUseSelectedPivotBtn;
  const physicalApplyBtn = physicalToolsBuilt.physicalApplyBtn;
  const axisTargetSelect = physicalToolsBuilt.axisTargetSelect;
  const axisDirXInput = physicalToolsBuilt.axisDirXInput;
  const axisDirYInput = physicalToolsBuilt.axisDirYInput;
  const axisDirZInput = physicalToolsBuilt.axisDirZInput;
  const axisReloadBtn = physicalToolsBuilt.axisReloadBtn;
  const axisApplyBtn = physicalToolsBuilt.axisApplyBtn;
  const axisShowBtn = physicalToolsBuilt.axisShowBtn;
  const axisDragBtn = physicalToolsBuilt.axisDragBtn;
  const axisPickBtn = physicalToolsBuilt.axisPickBtn;
  const axisPinBtn = physicalToolsBuilt.axisPinBtn;
  const axisSlideBtn = physicalToolsBuilt.axisSlideBtn;
  const getAxisLineEditorState = axisLineEditorStateAdapter.getAxisLineEditorState;
  const setAxisLineEditorOnAxisUpdated = axisLineEditorStateAdapter.setAxisLineEditorOnAxisUpdated;
  const setAxisLineEditorOnStateChanged = axisLineEditorStateAdapter.setAxisLineEditorOnStateChanged;

  const demoBuilt = buildDemoPanelBlock({
    demoRuntime,
    demoTrendWindowMs,
    demoTrendWindowOptions: DEMO_TREND_WINDOW_OPTIONS
  });
  const demoTools = demoBuilt.demoTools;
  const demoLegend = demoBuilt.demoLegend;
  const demoVisualGrid = demoBuilt.demoVisualGrid;
  const demoReadout = demoBuilt.demoReadout;
  const {
    demoEnabledInput,
    demoAutoFeaInput,
    demoElbowSelect,
    demoWristPitchInput,
    demoPayloadInput,
    demoTargetXInput,
    demoTargetYInput,
    demoTargetZInput,
    demoFromFkBtn,
    demoSolveIkBtn,
    demoRunFeaBtn,
    demoClearFeaBtn,
    demoReachBadge,
    demoFeaBadge,
    ikErrorMetric,
    stressJ2Metric,
    stressJ3Metric,
    stressJ4Metric,
    deformMetric,
    demoTrendTitle,
    demoTrendWindowSelect,
    demoTrendClearBtn,
    demoTrendCanvas
  } = demoBuilt.refs;

  const demoReadoutController = createDemoReadoutController({
    demoTrendTitle,
    demoTrendCanvas,
    demoReadout,
    demoReachBadge,
    demoFeaBadge,
    ikErrorMetric,
    stressJ2Metric,
    stressJ3Metric,
    stressJ4Metric,
    deformMetric,
    demoTargetXInput,
    demoTargetYInput,
    demoTargetZInput,
    demoWristPitchInput,
    demoPayloadInput,
    demoEnabledInput,
    demoAutoFeaInput,
    demoElbowSelect,
    demoRuntime,
    demoArmModel,
    assemblyLockRuntime,
    runDemoForwardFromCurrentPose,
    runDemoInverseKinematics,
    pushDemoTrendSample,
    drawDemoTrendChart,
    normalizeDemoTrendWindowMs,
    getTrendWindowMs: () => demoTrendWindowMs,
    clampNumber,
    toFiniteNumber,
    syncDemoRuntimeIntoLoadedConfig,
    updateDemoOverlay
  });
  const updateDemoTrendTitle = demoReadoutController.updateDemoTrendTitle;
  const setDemoTargetInput = demoReadoutController.setDemoTargetInput;
  const updateDemoReadout = demoReadoutController.updateDemoReadout;
  const commitDemoRuntimeFromInputs = demoReadoutController.commitDemoRuntimeFromInputs;
  updateDemoTrendTitle();

  demoReadoutUpdater = updateDemoReadout;
  drawDemoTrendChart(demoTrendCanvas);
  updateDemoReadout();

  const coordReadout = document.createElement("pre");
  coordReadout.className = "coord-readout";

  if (!supportsFileSystemAccess()) {
    bindJointConfigBtn.disabled = true;
  bindJointConfigBtn.title = "Bind a config file handle for one-click writes.";
  }

  const grid = document.createElement("div");
  grid.className = "joint-grid";
  states.forEach((state) => {
    if (state?.uiHidden === true) return;
    if (normalizeDerivedType(state?.derivedType) === "offset_minus_sum") return;
    const card = createJointCard(state);
    grid.appendChild(card);
  });

  if (selectedJointState && !states.includes(selectedJointState)) {
    selectedJointState = null;
  }
  refreshJointSelectionUI();
  updateAxisHelperFromSelectedJoint();

  const presetController = createPresetController({
    initialPresetList: readPresetList(),
    presetSelect,
    presetNameInput,
    loadPresetBtn,
    loadSendPresetBtn,
    deletePresetBtn,
    readPresetList,
    writePresetList,
    normalizePresetName,
    buildAutoPresetName,
    buildPresetRecord,
    applyPresetGlobalSettings,
    applyPresetJointToState,
    states,
    pollInput,
    delayInput,
    globalRealtimeInput,
    sendMoveCommand,
    maxCount: PRESET_MAX_COUNT,
    log
  });
  const refreshPresetOptions = presetController.refreshPresetOptions;
  const saveCurrentPreset = presetController.saveCurrentPreset;
  const applyPresetByName = presetController.applyPresetByName;
  const deletePresetByName = presetController.deletePresetByName;

  const writeJointConfig = async ({ selectedOnly = false } = {}) => {
    await writeJointConfigAction({
      selectedOnly,
      hasSelectedJoint: !!selectedJointState,
      collectWriteTargetStates,
      isWsOpen,
      readJointConfigViaGateway,
      writeJointConfigViaGateway,
      buildRuntimeJointConfig,
      cloneConfig,
      applyMotionLocksFromConfig,
      supportsFileSystemAccess,
      ensureJointConfigFileHandle,
      readJointConfigFromFileHandle,
      writeConfigToFileOrDownload,
      getJointConfigFileHandle: () => jointConfigFileHandle,
      setJointConfigFileHandle: (h) => { jointConfigFileHandle = h || jointConfigFileHandle; },
      loadedJointConfig,
      fallbackConfig: FALLBACK_CONFIG,
      setLoadedJointConfig: (cfg) => { loadedJointConfig = cfg; },
      log
    });
  };
  const coordProbeController = createCoordProbeController({
    coordReadout,
    coordSpaceSelect,
    coordXInput,
    coordYInput,
    coordZInput,
    locateCoordBtn,
    usePivotBtn,
    hideCoordBtn,
    alignFrameBtn,
    getCoordProbeLastWorldPoint: () => coordProbeLastWorldPoint,
    setCoordProbeReadoutUpdater: (fn) => {
      coordProbeReadoutUpdater = fn;
    },
    buildCoordinateSpaceGuideText,
    buildCoordinateProbeReport,
    convertPointFromSpaceToWorld,
    convertPointFromWorldToSpace,
    showCoordinateProbe,
    hideCoordinateProbe,
    normalizePivotSpace,
    toVec3,
    robotLocalToWorld,
    getSelectedJointState: () => selectedJointState,
    alignRobotFrameByJ1AndFront,
    clampNumber,
    log
  });
  const updateCoordReadout = coordProbeController.updateCoordReadout;
  const setProbeInputPoint = coordProbeController.setProbeInputPoint;
  updateCoordReadoutRef = updateCoordReadout;
  const physicalAxisController = createPhysicalAxisController({
    physicalEnabledInput,
    physicalSpaceSelect,
    physicalTargetSelect,
    physicalPivotXInput,
    physicalPivotYInput,
    physicalPivotZInput,
    physicalJ2LengthInput,
    physicalJ3LengthInput,
    physicalReloadBtn,
    physicalUseSelectedPivotBtn,
    physicalApplyBtn,
    axisTargetSelect,
    axisDirXInput,
    axisDirYInput,
    axisDirZInput,
    axisReloadBtn,
    axisApplyBtn,
    axisShowBtn,
    axisDragBtn,
    axisPickBtn,
    axisPinBtn,
    axisSlideBtn,
    getLoadedJointConfig: () => loadedJointConfig,
    setLoadedJointConfig: (cfg) => { loadedJointConfig = cfg; },
    fallbackConfig: FALLBACK_CONFIG,
    normalizePhysicalPointSpace,
    normalizeAxisVectorArray,
    safeAxis,
    normalizePivotArray,
    parseOptionalVec3,
    toFiniteNumber,
    clampNumber,
    toVec3,
    cloneConfig,
    findJointStateByTarget,
    getJointPivotWorldFromState,
    convertWorldPointToPhysicalSpace,
    robotLocalToWorld,
    worldToRobotLocal,
    getParentAxisVectorForTarget,
    setParentAxisVectorForTarget,
    ensurePhysicalKinematicsConfig,
    ensurePhysicalJointConfigEntry,
    applyMotionLocksFromConfig,
    applyJointPivot,
    applyJointVisual,
    initAutomaticPinConstraint,
    getAutoPinConstraintReady: () => autoPinConstraintReady,
    getAutomaticPinConstraint: () => automaticPinConstraint,
    applyAutomaticPinConstraint,
    updateAxisHelperFromSelectedJoint,
    getSelectedJointState: () => selectedJointState,
    setSelectedJointState,
    showCoordinateProbe,
    updateCoordReadout,
    getAxisLineEditorState,
    startAxisLineEditor,
    stopAxisLineEditor,
    setAxisLineEditorMode,
    setAxisLineEditorLinePinned,
    setAxisLineEditorOnAxisUpdated,
    setAxisLineEditorOnStateChanged,
    log
  });
  const pullPhysicalDraftFromConfig = physicalAxisController.pullPhysicalDraftFromConfig;
  const syncPhysicalInputsFromDraft = physicalAxisController.syncPhysicalInputsFromDraft;
  const syncAxisInputsFromRuntime = physicalAxisController.syncAxisInputsFromRuntime;
  const syncAxisEditorButtons = physicalAxisController.syncAxisEditorButtons;
  createDemoController({
    demoTrendWindowSelect,
    demoTrendClearBtn,
    demoEnabledInput,
    demoAutoFeaInput,
    demoElbowSelect,
    demoWristPitchInput,
    demoPayloadInput,
    demoTargetXInput,
    demoTargetYInput,
    demoTargetZInput,
    demoFromFkBtn,
    demoSolveIkBtn,
    demoRunFeaBtn,
    demoClearFeaBtn,
    getTrendWindowMs: () => demoTrendWindowMs,
    setTrendWindowMs: (v) => { demoTrendWindowMs = v; },
    normalizeDemoTrendWindowMs,
    trimDemoTrendHistory,
    updateDemoTrendTitle,
    drawDemoTrendChart,
    demoTrendCanvas,
    commitDemoRuntimeFromInputs,
    updateDemoReadout,
    demoRuntime,
    resetDemoTrendHistory,
    clearDemoFeaVisualization,
    runDemoFeaFromCurrentPose,
    runDemoForwardFromCurrentPose,
    runDemoInverseAndApply,
    setDemoTargetInput,
    toWorldPointFromRobotLocal: (point) => robotLocalToWorld(new THREE.Vector3(point.x, point.y, point.z)),
    showCoordinateProbe,
    updateCoordReadout,
    syncDemoRuntimeIntoLoadedConfig,
    log
  });
  bindServoPanelEvents({
    pollInput,
    delayInput,
    globalRealtimeInput,
    frontViewBtn,
    sideViewBtn,
    topViewBtn,
    bindJointConfigBtn,
    writeSelectedJointBtn,
    writeAllJointsBtn,
    downloadJointConfigBtn,
    presetSelect,
    presetNameInput,
    savePresetBtn,
    loadPresetBtn,
    loadSendPresetBtn,
    deletePresetBtn,
    queryAllBtn,
    defaultBtn,
    hardResetBtn,
    setPositionPollIntervalMs: (v) => { positionPollIntervalMs = v; },
    getPositionPollIntervalMs: () => positionPollIntervalMs,
    clampInt,
    restartPositionPolling,
    setSliderAutoSendDelayMs: (v) => { sliderAutoSendDelayMs = v; },
    getSliderAutoSendDelayMs: () => sliderAutoSendDelayMs,
    setGlobalRealtimeSendEnabled: (v) => { globalRealtimeSendEnabled = !!v; },
    clearAutoSendTimers: () => {
      states.forEach((state) => {
        if (state.autoSendTimer) {
          clearTimeout(state.autoSendTimer);
          state.autoSendTimer = null;
        }
      });
    },
    setPlaneView,
    bindJointConfigFileHandle,
    writeJointConfig,
    collectWriteTargetStates,
    buildRuntimeJointConfig,
    serializeConfig,
    downloadConfigFile,
    cloneConfig,
    applyMotionLocksFromConfig,
    setLoadedJointConfig: (cfg) => { loadedJointConfig = cfg; },
    normalizePresetName,
    saveCurrentPreset,
    applyPresetByName,
    deletePresetByName,
    queryAllPositionsStaggered,
    buildPollIdList,
    send,
    states,
    applyJointVisual,
    shouldRealtimeSend,
    sendMoveCommand,
    resetArmToDefaults,
    getJointStatesLength: () => jointStates.length,
    log
  });

  pullPhysicalDraftFromConfig();
  syncPhysicalInputsFromDraft();
  syncAxisInputsFromRuntime();
  syncAxisEditorButtons();
  commitDemoRuntimeFromInputs({ syncTarget: true });
  if (demoRuntime.enabled && demoRuntime.autoFea) {
    runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
  } else if (!demoRuntime.enabled) {
    clearDemoFeaVisualization();
  }
  updateDemoReadout();
  refreshPresetOptions();

  renderServoPanelLayout({
    frontMinimalMode: FRONT_MINIMAL_MODE,
    servoPanel,
    panelHeader,
    panelTools,
    viewTools,
    configTools,
    presetTools,
    coordTools,
    coordReadout,
    physicalTools,
    demoTools,
    demoLegend,
    demoVisualGrid,
    demoReadout,
    grid,
    createPanelSection
  });
  replaceMojibakeInDom(servoPanel);
}

function buildServoPanelFallback(error) {
  buildServoPanelFallbackView({
    servoPanel,
    renderServoPanelSafely,
    jointStates,
    error
  });
}

function renderServoPanelSafely(states = jointStates) {
  try {
    initServoPanel(states);
    if (!servoPanel || servoPanel.childElementCount === 0) {
      throw new Error("servoPanel rendered empty");
    }
    return true;
  } catch (error) {
    log("initServoPanel failed", { error: String(error) });
    buildServoPanelFallback(error);
    return false;
  }
}

function initJointStates(config) {
  initJointStatesRaw({
    config,
    jointStates,
    reachableServoIds,
    noPosMuteUntilById,
    lastActualIdByQueryId,
    lastVoltageById,
    lastTempById,
    setExpectedQueryId: (v) => { expectedQueryId = v; },
    normalizePivotSpace,
    toRobotLocalFromConfigPoint,
    parseOptionalVec3,
    defaultParentTargetForTarget,
    normalizeDerivedType,
    toFiniteNumber,
    clampInt,
    safeAxis,
    normalizeCommandScale,
    estimateDefaultCommandScaleByJointRange,
    normalizeBacklashConfig,
    normalizeJointLimits,
    enforceMotionAxisLockOnState,
    parseServoMapPoints,
    normalizePivotArray,
    clampByGuard,
    pivotsByTarget,
    groupsByTarget,
    meshGroupsByTarget
  });
}

function applyAllDefaultJointPoses() {
  jointStates.forEach((state) => {
    applyJointVisual(state, state.defaultPos);
  });
}

function handleGatewayMessage(msg) {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "gateway_status") {
    const serialOpen = msg.serialOpen === true;
    const portText = msg.port ? ` (${msg.port})` : "";
    updateStatus(serialOpen ? `connected${portText}` : `connected / serial closed${portText}`);
    if (!serialOpen) {
      log("Gateway connected, but serial is not open.");
    }
    return;
  }

  if (msg.type !== "mcu" || !msg.parsed) return;

  const parsed = msg.parsed;
  if (parsed.type === "position" && Number.isFinite(parsed.id) && Number.isFinite(parsed.pos)) {
    reachableServoIds.add(parsed.id);
    noPosMuteUntilById.delete(parsed.id);
    expectedQueryId = null;

    const state = findJointStateByServoId(parsed.id);
    if (state) {
      applyJointVisual(state, parsed.pos);
    }
    return;
  }

  if (parsed.type === "vin" && Number.isFinite(parsed.id) && Number.isFinite(parsed.mv)) {
    lastVoltageById.set(parsed.id, parsed.mv);
    const state = findJointStateByServoId(parsed.id);
    if (state) {
      updateJointTelemetry(state);
    }
    return;
  }

  if (parsed.type === "temp" && Number.isFinite(parsed.id) && Number.isFinite(parsed.celsius)) {
    lastTempById.set(parsed.id, parsed.celsius);
    const state = findJointStateByServoId(parsed.id);
    if (state) {
      updateJointTelemetry(state);
    }
    return;
  }

  if (parsed.type === "actual_id" && Number.isFinite(parsed.id) && Number.isFinite(parsed.actualId)) {
    lastActualIdByQueryId.set(parsed.id, parsed.actualId);
    const state = findJointStateByServoId(parsed.id);
    if (state) {
      updateJointTelemetry(state);
    }
    return;
  }

  if (parsed.type === "error" && parsed.code === "NO_POS") {
    if (Number.isFinite(expectedQueryId)) {
      reachableServoIds.delete(expectedQueryId);
      noPosMuteUntilById.set(expectedQueryId, Date.now() + 4000);
    }
    expectedQueryId = null;
  }
}

async function loadJointConfig() {
  try {
    const res = await fetch("./joints.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const config = await res.json();
    if (!config || !Array.isArray(config.joints)) {
      throw new Error("joints.json missing joints[]");
    }

    return config;
  } catch (error) {
    log("Failed to read joints.json, use fallback", { error: String(error) });
    return FALLBACK_CONFIG;
  }
}

if (togglePanelBtn) {
  togglePanelBtn.addEventListener("click", () => {
    const visibleNow = !panelCardEl || !panelCardEl.classList.contains("is-hidden");
    setDebugPanelVisible(!visibleNow);
    if (!visibleNow && servoPanel && servoPanel.childElementCount === 0 && jointStates.length > 0) {
      renderServoPanelSafely(jointStates);
    }
  });
}

if (refreshPanelBtn) {
  refreshPanelBtn.addEventListener("click", () => {
    if (!jointStates.length) {
      log("Panel not ready yet, please retry in a moment.");
      return;
    }
    renderServoPanelSafely(jointStates);
    setDebugPanelVisible(true);
    log("Debug panel refreshed.");
  });
}

if (connectBtn && wsUrlInput) {
  connectBtn.addEventListener("click", () => {
    const url = wsUrlInput.value.trim();
    if (!url) return;

    if (ws) {
      clearPendingGatewayRequests("WebSocket reconnecting");
      ws.close();
      ws = null;
    }

    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      updateStatus(`connected (${url})`);
      log("WebSocket connected", { url });
      send({ type: "ping" }, true);
      queryAllPositionsStaggered();
      startPositionPolling();
    });

    ws.addEventListener("close", () => {
      updateStatus("disconnected");
      log("WebSocket disconnected");
      expectedQueryId = null;
      clearPendingGatewayRequests("WebSocket closed");
      stopPositionPolling();
    });

    ws.addEventListener("error", () => {
      updateStatus("connection error");
      log("WebSocket error");
      expectedQueryId = null;
      clearPendingGatewayRequests("WebSocket error");
      stopPositionPolling();
    });

    ws.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (consumeGatewayRequestReply(msg)) {
          log("RX", msg);
          return;
        }
        const needLog = shouldLogGatewayMessage(msg);
        handleGatewayMessage(msg);
        if (needLog) {
          log("RX", msg);
        }
      } catch {
        log("RX(raw)", { data: evt.data });
      }
    });
  });
} else {
  console.error("UI init warning: connectBtn/wsUrl not found.");
}

if (pingBtn) {
  pingBtn.addEventListener("click", () => {
    send({ type: "ping" }, false);
  });
}

async function boot() {
  const viewerReady = initViewer();
  const config = await loadJointConfig();
  loadedJointConfig = cloneConfig(config);
  log("structure snapshot", {
    targetOrder: TARGET_ORDER.slice(),
    jointCount: Array.isArray(config?.joints) ? config.joints.length : 0,
    activeControls: Array.isArray(config?.joints)
      ? config.joints.map((j) => String(j?.target || "")).filter(Boolean)
      : [],
    partTargets: Array.isArray(config?.parts)
      ? config.parts.map((p) => String(p?.target || "")).filter(Boolean)
      : []
  });
  applyAssemblyLockFromConfig(loadedJointConfig);
  applyMotionLocksFromConfig(loadedJointConfig);
  setDemoRuntimeDefaultsFromConfig(loadedJointConfig);
  syncDemoRuntimeIntoLoadedConfig();
  if (assemblyLockRuntime.enabled) {
    log("Assembly lock mode enabled", {
      disableCouplings: assemblyLockRuntime.disableCouplings,
      autoInferPivots: assemblyLockRuntime.autoInferPivots,
      maxAutoShiftMm: assemblyLockRuntime.maxAutoShiftMm,
      source: assemblyLockRuntime.source || "",
      note: assemblyLockRuntime.note || ""
    });
  }

  if (!viewerReady) {
    initJointStates(config);
    renderServoPanelSafely(jointStates);
    return;
  }

  setViewerStatus("loading models...");
  createRobotHierarchy(config);
  initJointStates(config);
  renderServoPanelSafely(jointStates);

  const { loaded, failed, loadedByTarget } = await loadRobotMeshes(config);

  if (loaded > 0) {
    const box = new THREE.Box3().setFromObject(robotRoot);
    const center = box.getCenter(new THREE.Vector3());
    displayRoot.position.set(-center.x, -box.min.y, -center.z);
    fitCameraToObject(displayRoot);
    setViewerStatus(`loaded ${loaded} STL${failed ? `, failed ${failed}` : ""}`);
    log("mesh load summary", {
      loaded,
      failed,
      loadedByTarget: loadedByTarget || {}
    });
  } else {
    setViewerStatus("no STL loaded, check static file paths");
  }

  // Important: apply configured pivots after displayRoot recentering.
  // Otherwise "world-space pivots" from joints.json will be offset at initial load.
  maybeAutoInferAssemblyPivots();
  applyConfiguredPivots();
  const alignResult = alignRobotFrameByJ1AndFront();
  if (alignResult?.ok) {
    log("auto frame aligned", alignResult);
  } else {
    log("auto frame align skipped", { error: String(alignResult?.error || "unknown") });
  }
  initAutomaticPinConstraint();
  applyAllDefaultJointPoses();
}

window.addEventListener("error", (evt) => {
  const msg = evt?.error?.stack || evt?.message || "unknown window error";
  log("window error", { message: String(msg) });
});

window.addEventListener("unhandledrejection", (evt) => {
  const reason = evt?.reason;
  const msg = reason?.stack || reason?.message || String(reason || "unknown rejection");
  log("unhandled rejection", { message: String(msg) });
});

try {
  updateStatus("not connected");
  setViewerStatus("not loaded");
  setDebugPanelVisible(true);
  replaceMojibakeInDom(document.body);
  log("panel ready");
  log("ui build", { stamp: UI_BUILD_STAMP });
  Promise.resolve(boot()).catch((error) => {
    log("boot failed", { error: String(error?.stack || error?.message || error) });
  });
} catch (error) {
  log("fatal init failed", { error: String(error?.stack || error?.message || error) });
}





