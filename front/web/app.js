import * as THREE from "./vendor/three/three.module.js?v=20260515-232131";
import { OrbitControls } from "./vendor/three/jsm/controls/OrbitControls.js?v=20260515-232131";
import { STLLoader } from "./vendor/three/jsm/loaders/STLLoader.js?v=20260515-232131";
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
  createSelectInput,
  createControlField,
  setControlFieldLabels,
  replaceMojibakeInDom,
  createChip,
  createPanelSection
} from "./modules/app_panel_ui.js?v=20260518-035000";
import { buildJointCardLayout } from "./modules/app_joint_card_layout.js?v=20260518-041500";
import { attachJointCardBehavior } from "./modules/app_joint_card_bindings.js?v=20260518-043500";
import {
  buildPanelHeader,
  buildPanelTools,
  buildViewTools,
  buildPresetTools,
  buildConfigTools
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

const gatewayBridge = createGatewayBridge({
  getWs: () => ws,
  log: (message, obj) => log(message, obj)
});

function log(message, obj) {
  const ts = new Date().toLocaleTimeString();
  const safeMessage = sanitizePossibleMojibakeText(message);
  const line = obj ? `[${ts}] ${safeMessage} ${JSON.stringify(obj)}` : `[${ts}] ${safeMessage}`;
  if (logEl) {
    logEl.textContent = `${line}\n${logEl.textContent}`;
  } else {
    console.log(line);
  }
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
  if (axisHelperGroup || !scene) return;

  axisHelperGroup = new THREE.Group();
  axisHelperGroup.visible = false;

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xa8ff2f,
    transparent: true,
    opacity: 0.92,
    depthTest: false
  });

  axisHelperLine = new THREE.Line(lineGeometry, lineMaterial);
  axisHelperLine.renderOrder = 1200;

  const markerGeometry = new THREE.SphereGeometry(4, 16, 16);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ccff,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  axisHelperPivotMarker = new THREE.Mesh(markerGeometry, markerMaterial);
  axisHelperPivotMarker.renderOrder = 1201;

  axisHelperGroup.add(axisHelperLine);
  axisHelperGroup.add(axisHelperPivotMarker);
  scene.add(axisHelperGroup);
}

function notifyAxisLineEditorState() {
  if (typeof axisLineEditorOnStateChanged === "function") {
    axisLineEditorOnStateChanged({
      active: axisLineEditorActive,
      target: axisLineEditorTarget,
      mode: axisLineEditorMode,
      linePinned: axisLineEditorLinePinned,
      dragging: axisLineEditorDragging
    });
  }
}

function updateAxisLineEditorModeVisuals() {
  if (!axisLineEditorLine || !axisLineEditorHandle || !axisLineEditorPivotMarker) return;

  const lineMat = axisLineEditorLine.material;
  const handleMat = axisLineEditorHandle.material;
  const pivotMat = axisLineEditorPivotMarker.material;

  if (axisLineEditorMode === "pick") {
    if (lineMat?.color?.setHex) lineMat.color.setHex(0xffc857);
    if (handleMat?.color?.setHex) handleMat.color.setHex(0xffc857);
    if (pivotMat?.color?.setHex) pivotMat.color.setHex(0xfff0a8);
    axisLineEditorHandle.visible = false;
    return;
  }

  if (axisLineEditorMode === "pivot_slide") {
    if (lineMat?.color?.setHex) lineMat.color.setHex(0x68d7ff);
    if (handleMat?.color?.setHex) handleMat.color.setHex(0xff3f9f);
    if (pivotMat?.color?.setHex) pivotMat.color.setHex(0x40ffd0);
    axisLineEditorHandle.visible = false;
    return;
  }

  if (lineMat?.color?.setHex) lineMat.color.setHex(0xff6ad5);
  if (handleMat?.color?.setHex) handleMat.color.setHex(0xff3f9f);
  if (pivotMat?.color?.setHex) pivotMat.color.setHex(0xffffff);
  axisLineEditorHandle.visible = true;
}

function syncAxisLineEditorControlState() {
  if (!controls) return;
  const lockOrbitForPick = axisLineEditorActive && axisLineEditorMode === "pick";
  controls.enabled = !(axisLineEditorDragging || lockOrbitForPick);
}

function setAxisLineEditorMode(mode = "direction") {
  const normalized = mode === "pick" || mode === "pivot_slide" ? mode : "direction";
  axisLineEditorMode = normalized;
  updateAxisLineEditorModeVisuals();
  if (axisLineEditorActive) {
    setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
  }
  syncAxisLineEditorControlState();
  notifyAxisLineEditorState();
}

function setAxisLineEditorLinePinned(pinned) {
  axisLineEditorLinePinned = pinned === true;
  if (axisLineEditorLinePinned) {
    axisLineEditorLineAnchorWorld.copy(axisLineEditorPivotWorld);
  }
  if (axisLineEditorActive) {
    setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
  }
  notifyAxisLineEditorState();
}

function setAxisLineEditorGeometry(pivotWorld, axisWorld) {
  if (!axisLineEditorLine || !axisLineEditorHandle || !axisLineEditorPivotMarker) return;
  const normalizedAxis = axisWorld.clone();
  if (normalizedAxis.lengthSq() < 1e-10) {
    normalizedAxis.set(1, 0, 0);
  }
  normalizedAxis.normalize();
  const lineCenter = axisLineEditorLinePinned
    ? axisLineEditorLineAnchorWorld
    : pivotWorld;
  const halfLen = Math.max(40, toFiniteNumber(axisLineEditorLength, 150));
  const p1 = lineCenter.clone().addScaledVector(normalizedAxis, halfLen);
  const p2 = lineCenter.clone().addScaledVector(normalizedAxis, -halfLen);

  const posAttr = axisLineEditorLine.geometry.getAttribute("position");
  posAttr.setXYZ(0, p1.x, p1.y, p1.z);
  posAttr.setXYZ(1, p2.x, p2.y, p2.z);
  posAttr.needsUpdate = true;
  axisLineEditorLine.geometry.computeBoundingSphere();

  axisLineEditorHandle.position.copy(p1);
  axisLineEditorPivotMarker.position.copy(pivotWorld);
}

function refreshAxisLineEditorFromRuntime() {
  if (!axisLineEditorActive || !axisLineEditorGroup) return;
  const target = String(axisLineEditorTarget || "");
  const state = findJointStateByTarget(target);
  if (!state?.pivotGroup) {
    axisLineEditorGroup.visible = false;
    return;
  }
  const pivotWorld = state.pivotGroup.getWorldPosition(new THREE.Vector3());
  const axisParent = getParentAxisVectorForTarget(target);
  const axisWorld = new THREE.Vector3(axisParent[0], axisParent[1], axisParent[2]);
  if (state.pivotGroup.parent) {
    state.pivotGroup.parent.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion();
    state.pivotGroup.parent.getWorldQuaternion(q);
    axisWorld.applyQuaternion(q);
  }
  if (axisWorld.lengthSq() < 1e-10) {
    axisWorld.set(1, 0, 0);
  }
  axisWorld.normalize();
  axisLineEditorLength = getJointAxisDisplayLength(state);

  axisLineEditorPivotWorld.copy(pivotWorld);
  if (!axisLineEditorLinePinned) {
    axisLineEditorLineAnchorWorld.copy(pivotWorld);
  }
  axisLineEditorAxisWorld.copy(axisWorld);
  updateAxisLineEditorModeVisuals();
  setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
  axisLineEditorGroup.visible = true;
}

function getAxisLineEditorNdcFromEvent(evt) {
  if (!renderer?.domElement) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
}

function getAxisLineEditorTargetState() {
  const target = String(axisLineEditorTarget || "");
  if (!target) {
    return { target: "", state: null };
  }
  return { target, state: findJointStateByTarget(target) };
}

function collectAxisLineEditorPickMeshes(target) {
  const unique = new Set();
  const meshes = [];
  const pushFromRoot = (root) => {
    if (!root) return;
    root.traverse((obj) => {
      if (!obj || obj.isMesh !== true || obj.visible === false) return;
      if (unique.has(obj)) return;
      unique.add(obj);
      meshes.push(obj);
    });
  };

  const state = findJointStateByTarget(target);
  pushFromRoot(state?.meshGroup || meshGroupsByTarget?.[target] || null);

  if (meshes.length > 0) {
    return meshes;
  }

  Object.values(meshGroupsByTarget || {}).forEach((root) => {
    pushFromRoot(root);
  });
  return meshes;
}

function getAxisLineEditorWorldNormalFromHit(hit) {
  if (!hit?.face || !hit?.object) return null;

  const worldNormal = hit.face.normal.clone();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  worldNormal.applyMatrix3(normalMatrix);
  if (worldNormal.lengthSq() < 1e-10) {
    return null;
  }
  worldNormal.normalize();

  const box = new THREE.Box3().setFromObject(hit.object);
  if (!box.isEmpty() && hit.point) {
    const center = box.getCenter(new THREE.Vector3());
    const radial = hit.point.clone().sub(center);
    if (radial.lengthSq() > 1e-10 && worldNormal.dot(radial) < 0) {
      worldNormal.multiplyScalar(-1);
    }
  }

  return worldNormal.normalize();
}

function applyAxisLineEditorAxisWorld(target, axisWorld) {
  const state = findJointStateByTarget(target);
  if (!state) return false;

  const safeAxis = axisWorld.clone();
  if (safeAxis.lengthSq() < 1e-10) return false;
  safeAxis.normalize();
  axisLineEditorAxisWorld.copy(safeAxis);

  const axisParent = safeAxis.clone();
  if (state.pivotGroup?.parent) {
    state.pivotGroup.parent.updateWorldMatrix(true, false);
    const parentQ = new THREE.Quaternion();
    state.pivotGroup.parent.getWorldQuaternion(parentQ);
    axisParent.applyQuaternion(parentQ.invert());
  }
  if (axisParent.lengthSq() < 1e-10) return false;
  axisParent.normalize();

  if (typeof axisLineEditorOnAxisUpdated === "function") {
    axisLineEditorOnAxisUpdated([axisParent.x, axisParent.y, axisParent.z], target);
  }
  return true;
}

function setAxisLineEditorPivotWorld(target, pivotWorld) {
  const state = findJointStateByTarget(target);
  if (!state) return false;

  const worldPoint = pivotWorld.clone();
  const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");
  const storedPoint = pivotSpace === "local" ? worldToRobotLocal(worldPoint) : worldPoint;
  applyJointPivot(state, [storedPoint.x, storedPoint.y, storedPoint.z]);

  if (state.pivotGroup) {
    axisLineEditorPivotWorld.copy(state.pivotGroup.getWorldPosition(new THREE.Vector3()));
  } else {
    axisLineEditorPivotWorld.copy(worldPoint);
  }

  if (!axisLineEditorLinePinned) {
    axisLineEditorLineAnchorWorld.copy(axisLineEditorPivotWorld);
  }
  return true;
}

function pickAxisLineFromPointerEvent(evt) {
  if (!axisLineEditorActive || !camera) return false;
  const { target, state } = getAxisLineEditorTargetState();
  if (!state) return false;

  const ndc = getAxisLineEditorNdcFromEvent(evt);
  if (!ndc) return false;
  axisLineEditorPointer.set(ndc.x, ndc.y);
  axisLineEditorRaycaster.setFromCamera(axisLineEditorPointer, camera);

  const candidates = collectAxisLineEditorPickMeshes(target);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    log("Axis pick failed: no mesh candidate", { target });
    return false;
  }

  const hit = axisLineEditorRaycaster.intersectObjects(candidates, true)?.[0] || null;
  if (!hit?.point) {
    return false;
  }

  const outward = getAxisLineEditorWorldNormalFromHit(hit);
  const inward = outward
    ? outward.multiplyScalar(-1)
    : camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1);
  if (inward.lengthSq() < 1e-10) {
    inward.set(1, 0, 0);
  }
  inward.normalize();

  axisLineEditorLineAnchorWorld.copy(hit.point);
  if (!setAxisLineEditorPivotWorld(target, hit.point)) {
    return false;
  }
  applyAxisLineEditorAxisWorld(target, inward);
  setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);

  showCoordinateProbe(axisLineEditorPivotWorld);
  updateCoordReadout(axisLineEditorPivotWorld, "world");
  log("Axis generated from point pick (outside->inside)", {
    target,
    pivotWorld: [
      Number(axisLineEditorPivotWorld.x.toFixed(3)),
      Number(axisLineEditorPivotWorld.y.toFixed(3)),
      Number(axisLineEditorPivotWorld.z.toFixed(3))
    ],
    axisWorld: [
      Number(axisLineEditorAxisWorld.x.toFixed(4)),
      Number(axisLineEditorAxisWorld.y.toFixed(4)),
      Number(axisLineEditorAxisWorld.z.toFixed(4))
    ]
  });
  return true;
}

function bindAxisLineEditorPointerEvents() {
  if (!renderer?.domElement) return;
  if (axisLineEditorBoundDom === renderer.domElement) return;

  const dom = renderer.domElement;
  const onPointerDown = (evt) => {
    if (!axisLineEditorActive || !camera) return;

    if (axisLineEditorMode === "pick") {
      const picked = pickAxisLineFromPointerEvent(evt);
      if (picked) {
        evt.preventDefault();
        evt.stopPropagation();
      }
      return;
    }

    const dragObject = axisLineEditorMode === "pivot_slide"
      ? axisLineEditorPivotMarker
      : axisLineEditorHandle;
    if (!dragObject) return;

    const ndc = getAxisLineEditorNdcFromEvent(evt);
    if (!ndc) return;
    axisLineEditorPointer.set(ndc.x, ndc.y);
    axisLineEditorRaycaster.setFromCamera(axisLineEditorPointer, camera);
    const hit = axisLineEditorRaycaster.intersectObject(dragObject, true);
    if (!hit || hit.length === 0) return;

    axisLineEditorDragging = true;
    axisLineEditorDragKind = axisLineEditorMode === "pivot_slide" ? "pivot" : "direction";
    if (axisLineEditorDragKind === "pivot") {
      axisLineEditorDragAxisWorld.copy(axisLineEditorAxisWorld);
      if (axisLineEditorDragAxisWorld.lengthSq() < 1e-10) {
        axisLineEditorDragAxisWorld.set(1, 0, 0);
      }
      axisLineEditorDragAxisWorld.normalize();
      axisLineEditorDragLinePointWorld.copy(
        axisLineEditorLinePinned ? axisLineEditorLineAnchorWorld : axisLineEditorPivotWorld
      );

      const cameraDir = camera.getWorldDirection(new THREE.Vector3()).normalize();
      const planeNormal = new THREE.Vector3().crossVectors(cameraDir, axisLineEditorDragAxisWorld);
      if (planeNormal.lengthSq() < 1e-10) {
        planeNormal.crossVectors(new THREE.Vector3(0, 1, 0), axisLineEditorDragAxisWorld);
      }
      if (planeNormal.lengthSq() < 1e-10) {
        planeNormal.crossVectors(new THREE.Vector3(1, 0, 0), axisLineEditorDragAxisWorld);
      }
      if (planeNormal.lengthSq() < 1e-10) {
        planeNormal.set(0, 0, 1);
      }
      planeNormal.normalize();
      axisLineEditorDragPlane.setFromNormalAndCoplanarPoint(planeNormal, axisLineEditorDragLinePointWorld);
    }

    syncAxisLineEditorControlState();
    notifyAxisLineEditorState();
    try { dom.setPointerCapture(evt.pointerId); } catch {}
    evt.preventDefault();
    evt.stopPropagation();
  };

  const onPointerMove = (evt) => {
    if (!axisLineEditorActive || !axisLineEditorDragging || !camera) return;
    const ndc = getAxisLineEditorNdcFromEvent(evt);
    if (!ndc) return;
    axisLineEditorPointer.set(ndc.x, ndc.y);
    axisLineEditorRaycaster.setFromCamera(axisLineEditorPointer, camera);

    const { target, state } = getAxisLineEditorTargetState();
    if (!state) return;

    if (axisLineEditorDragKind === "pivot") {
      const hitWorld = new THREE.Vector3();
      const ok = axisLineEditorRaycaster.ray.intersectPlane(axisLineEditorDragPlane, hitWorld);
      if (!ok) return;

      const t = hitWorld.clone().sub(axisLineEditorDragLinePointWorld).dot(axisLineEditorDragAxisWorld);
      const projected = axisLineEditorDragLinePointWorld.clone().addScaledVector(axisLineEditorDragAxisWorld, t);
      if (!setAxisLineEditorPivotWorld(target, projected)) return;
      setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
      evt.preventDefault();
      return;
    }

    const planeNormal = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const linePoint = axisLineEditorLinePinned ? axisLineEditorLineAnchorWorld : axisLineEditorPivotWorld;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, linePoint);
    const hitWorld = new THREE.Vector3();
    const ok = axisLineEditorRaycaster.ray.intersectPlane(plane, hitWorld);
    if (!ok) return;

    const axisWorld = hitWorld.sub(linePoint);
    if (axisWorld.lengthSq() < 1e-10) return;
    axisWorld.normalize();
    axisLineEditorAxisWorld.copy(axisWorld);
    setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);

    applyAxisLineEditorAxisWorld(target, axisWorld);
    evt.preventDefault();
  };

  const endDrag = (evt) => {
    if (!axisLineEditorDragging) return;
    axisLineEditorDragging = false;
    axisLineEditorDragKind = "";
    syncAxisLineEditorControlState();
    notifyAxisLineEditorState();
    try { dom.releasePointerCapture(evt.pointerId); } catch {}
  };

  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerup", endDrag);
  dom.addEventListener("pointercancel", endDrag);
  axisLineEditorBoundDom = dom;
}

function ensureAxisLineEditorGizmo() {
  if (axisLineEditorGroup || !scene) return;
  axisLineEditorGroup = new THREE.Group();
  axisLineEditorGroup.visible = false;

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff6ad5,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  axisLineEditorLine = new THREE.Line(lineGeometry, lineMaterial);
  axisLineEditorLine.renderOrder = 1300;

  const handleGeometry = new THREE.SphereGeometry(6, 20, 20);
  const handleMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3f9f,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  axisLineEditorHandle = new THREE.Mesh(handleGeometry, handleMaterial);
  axisLineEditorHandle.renderOrder = 1301;

  const pivotGeometry = new THREE.SphereGeometry(4, 16, 16);
  const pivotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  axisLineEditorPivotMarker = new THREE.Mesh(pivotGeometry, pivotMaterial);
  axisLineEditorPivotMarker.renderOrder = 1302;

  axisLineEditorGroup.add(axisLineEditorLine);
  axisLineEditorGroup.add(axisLineEditorHandle);
  axisLineEditorGroup.add(axisLineEditorPivotMarker);
  scene.add(axisLineEditorGroup);
  updateAxisLineEditorModeVisuals();
}

function startAxisLineEditor(target) {
  ensureAxisLineEditorGizmo();
  bindAxisLineEditorPointerEvents();
  axisLineEditorTarget = String(target || "");
  axisLineEditorActive = !!axisLineEditorTarget;
  axisLineEditorDragging = false;
  axisLineEditorDragKind = "";
  syncAxisLineEditorControlState();
  refreshAxisLineEditorFromRuntime();
  updateAxisLineEditorModeVisuals();
  if (axisLineEditorGroup) axisLineEditorGroup.visible = axisLineEditorActive;
  notifyAxisLineEditorState();
}

function stopAxisLineEditor() {
  axisLineEditorActive = false;
  axisLineEditorDragging = false;
  axisLineEditorDragKind = "";
  axisLineEditorTarget = "";
  axisLineEditorMode = "direction";
  axisLineEditorLinePinned = false;
  syncAxisLineEditorControlState();
  if (axisLineEditorGroup) axisLineEditorGroup.visible = false;
  notifyAxisLineEditorState();
}

function ensureCoordinateProbe() {
  if (coordProbeGroup || !scene) return;

  coordProbeGroup = new THREE.Group();
  coordProbeGroup.visible = false;

  const sphereGeometry = new THREE.SphereGeometry(5, 16, 16);
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4f7b,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  const marker = new THREE.Mesh(sphereGeometry, sphereMaterial);
  marker.renderOrder = 1202;

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -14, 0, 0, 14, 0, 0,
        0, -14, 0, 0, 14, 0,
        0, 0, -14, 0, 0, 14
      ],
      3
    )
  );
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff9b37,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  const cross = new THREE.LineSegments(lineGeometry, lineMaterial);
  cross.renderOrder = 1203;

  coordProbeGroup.add(marker);
  coordProbeGroup.add(cross);
  scene.add(coordProbeGroup);
}

function showCoordinateProbe(worldPoint) {
  ensureCoordinateProbe();
  if (!coordProbeGroup) return;
  coordProbeGroup.position.copy(worldPoint);
  coordProbeGroup.visible = true;
  coordProbeLastWorldPoint = worldPoint.clone();
}

function hideCoordinateProbe() {
  if (coordProbeGroup) {
    coordProbeGroup.visible = false;
  }
  coordProbeLastWorldPoint = null;
}

function updateAxisHelperFromSelectedJoint() {
  ensureAxisHelper();
  if (!axisHelperGroup) return;

  if (!selectedJointState?.pivotGroup) {
    axisHelperGroup.visible = false;
    return;
  }

  if (robotRoot) {
    robotRoot.updateWorldMatrix(true, true);
  }

  const axis = getJointAxisWorld(selectedJointState);
  if (!axis) {
    axisHelperGroup.visible = false;
    return;
  }

  const pivotWorld = selectedJointState.pivotGroup.getWorldPosition(new THREE.Vector3());
  const halfLen = getJointAxisDisplayLength(selectedJointState);
  const p1 = pivotWorld.clone().addScaledVector(axis, halfLen);
  const p2 = pivotWorld.clone().addScaledVector(axis, -halfLen);

  const posAttr = axisHelperLine.geometry.getAttribute("position");
  posAttr.setXYZ(0, p1.x, p1.y, p1.z);
  posAttr.setXYZ(1, p2.x, p2.y, p2.z);
  posAttr.needsUpdate = true;
  axisHelperLine.geometry.computeBoundingSphere();

  axisHelperPivotMarker.position.copy(pivotWorld);
  axisHelperGroup.visible = true;
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
  if (!preset || typeof preset !== "object") return;
  const global = preset.global;
  if (!global || typeof global !== "object") return;

  positionPollIntervalMs = clampInt(global.positionPollIntervalMs ?? positionPollIntervalMs, 100, 3000);
  sliderAutoSendDelayMs = clampInt(global.sliderAutoSendDelayMs ?? sliderAutoSendDelayMs, 20, 1200);
  globalRealtimeSendEnabled = global.globalRealtimeSendEnabled !== undefined
    ? Boolean(global.globalRealtimeSendEnabled)
    : globalRealtimeSendEnabled;

  if (ui?.pollInput) ui.pollInput.value = String(positionPollIntervalMs);
  if (ui?.delayInput) ui.delayInput.value = String(sliderAutoSendDelayMs);
  if (ui?.globalRealtimeInput) ui.globalRealtimeInput.checked = !!globalRealtimeSendEnabled;

  if (!globalRealtimeSendEnabled) {
    jointStates.forEach((state) => {
      if (state.autoSendTimer) {
        clearTimeout(state.autoSendTimer);
        state.autoSendTimer = null;
      }
    });
  }

  restartPositionPolling();
}

function applyPresetJointToState(state, presetJoint) {
  if (!state || !presetJoint || typeof presetJoint !== "object") return;

  const oldId = state.lastServoIdForPoll;

  state.parentTarget = String(
    presetJoint.parentTarget ?? state.parentTarget ?? defaultParentTargetForTarget(state.target)
  ).trim().toLowerCase();
  state.servoId = clampInt(presetJoint.servoId ?? state.servoId, 1, 253);
  state.lastServoIdForPoll = state.servoId;
  state.min = clampInt(presetJoint.min ?? state.min, 0, 1000);
  state.max = clampInt(presetJoint.max ?? state.max, 0, 1000);
  state.guardMin = clampInt(presetJoint.guardMin ?? state.guardMin, 0, 1000);
  state.guardMax = clampInt(presetJoint.guardMax ?? state.guardMax, 0, 1000);
  state.minDeg = clampNumber(presetJoint.minDeg ?? state.minDeg, -360, 360, state.minDeg);
  state.maxDeg = clampNumber(presetJoint.maxDeg ?? state.maxDeg, -360, 360, state.maxDeg);
  state.commandScale = normalizeCommandScale(
    presetJoint.commandScale ?? state.commandScale,
    estimateDefaultCommandScaleByJointRange(
      presetJoint.minDeg ?? state.minDeg,
      presetJoint.maxDeg ?? state.maxDeg
    )
  );
  state.axis = safeAxis(presetJoint.axis ?? state.axis);
  enforceMotionAxisLockOnState(state, { syncUi: false });
  state.invert = Boolean(presetJoint.invert ?? state.invert);
  state.servoMapPoints = cloneServoMapPoints(
    presetJoint.servoMapPoints ?? presetJoint.angleMap ?? state.servoMapPoints,
    state
  );
  state.backlash = normalizeBacklashConfig(presetJoint.backlash ?? state.backlash);
  state.pivotSpace = normalizePivotSpace(presetJoint.pivotSpace, state.pivotSpace || "world");
  state.closureEnabled = presetJoint.closureEnabled !== undefined
    ? Boolean(presetJoint.closureEnabled)
    : state.closureEnabled === true;
  state.closureParentTarget = presetJoint.closureParentTarget !== undefined
    ? String(presetJoint.closureParentTarget || "")
    : String(state.closureParentTarget || "");
  state.closureGain = toFiniteNumber(
    presetJoint.closureGain ?? state.closureGain,
    toFiniteNumber(state.closureGain, 1)
  );
  state.closureMaxDeg = toFiniteNumber(
    presetJoint.closureMaxDeg ?? state.closureMaxDeg,
    toFiniteNumber(state.closureMaxDeg, 0)
  );
  state.closureOffsetDeg = toFiniteNumber(
    presetJoint.closureOffsetDeg ?? state.closureOffsetDeg,
    toFiniteNumber(state.closureOffsetDeg, 0)
  );
  state.closureInvert = presetJoint.closureInvert !== undefined
    ? Boolean(presetJoint.closureInvert)
    : state.closureInvert === true;
  state.defaultPos = clampInt(presetJoint.defaultPos ?? state.defaultPos, 0, 1000);
  state.defaultTime = clampInt(presetJoint.moveTime ?? presetJoint.defaultTime ?? state.defaultTime, 20, 30000);
  state.realtimeSendEnabled = presetJoint.realtimeSendEnabled !== undefined
    ? Boolean(presetJoint.realtimeSendEnabled)
    : state.realtimeSendEnabled;
  state.pivot = normalizePivotArray(presetJoint.pivot, state.pivot);
  state.lastCommandBasePos = null;
  state.lastCommandDir = 0;
  state.lastCommandSentPos = null;

  normalizeJointLimits(state);
  state.defaultPos = clampByGuard(state, state.defaultPos);
  const pos = clampByGuard(state, presetJoint.currentPos ?? presetJoint.pos ?? state.currentPos);

  if (state.idInput) state.idInput.value = String(state.servoId);
  if (state.timeInput) state.timeInput.value = String(state.defaultTime);
  if (state.minInput) state.minInput.value = String(state.min);
  if (state.maxInput) state.maxInput.value = String(state.max);
  if (state.guardMinInput) state.guardMinInput.value = String(state.guardMin);
  if (state.guardMaxInput) state.guardMaxInput.value = String(state.guardMax);
  if (state.minDegInput) state.minDegInput.value = String(state.minDeg);
  if (state.maxDegInput) state.maxDegInput.value = String(state.maxDeg);
  if (state.commandScaleInput) state.commandScaleInput.value = String(state.commandScale);
  if (state.axisInput) state.axisInput.value = getEffectiveJointAxisDisplayName(state);
  if (state.invertInput) state.invertInput.checked = !!state.invert;
  if (state.defaultPosInput) state.defaultPosInput.value = String(state.defaultPos);
  if (state.realtimeInput) state.realtimeInput.checked = !!state.realtimeSendEnabled;
  syncJointPivotInputs(state);

  syncJointRangeBounds(state);
  applyJointPivot(state, state.pivot);
  applyJointVisual(state, pos);

  if (Number.isFinite(oldId) && oldId !== state.servoId) {
    const oldStillUsed = jointStates.some((s) => s !== state && getJointServoId(s) === oldId);
    if (!oldStillUsed) {
      reachableServoIds.delete(oldId);
      lastActualIdByQueryId.delete(oldId);
      lastVoltageById.delete(oldId);
      lastTempById.delete(oldId);
    }
  }
}

function shouldRealtimeSend(state) {
  return globalRealtimeSendEnabled && state.realtimeSendEnabled !== false;
}

function scheduleRealtimeMove(state) {
  if (!shouldRealtimeSend(state)) return;

  if (state.autoSendTimer) {
    clearTimeout(state.autoSendTimer);
  }

  state.autoSendTimer = setTimeout(() => {
    sendMoveCommand(state, { silentWhenClosed: true });
    state.autoSendTimer = null;
  }, sliderAutoSendDelayMs);
}

function sendQueryById(id, silentWhenClosed = true) {
  expectedQueryId = id;
  return send({ type: "query", id }, silentWhenClosed);
}

function scheduleQueryById(id, delayMs = 0) {
  setTimeout(() => {
    sendQueryById(id, true);
  }, Math.max(0, delayMs));
}

function queryAllPositionsStaggered() {
  const ids = buildPollIdList();
  ids.forEach((id, idx) => {
    scheduleQueryById(id, idx * 80);
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

function sendPhysicalDependentMoves(sourceState, time, silentWhenClosed = true) {
  if (!autoPinConstraintReady || automaticPinConstraint?.mode !== "physical_four_bar") return;
  const sourceTarget = String(sourceState?.target || "");
  const driverTarget = String(automaticPinConstraint.driverTarget || "");
  if (!sourceTarget || sourceTarget !== driverTarget) return;

  const delay = Math.max(80, Math.min(2000, time + 80));
  const deps = Array.isArray(automaticPinConstraint.dependentTargets)
    ? automaticPinConstraint.dependentTargets
    : [];

  deps.forEach((target, idx) => {
    const depState = findJointStateByTarget(target);
    if (!depState || depState === sourceState) return;
    if (!shouldRealtimeSend(depState) && silentWhenClosed) return;

    const depId = getJointServoId(depState);
    const depDesiredPos = getJointPos(depState);
    const depScaledPos = mapDesiredPosToCommandPos(depState, depDesiredPos);
    const depPos = compensateCommandPosByBacklash(depState, depScaledPos);
    const ok = send({ type: "move", id: depId, pos: depPos, time }, silentWhenClosed);
    if (ok) {
      scheduleQueryById(depId, delay + (idx + 1) * 35);
    }
  });
}

function sendMoveCommand(state, { silentWhenClosed = true } = {}) {
  const id = getJointServoId(state);
  const desiredPos = getJointPos(state);
  const scaledPos = mapDesiredPosToCommandPos(state, desiredPos);
  const pos = compensateCommandPosByBacklash(state, scaledPos);
  const time = getJointTime(state);

  const ok = send({ type: "move", id, pos, time }, silentWhenClosed);
  if (ok) {
    const delay = Math.max(80, Math.min(2000, time + 80));
    scheduleQueryById(id, delay);
    sendPhysicalDependentMoves(state, time, silentWhenClosed);
  }
}

function resetArmToDefaults({ silentWhenClosed = false } = {}) {
  const resetTargets = jointStates.filter((state) => {
    if (!state || state.uiHidden === true) return false;
    if (normalizeDerivedType(state.derivedType) === "offset_minus_sum") return false;
    return true;
  });

  resetTargets.forEach((state, idx) => {
    if (state.autoSendTimer) {
      clearTimeout(state.autoSendTimer);
      state.autoSendTimer = null;
    }
    applyJointVisual(state, state.defaultPos);
    const delay = idx * 95;
    setTimeout(() => sendMoveCommand(state, { silentWhenClosed }), delay);
  });

  const probeIds = buildPollIdList();
  probeIds.forEach((id, idx) => {
    const delay = resetTargets.length * 95 + idx * 70 + 200;
    setTimeout(() => send({ type: "query", id }, true), delay);
    setTimeout(() => send({ type: "vin", id }, true), delay + 20);
    setTimeout(() => send({ type: "temp", id }, true), delay + 40);
    setTimeout(() => send({ type: "id_read", id }, true), delay + 55);
  });
}

function startPositionPolling() {
  stopPositionPolling();
  pollCursor = 0;

  pollTimer = setInterval(() => {
    if (!isWsOpen() || jointStates.length === 0) return;

    const pollIds = buildPollIdList();
    if (pollIds.length === 0) return;

    const id = pollIds[pollCursor % pollIds.length];
    pollCursor += 1;
    sendQueryById(id, true);

    if (pollCursor % (Math.max(1, pollIds.length) * 6) === 0) {
      send({ type: "vin", id: pollIds[0] }, true);
      send({ type: "temp", id: pollIds[0] }, true);
    }
  }, positionPollIntervalMs);
}

function stopPositionPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function restartPositionPolling() {
  if (isWsOpen()) {
    startPositionPolling();
  }
}

function initViewer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50000);
  camera.position.set(600, 300, 600);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  viewerEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 120, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.92));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(520, 800, 620);
  scene.add(dirLight);
  scene.add(new THREE.GridHelper(1200, 24, 0x778899, 0xaec3d5));
  scene.add(new THREE.AxesHelper(200));

  displayRoot = new THREE.Group();
  scene.add(displayRoot);
  ensureAxisHelper();

  stlLoader = new STLLoader();

  const resize = () => {
    const width = viewerEl.clientWidth;
    const height = viewerEl.clientHeight;
    if (width <= 0 || height <= 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    updateAxisHelperFromSelectedJoint();
    if (axisLineEditorActive && !axisLineEditorDragging) {
      refreshAxisLineEditorFromRuntime();
    }
    renderer.render(scene, camera);
  };

  window.addEventListener("resize", resize);
  resize();
  animate();
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
  if (!displayRoot || !robotRoot) {
    return { ok: false, error: "displayRoot/robotRoot not ready" };
  }
  const calibration = resolveFrameCalibrationConfig(options);
  if (!calibration.enabled) {
    return { ok: false, error: "frame calibration disabled" };
  }

  const j1State = findJointStateByTarget(calibration.upTarget);
  if (!j1State?.pivotGroup) {
    return { ok: false, error: `up target pivot group not ready: ${calibration.upTarget}` };
  }

  const worldUp = new THREE.Vector3(0, 1, 0);

  const applyWorldRotationOnDisplayRoot = (quat) => {
    if (!quat) return;
    displayRoot.quaternion.premultiply(quat);
    displayRoot.position.applyQuaternion(quat);
  };

  robotRoot.updateWorldMatrix(true, true);
  let j1AxisWorld = getJointAxisWorld(j1State);
  if (!j1AxisWorld || j1AxisWorld.lengthSq() < 1e-10) {
    return { ok: false, error: "J1 axis invalid" };
  }
  j1AxisWorld.normalize();

  const qAlignUp = new THREE.Quaternion().setFromUnitVectors(j1AxisWorld, worldUp);
  applyWorldRotationOnDisplayRoot(qAlignUp);

  robotRoot.updateWorldMatrix(true, true);
  const j1PivotAfterUp = j1State.pivotGroup.getWorldPosition(new THREE.Vector3());
  const frontTargetCandidates = calibration.useDynamicFallback
    ? [calibration.frontTarget, "j4", "j3", "j2"]
    : [calibration.frontTarget];
  let usedFrontTarget = "";
  let usedFrontHorizontalLen = 0;
  let usedFrontYawDeg = 0;
  let usedYawMethod = "";
  const minHorizontalLenForYaw = calibration.minFrontBaselineMm;

  for (const candidate of frontTargetCandidates) {
    const target = String(candidate || "").trim().toLowerCase();
    if (!target) continue;
    const state = findJointStateByTarget(target);
    const pivot = state?.pivotGroup
      ? state.pivotGroup.getWorldPosition(new THREE.Vector3())
      : null;
    if (!pivot) continue;

    const frontDir = pivot.clone().sub(j1PivotAfterUp);
    frontDir.y = 0;
    const horizontalLen = frontDir.length();
    if (!Number.isFinite(horizontalLen) || horizontalLen < minHorizontalLenForYaw) {
      continue;
    }

    frontDir.normalize();
    const targetFront = calibration.frontAxisWorld.clone().setY(0).normalize();
    if (targetFront.lengthSq() < 1e-8) continue;
    const qYaw = new THREE.Quaternion().setFromUnitVectors(frontDir, targetFront);
    applyWorldRotationOnDisplayRoot(qYaw);
    if (Math.abs(calibration.yawOffsetDeg) > 1e-9) {
      const qOffset = new THREE.Quaternion().setFromAxisAngle(
        worldUp,
        THREE.MathUtils.degToRad(calibration.yawOffsetDeg)
      );
      applyWorldRotationOnDisplayRoot(qOffset);
    }

    usedFrontTarget = target;
    usedFrontHorizontalLen = horizontalLen;
    usedFrontYawDeg = THREE.MathUtils.radToDeg(Math.atan2(frontDir.x, frontDir.z));
    usedYawMethod = "fixed_front_axis";
    break;
  }

  robotRoot.updateWorldMatrix(true, true);
  const j1Pivot = j1State.pivotGroup.getWorldPosition(new THREE.Vector3());
  j1AxisWorld = getJointAxisWorld(j1State);
  if (!j1AxisWorld || j1AxisWorld.lengthSq() < 1e-10) {
    return { ok: false, error: "J1 axis invalid after align" };
  }
  j1AxisWorld.normalize();
  let originWorld;
  if (Math.abs(j1AxisWorld.y) > 1e-8) {
    const t = -j1Pivot.y / j1AxisWorld.y;
    originWorld = j1Pivot.clone().addScaledVector(j1AxisWorld, t);
  } else {
    originWorld = j1Pivot.clone();
    originWorld.y = 0;
  }
  displayRoot.position.sub(originWorld);

  robotRoot.updateWorldMatrix(true, true);
  jointStates.forEach((state) => {
    if (!state?.pivotGroup) return;
    if (normalizePivotSpace(state.pivotSpace, "world") !== "world") return;
    const p = state.pivotGroup.getWorldPosition(new THREE.Vector3());
    state.pivot = [p.x, p.y, p.z];
    syncJointPivotInputs(state);
  });

  if (Array.isArray(loadedJointConfig?.joints)) {
    jointStates.forEach((state) => {
      if (normalizePivotSpace(state.pivotSpace, "world") !== "world") return;
      const idx = findConfigJointIndex(loadedJointConfig.joints, state);
      if (idx < 0) return;
      loadedJointConfig.joints[idx].pivotSpace = "world";
      loadedJointConfig.joints[idx].pivot = normalizePivotArray(state.pivot, [0, 0, 0]);
    });
  }

  updateAxisHelperFromSelectedJoint();
  fitCameraToObject(displayRoot);
  return {
    ok: true,
    originWorld: [0, 0, 0],
    j1AxisWorld: [j1AxisWorld.x, j1AxisWorld.y, j1AxisWorld.z],
    frameCalibration: calibration,
    frontTargetUsed: usedFrontTarget || "",
    frontHorizontalLen: Number(usedFrontHorizontalLen.toFixed(3)),
    frontYawDeg: Number(usedFrontYawDeg.toFixed(3)),
    yawMethod: usedYawMethod || "none"
  };
}

function setPivotKeepingWorld(state, worldPivot) {
  if (!state?.pivotGroup || !state?.targetGroup || !state.pivotGroup.parent) return;

  state.targetGroup.updateWorldMatrix(true, true);
  const targetWorldMatrix = state.targetGroup.matrixWorld.clone();

  const pivotParent = state.pivotGroup.parent;
  const pivotLocal = pivotParent.worldToLocal(worldPivot.clone());
  state.pivotGroup.position.copy(pivotLocal);
  state.pivotGroup.updateWorldMatrix(true, true);

  const localMatrix = state.pivotGroup.matrixWorld.clone().invert().multiply(targetWorldMatrix);
  localMatrix.decompose(state.targetGroup.position, state.targetGroup.quaternion, state.targetGroup.scale);
  state.targetGroup.updateWorldMatrix(true, true);
}

function getStateMeshWorldBox(state) {
  if (!state) return null;
  let box = new THREE.Box3();
  if (state.meshGroup) {
    box.setFromObject(state.meshGroup);
    if (!box.isEmpty()) return box;
  }
  if (state.targetGroup) {
    box.setFromObject(state.targetGroup);
    if (!box.isEmpty()) return box;
  }
  return null;
}

function getTargetMeshWorldBox(target) {
  const state = findJointStateByTarget(target);
  if (state) return getStateMeshWorldBox(state);

  const mesh = meshGroupsByTarget?.[target];
  if (!mesh) return null;
  const box = new THREE.Box3().setFromObject(mesh);
  return box.isEmpty() ? null : box;
}

function inferJointPivotWorldByBoxes(parentBox, childBox) {
  if (!parentBox || !childBox || parentBox.isEmpty() || childBox.isEmpty()) return null;

  if (parentBox.intersectsBox(childBox)) {
    const inter = parentBox.clone().intersect(childBox);
    if (!inter.isEmpty()) {
      return inter.getCenter(new THREE.Vector3());
    }
  }

  const parentCenter = parentBox.getCenter(new THREE.Vector3());
  const childCenter = childBox.getCenter(new THREE.Vector3());
  const pOnParent = parentBox.clampPoint(childCenter, new THREE.Vector3());
  const pOnChild = childBox.clampPoint(parentCenter, new THREE.Vector3());
  return pOnParent.add(pOnChild).multiplyScalar(0.5);
}

function maybeAutoInferAssemblyPivots() {
  if (!assemblyLockRuntime.enabled || !assemblyLockRuntime.autoInferPivots) return;
  if (!robotRoot) return;
  robotRoot.updateWorldMatrix(true, true);

  const maxShift = Math.max(5, toFiniteNumber(assemblyLockRuntime.maxAutoShiftMm, 280));
  const results = [];

  for (const childState of jointStates) {
    if (!childState) continue;
    const childTarget = String(childState.target || "").trim().toLowerCase();
    if (!childTarget || childTarget === "base") continue;
    let parentTarget = String(
      childState.parentTarget || defaultParentTargetForTarget(childTarget)
    ).trim().toLowerCase();
    if (!parentTarget || parentTarget === childTarget) {
      parentTarget = defaultParentTargetForTarget(childTarget);
    }

    const parentBox = getTargetMeshWorldBox(parentTarget);
    const childBox = getStateMeshWorldBox(childState);
    const inferredWorld = inferJointPivotWorldByBoxes(parentBox, childBox);
    if (!inferredWorld) continue;

    const prevWorld = getJointPivotWorldFromState(childState);
    const shift = prevWorld ? prevWorld.distanceTo(inferredWorld) : 0;
    if (Number.isFinite(shift) && shift > maxShift) {
      results.push({
        joint: childState.name,
        target: childTarget,
        skipped: true,
        reason: "shift_too_large",
        shiftMm: Number(shift.toFixed(3)),
        limitMm: Number(maxShift.toFixed(3))
      });
      continue;
    }

    childState.pivotSpace = "world";
    childState.pivot = [inferredWorld.x, inferredWorld.y, inferredWorld.z];
    syncJointPivotInputs(childState);
    results.push({
      joint: childState.name,
      target: childTarget,
      skipped: false,
      shiftMm: Number(shift.toFixed(3)),
      pivotWorld: [
        Number(inferredWorld.x.toFixed(3)),
        Number(inferredWorld.y.toFixed(3)),
        Number(inferredWorld.z.toFixed(3))
      ]
    });
  }

  if (results.length > 0) {
    const applied = results.filter((item) => item.skipped !== true).length;
    const skipped = results.filter((item) => item.skipped === true).length;
    log("Assembly pivot auto-infer finished", {
      applied,
      skipped,
      maxShiftMm: Number(maxShift.toFixed(3)),
      details: results
    });
  }
}

function applyConfiguredPivots() {
  if (!robotRoot) return;
  robotRoot.updateWorldMatrix(true, true);
  const physicalModeEnabled = isPhysicalKinematicsEnabled();

  jointStates.forEach((state) => {
    if (!state.pivotGroup || !state.targetGroup) return;
    const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");

    let pivotValue = null;
    if (Array.isArray(state.pivot) && state.pivot.length === 3 && state.pivot.some((n) => Number(n) !== 0)) {
      pivotValue = toVec3(state.pivot);
    } else if (!physicalModeEnabled) {
      const box = new THREE.Box3().setFromObject(state.meshGroup || state.targetGroup);
      if (!box.isEmpty()) {
        const centerWorld = box.getCenter(new THREE.Vector3());
        pivotValue = pivotSpace === "local" ? worldToRobotLocal(centerWorld) : centerWorld;
      }
    }

    if (!pivotValue) return;
    applyJointPivot(state, [pivotValue.x, pivotValue.y, pivotValue.z]);
  });
}

function createJointCard(state) {
  const built = buildJointCardLayout(state, { posToDeg, normalizePivotSpace });
  const card = built.card;
  const {
    header,
    rangeInput,
    valueInput,
    timeInput,
    idInput,
    minInput,
    maxInput,
    guardMinInput,
    guardMaxInput,
    minDegInput,
    maxDegInput,
    commandScaleInput,
    axisInput,
    invertInput,
    defaultPosInput,
    pivotXInput,
    pivotYInput,
    pivotZInput,
    realtimeInput,
    showAxisBtn,
    moveBtn,
    queryBtn,
    vinBtn,
    tempBtn,
    idReadBtn,
    pivotCenterBtn,
    idChip,
    posChip,
    degChip,
    actualIdChip,
    actualIdReadout,
    vinChip,
    tempChip
  } = built.refs;

  header.addEventListener("click", () => {
    setSelectedJointState(state);
  });

  state.idInput = idInput;
  state.rangeInput = rangeInput;
  state.valueInput = valueInput;
  state.timeInput = timeInput;
  state.minInput = minInput;
  state.maxInput = maxInput;
  state.guardMinInput = guardMinInput;
  state.guardMaxInput = guardMaxInput;
  state.minDegInput = minDegInput;
  state.maxDegInput = maxDegInput;
  state.commandScaleInput = commandScaleInput;
  state.axisInput = axisInput;
  state.invertInput = invertInput;
  state.defaultPosInput = defaultPosInput;
  state.pivotXInput = pivotXInput;
  state.pivotYInput = pivotYInput;
  state.pivotZInput = pivotZInput;
  state.realtimeInput = realtimeInput;
  state.showAxisBtn = showAxisBtn;
  state.cardEl = card;
  state.posChipEl = posChip;
  state.degChipEl = degChip;
  state.idChipEl = idChip;
  state.actualIdChipEl = actualIdChip;
  state.actualIdReadoutEl = actualIdReadout;
  state.vinChipEl = vinChip;
  state.tempChipEl = tempChip;
  state.realtimeSendEnabled = true;
  enforceMotionAxisLockOnState(state);

  syncJointRangeBounds(state);
  syncJointPivotInputs(state);
  applyJointVisual(state, state.currentPos);

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

  const coordTools = document.createElement("div");
  coordTools.className = "coord-tools";

  const coordSpaceSelect = createSelectInput(
    [
      { value: "world", label: "world" },
      { value: "display_local", label: "display_local" },
      { value: "robot_local", label: "robot_local" },
      { value: "selected_parent_local", label: "selected_parent_local" }
    ],
    "world"
  );
  const coordXInput = createNumberInput(0, -99999, 99999, 0.1);
  const coordYInput = createNumberInput(0, -99999, 99999, 0.1);
  const coordZInput = createNumberInput(0, -99999, 99999, 0.1);

  const locateCoordBtn = document.createElement("button");
  locateCoordBtn.textContent = "Locate Coord";
  locateCoordBtn.title = "Locate point in 3D by input coords and show conversions.";
  const usePivotBtn = document.createElement("button");
  usePivotBtn.textContent = "Use Current Pivot";
  usePivotBtn.title = "Fill coord input from selected joint pivot.";
  const hideCoordBtn = document.createElement("button");
  hideCoordBtn.className = "ghost-btn";
  hideCoordBtn.textContent = "Hide Probe";
  hideCoordBtn.title = "Hide coordinate probe marker and helper line.";
  const alignFrameBtn = document.createElement("button");
  alignFrameBtn.textContent = "Align Frame";
  alignFrameBtn.title = "Align world frame to current arm reference.";
  coordTools.append(
    createControlField("Coord Space", coordSpaceSelect),
    createControlField("X", coordXInput),
    createControlField("Y", coordYInput),
    createControlField("Z", coordZInput),
    locateCoordBtn,
    usePivotBtn,
    hideCoordBtn,
    alignFrameBtn
  );
  setControlFieldLabels(coordTools, ["Coord Space", "X", "Y", "Z"]);

  const physicalTools = document.createElement("div");
  physicalTools.className = "physical-tools";

  const physicalEnabledInput = document.createElement("input");
  physicalEnabledInput.type = "checkbox";

  const physicalSpaceSelect = createSelectInput(
    [
      { value: "robot_local", label: "robot_local" },
      { value: "world", label: "world" }
    ],
    "robot_local"
  );
  const physicalTargetSelect = createSelectInput(
    [
      { value: "j2", label: "J2" },
      { value: "j3", label: "J3" },
      { value: "j4", label: "J4" }
    ],
    "j2"
  );
  const physicalPivotXInput = createNumberInput(0, -99999, 99999, 0.1);
  const physicalPivotYInput = createNumberInput(0, -99999, 99999, 0.1);
  const physicalPivotZInput = createNumberInput(0, -99999, 99999, 0.1);
  const physicalJ2LengthInput = createNumberInput(0, 0, 99999, 0.001);
  const physicalJ3LengthInput = createNumberInput(0, 0, 99999, 0.001);

  const physicalReloadBtn = document.createElement("button");
  physicalReloadBtn.className = "ghost-btn";
  physicalReloadBtn.textContent = "Reload Config";
  physicalReloadBtn.title = "Reload physical values from joints.json.";
  const physicalUseSelectedPivotBtn = document.createElement("button");
  physicalUseSelectedPivotBtn.className = "ghost-btn";
  physicalUseSelectedPivotBtn.textContent = "Use Selected Pivot";
  physicalUseSelectedPivotBtn.title = "Copy selected joint pivot into physical draft.";
  const physicalApplyBtn = document.createElement("button");
  physicalApplyBtn.textContent = "Apply Physical";
  physicalApplyBtn.title = "Apply and rebuild closed-chain solver (frontend runtime).";
  const axisTargetSelect = createSelectInput(
    [
      { value: "j1", label: "J1" },
      { value: "j2", label: "J2" },
      { value: "j3", label: "J3" },
      { value: "j4", label: "J4" }
    ],
    "j2"
  );
  const axisDirXInput = createNumberInput(1, -99999, 99999, 0.001);
  const axisDirYInput = createNumberInput(0, -99999, 99999, 0.001);
  const axisDirZInput = createNumberInput(0, -99999, 99999, 0.001);

  const axisReloadBtn = document.createElement("button");
  axisReloadBtn.className = "ghost-btn";
  axisReloadBtn.textContent = "Read Axis";
  axisReloadBtn.title = "Read current parent-space axis for selected target.";
  const axisApplyBtn = document.createElement("button");
  axisApplyBtn.textContent = "Apply Axis";
  axisApplyBtn.title = "Apply axis vector to selected target.";
  const axisShowBtn = document.createElement("button");
  axisShowBtn.className = "ghost-btn";
  axisShowBtn.textContent = "Show Axis";
  axisShowBtn.title = "Focus target joint and show axis.";
  const axisDragBtn = document.createElement("button");
  axisDragBtn.className = "ghost-btn";
  axisDragBtn.textContent = "Drag Axis Dir";
  axisDragBtn.title = "Drag axis direction in 3D.";
  const axisPickBtn = document.createElement("button");
  axisPickBtn.className = "ghost-btn";
  axisPickBtn.textContent = "Pick Axis (Out->In)";
  axisPickBtn.title = "Pick a surface point and generate axis from outward normal reversed.";
  const axisPinBtn = document.createElement("button");
  axisPinBtn.className = "ghost-btn";
  axisPinBtn.textContent = "Pin Line Pos";
  axisPinBtn.title = "Keep line position fixed while moving pivot.";
  const axisSlideBtn = document.createElement("button");
  axisSlideBtn.className = "ghost-btn";
  axisSlideBtn.textContent = "Slide Pivot On Axis";
  axisSlideBtn.title = "Move pivot only along current axis line.";
  const physicalDraft = {
    enabled: false,
    type: "four_bar_dual_hole",
    space: "robot_local",
    planeAxis: "z",
    driverTarget: "j2",
    branch: "closest",
    joints: {
      j2: { target: "j2", pivot: [0, 0, 0], activeLinkLength: 0, angleOffsetDeg: 0 },
      j3: { target: "j3", pivot: [0, 0, 0], activeLinkLength: 0, angleOffsetDeg: 0 },
      j4: { target: "j4", pivot: [0, 0, 0], angleOffsetDeg: 0 }
    },
    endEffector: {
      yellowHoleLocal: [0, 0, 0],
      greenHoleLocal: [0, 0, 0]
    }
  };

  const pullPhysicalDraftFromConfig = () => {
    const sourceConfig = loadedJointConfig && typeof loadedJointConfig === "object"
      ? loadedJointConfig
      : FALLBACK_CONFIG;
    const raw = sourceConfig?.physicalKinematics && typeof sourceConfig.physicalKinematics === "object"
      ? sourceConfig.physicalKinematics
      : {};

    physicalDraft.enabled = raw.enabled === true;
    physicalDraft.type = String(raw.type || "four_bar_dual_hole");
    physicalDraft.space = normalizePhysicalPointSpace(raw.space, "robot_local");
    physicalDraft.planeAxis = safeAxis(raw.planeAxis || "z");
    physicalDraft.driverTarget = String(raw.driverTarget || "j2");
    physicalDraft.branch = String(raw.branch || "closest");
    physicalDraft.endEffector.yellowHoleLocal = normalizePivotArray(raw?.endEffector?.yellowHoleLocal, [0, 0, 0]);
    physicalDraft.endEffector.greenHoleLocal = normalizePivotArray(raw?.endEffector?.greenHoleLocal, [0, 0, 0]);

    const jointsRaw = raw?.joints && typeof raw.joints === "object" ? raw.joints : {};
    ["j2", "j3", "j4"].forEach((key) => {
      const jointRaw = jointsRaw[key] && typeof jointsRaw[key] === "object" ? jointsRaw[key] : {};
      const target = String(jointRaw.target || key);
      let pivot = parseOptionalVec3(jointRaw.pivot);
      if (!pivot) {
        const state = findJointStateByTarget(target);
        if (state) {
          const pivotWorld = getJointPivotWorldFromState(state);
          const convertedPivot = convertWorldPointToPhysicalSpace(pivotWorld, physicalDraft.space);
          pivot = [convertedPivot.x, convertedPivot.y, convertedPivot.z];
        } else {
          pivot = [0, 0, 0];
        }
      }

      const existingLength = toFiniteNumber(physicalDraft.joints[key]?.activeLinkLength, 0);
      const parsedLength = Math.max(0, toFiniteNumber(jointRaw.activeLinkLength, existingLength));
      physicalDraft.joints[key] = {
        target,
        pivot: normalizePivotArray(pivot, [0, 0, 0]),
        activeLinkLength: key === "j4" ? 0 : parsedLength,
        angleOffsetDeg: toFiniteNumber(jointRaw.angleOffsetDeg, 0)
      };
    });
  };

  const captureActivePhysicalPivotInputs = () => {
    const key = String(physicalTargetSelect.value || "j2");
    const entry = physicalDraft.joints[key];
    if (!entry) return;
    const current = normalizePivotArray(entry.pivot, [0, 0, 0]);
    entry.pivot = [
      clampNumber(physicalPivotXInput.value, -99999, 99999, current[0]),
      clampNumber(physicalPivotYInput.value, -99999, 99999, current[1]),
      clampNumber(physicalPivotZInput.value, -99999, 99999, current[2])
    ];
  };

  const syncPhysicalInputsFromDraft = () => {
    physicalEnabledInput.checked = physicalDraft.enabled === true;
    physicalSpaceSelect.value = normalizePhysicalPointSpace(physicalDraft.space, "robot_local");

    const key = String(physicalTargetSelect.value || "j2");
    const entry = physicalDraft.joints[key] || physicalDraft.joints.j2;
    const pivot = normalizePivotArray(entry?.pivot, [0, 0, 0]);
    physicalPivotXInput.value = String(pivot[0]);
    physicalPivotYInput.value = String(pivot[1]);
    physicalPivotZInput.value = String(pivot[2]);

    physicalJ2LengthInput.value = String(Math.max(0, toFiniteNumber(physicalDraft.joints.j2?.activeLinkLength, 0)));
    physicalJ3LengthInput.value = String(Math.max(0, toFiniteNumber(physicalDraft.joints.j3?.activeLinkLength, 0)));
  };

  const syncAxisInputsFromRuntime = () => {
    const target = String(axisTargetSelect.value || "j2");
    const axis = getParentAxisVectorForTarget(target);
    axisDirXInput.value = String(axis[0]);
    axisDirYInput.value = String(axis[1]);
    axisDirZInput.value = String(axis[2]);
  };

  const applyAxisInputsToRuntime = () => {
    const target = String(axisTargetSelect.value || "j2");
    const fallback = getParentAxisVectorForTarget(target);
    const normalized = normalizeAxisVectorArray(
      [
        clampNumber(axisDirXInput.value, -99999, 99999, fallback[0]),
        clampNumber(axisDirYInput.value, -99999, 99999, fallback[1]),
        clampNumber(axisDirZInput.value, -99999, 99999, fallback[2])
      ],
      fallback
    );

    const applied = setParentAxisVectorForTarget(target, normalized, {
      updateConfig: true,
      applyVisual: true
    }) || normalized;
    axisDirXInput.value = String(applied[0]);
    axisDirYInput.value = String(applied[1]);
    axisDirZInput.value = String(applied[2]);

    log("Parent-axis line updated", {
      target,
      axisParent: applied.map((v) => Number(v.toFixed(6)))
    });
  };

  const syncAxisEditorButtons = () => {
    const target = String(axisTargetSelect.value || "j2");
    const editingThis = axisLineEditorActive && axisLineEditorTarget === target;
    const mode = editingThis ? axisLineEditorMode : "";
  axisDragBtn.textContent = "Drag Axis Dir";
  axisPickBtn.textContent = "Pick Axis (Out->In)";
  axisSlideBtn.textContent = "Slide Pivot On Axis";
  axisPinBtn.textContent = "Pin Line Pos";
    axisPinBtn.disabled = !editingThis;
  };

  axisLineEditorOnAxisUpdated = (axisParent, target) => {
    const t = String(target || "j2");
    if (axisTargetSelect.value !== t) {
      axisTargetSelect.value = t;
    }
    axisDirXInput.value = String(axisParent[0]);
    axisDirYInput.value = String(axisParent[1]);
    axisDirZInput.value = String(axisParent[2]);
    const applied = setParentAxisVectorForTarget(t, axisParent, {
      updateConfig: true,
      applyVisual: true
    }) || axisParent;
    axisDirXInput.value = String(applied[0]);
    axisDirYInput.value = String(applied[1]);
    axisDirZInput.value = String(applied[2]);
    syncAxisEditorButtons();
  };

  axisLineEditorOnStateChanged = () => {
    syncAxisEditorButtons();
  };

  const convertPhysicalDraftSpace = (nextSpace) => {
    const prevSpace = normalizePhysicalPointSpace(physicalDraft.space, "robot_local");
    const normalizedNext = normalizePhysicalPointSpace(nextSpace, prevSpace);
    if (prevSpace === normalizedNext) {
      physicalDraft.space = normalizedNext;
      return;
    }

    ["j2", "j3", "j4"].forEach((key) => {
      const entry = physicalDraft.joints[key];
      if (!entry) return;
      const current = toVec3(normalizePivotArray(entry.pivot, [0, 0, 0]));
      const worldPoint = prevSpace === "world" ? current : robotLocalToWorld(current);
      const nextPoint = normalizedNext === "world" ? worldPoint : worldToRobotLocal(worldPoint);
      entry.pivot = [nextPoint.x, nextPoint.y, nextPoint.z];
    });

    physicalDraft.space = normalizedNext;
  };

  const applyPhysicalDraftToRuntime = () => {
    captureActivePhysicalPivotInputs();
    physicalDraft.enabled = !!physicalEnabledInput.checked;
    physicalDraft.joints.j2.activeLinkLength = Math.max(0, clampNumber(
      physicalJ2LengthInput.value,
      0,
      99999,
      toFiniteNumber(physicalDraft.joints.j2.activeLinkLength, 0)
    ));
    physicalDraft.joints.j3.activeLinkLength = Math.max(0, clampNumber(
      physicalJ3LengthInput.value,
      0,
      99999,
      toFiniteNumber(physicalDraft.joints.j3.activeLinkLength, 0)
    ));

    const nextConfig = cloneConfig(loadedJointConfig || FALLBACK_CONFIG);
    const physical = ensurePhysicalKinematicsConfig(nextConfig);
    if (!physical) return;

    physical.enabled = physicalDraft.enabled;
    physical.type = physicalDraft.type;
    physical.space = normalizePhysicalPointSpace(physicalDraft.space, "robot_local");
    physical.planeAxis = safeAxis(physicalDraft.planeAxis || "z");
    physical.driverTarget = String(physicalDraft.driverTarget || "j2");
    physical.branch = String(physicalDraft.branch || "closest");
    physical.endEffector.yellowHoleLocal = normalizePivotArray(physicalDraft.endEffector.yellowHoleLocal, [0, 0, 0]);
    physical.endEffector.greenHoleLocal = normalizePivotArray(physicalDraft.endEffector.greenHoleLocal, [0, 0, 0]);

    ["j2", "j3", "j4"].forEach((key) => {
      const src = physicalDraft.joints[key] || {};
      const entry = ensurePhysicalJointConfigEntry(physical, key);
      entry.target = String(src.target || entry.target || key);
      entry.pivot = normalizePivotArray(src.pivot, [0, 0, 0]);
      entry.angleOffsetDeg = toFiniteNumber(src.angleOffsetDeg, toFiniteNumber(entry.angleOffsetDeg, 0));
      if (key === "j2" || key === "j3") {
        entry.activeLinkLength = Math.max(0, toFiniteNumber(src.activeLinkLength, toFiniteNumber(entry.activeLinkLength, 0)));
      }
    });

    loadedJointConfig = nextConfig;
    applyMotionLocksFromConfig(loadedJointConfig);

    const pointSpace = normalizePhysicalPointSpace(physical.space, "robot_local");
    ["j2", "j3", "j4"].forEach((key) => {
      const entry = physical.joints?.[key];
      if (!entry) return;
      const state = findJointStateByTarget(String(entry.target || key));
      if (!state) return;
      const pivotConfig = toVec3(normalizePivotArray(entry.pivot, [0, 0, 0]));
      const pivotLocal = pointSpace === "world" ? worldToRobotLocal(pivotConfig) : pivotConfig;
      state.pivotSpace = "local";
      applyJointPivot(state, [pivotLocal.x, pivotLocal.y, pivotLocal.z]);
      applyJointVisual(state, state.currentPos, { lockClosureForSelf: true });
    });

    initAutomaticPinConstraint();
    if (autoPinConstraintReady && automaticPinConstraint?.mode === "physical_four_bar") {
      const driver = findJointStateByTarget(automaticPinConstraint.driverTarget) || findJointStateByTarget("j2");
      applyAutomaticPinConstraint({ sourceState: driver });
    }
    updateAxisHelperFromSelectedJoint();
    syncPhysicalInputsFromDraft();

    log("Physical calibration applied", {
      enabled: physical.enabled,
      space: physical.space,
      j2LinkMm: Number(physical.joints?.j2?.activeLinkLength || 0).toFixed(3),
      j3LinkMm: Number(physical.joints?.j3?.activeLinkLength || 0).toFixed(3)
    });
  };

  physicalTools.append(
    createControlField("Enable Physical", physicalEnabledInput),
    createControlField("Physical Space", physicalSpaceSelect),
    createControlField("Driver Target", physicalTargetSelect),
    createControlField("Pivot X", physicalPivotXInput),
    createControlField("Pivot Y", physicalPivotYInput),
    createControlField("Pivot Z", physicalPivotZInput),
    createControlField("J2 Link (mm)", physicalJ2LengthInput),
    createControlField("J3 Link (mm)", physicalJ3LengthInput),
    createControlField("Axis Target", axisTargetSelect),
    createControlField("Axis Dir X", axisDirXInput),
    createControlField("Axis Dir Y", axisDirYInput),
    createControlField("Axis Dir Z", axisDirZInput),
    physicalReloadBtn,
    physicalUseSelectedPivotBtn,
    physicalApplyBtn,
    axisReloadBtn,
    axisApplyBtn,
    axisShowBtn,
    axisDragBtn,
    axisPickBtn,
    axisPinBtn,
    axisSlideBtn
  );
  setControlFieldLabels(physicalTools, ["Enable Closed-Chain", "Physical Space", "Driver Target", "Pivot X", "Pivot Y", "Pivot Z", "J2 Link Length (mm)", "J3 Link Length (mm)", "Axis Target", "Axis Dir X (parent)", "Axis Dir Y (parent)", "Axis Dir Z (parent)"]);

  const demoTools = document.createElement("div");
  demoTools.className = "demo-tools";

  const demoEnabledInput = document.createElement("input");
  demoEnabledInput.type = "checkbox";
  demoEnabledInput.checked = demoRuntime.enabled === true;

  const demoAutoFeaInput = document.createElement("input");
  demoAutoFeaInput.type = "checkbox";
  demoAutoFeaInput.checked = demoRuntime.autoFea !== false;

  const demoElbowSelect = createSelectInput(
    [
      { value: "down", label: "down" },
      { value: "up", label: "up" }
    ],
    demoRuntime.elbow
  );

  const demoWristPitchInput = createNumberInput(demoRuntime.wristPitchDeg, -180, 180, 0.1);
  const demoPayloadInput = createNumberInput(demoRuntime.payloadNewton, 0, 1000, 0.1);
  const demoTargetXInput = createNumberInput(demoRuntime.target.x, -2000, 2000, 0.1);
  const demoTargetYInput = createNumberInput(demoRuntime.target.y, -2000, 2000, 0.1);
  const demoTargetZInput = createNumberInput(demoRuntime.target.z, -2000, 2000, 0.1);

  const demoFromFkBtn = document.createElement("button");
  demoFromFkBtn.className = "ghost-btn";
  demoFromFkBtn.textContent = "Target <- FK";
  demoFromFkBtn.title = "Use current FK TCP as target.";
  const demoSolveIkBtn = document.createElement("button");
  demoSolveIkBtn.textContent = "Solve IK + Apply";
  demoSolveIkBtn.title = "Solve IK from target and drive J1~J4 (demo mode).";
  const demoRunFeaBtn = document.createElement("button");
  demoRunFeaBtn.className = "ghost-btn";
  demoRunFeaBtn.textContent = "Refresh Pseudo-FEA";
  demoRunFeaBtn.title = "Recompute pseudo stress/deformation from current pose.";
  const demoClearFeaBtn = document.createElement("button");
  demoClearFeaBtn.className = "ghost-btn";
  demoClearFeaBtn.textContent = "Clear Pseudo-FEA";
  demoClearFeaBtn.title = "Clear stress color/deformation overlay.";
  demoTools.append(
    createControlField("Enable Demo IK/FEA", demoEnabledInput),
    createControlField("Auto FEA", demoAutoFeaInput),
    createControlField("Elbow Branch", demoElbowSelect),
    createControlField("Wrist Pitch (deg)", demoWristPitchInput),
    createControlField("Payload (N)", demoPayloadInput),
    createControlField("Target X (robot_local)", demoTargetXInput),
    createControlField("Target Y (robot_local)", demoTargetYInput),
    createControlField("Target Z (robot_local)", demoTargetZInput),
    demoFromFkBtn,
    demoSolveIkBtn,
    demoRunFeaBtn,
    demoClearFeaBtn
  );
  setControlFieldLabels(demoTools, ["Enable Demo IK+PseudoFEA", "Auto Refresh PseudoFEA", "Elbow Branch", "Wrist Pitch (deg)", "Payload (N)", "Target X (robot_local)", "Target Y (robot_local)", "Target Z (robot_local)"]);

  const demoLegend = document.createElement("p");
  demoLegend.className = "demo-legend";
  demoLegend.textContent = "Legend: Purple=IK target, Blue=current FK, line color=error level.";
  const demoVisualGrid = document.createElement("div");
  demoVisualGrid.className = "demo-visual-grid";

  const demoStatusRow = document.createElement("div");
  demoStatusRow.className = "demo-status-row";
  const demoReachBadge = document.createElement("span");
  demoReachBadge.className = "demo-badge";
  const demoFeaBadge = document.createElement("span");
  demoFeaBadge.className = "demo-badge";
  demoStatusRow.append(demoReachBadge, demoFeaBadge);

  const createDemoMetric = (labelText) => {
    const row = document.createElement("div");
    row.className = "demo-metric-row";

    const label = document.createElement("span");
    label.className = "demo-metric-label";
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = "demo-metric-value";
    value.textContent = "--";

    const track = document.createElement("div");
    track.className = "demo-metric-track";
    const fill = document.createElement("div");
    fill.className = "demo-metric-fill";
    track.appendChild(fill);

    row.append(label, value, track);
    return { row, value, fill };
  };
  const ikErrorMetric = createDemoMetric("IK Position Error");
  const stressJ2Metric = createDemoMetric("J2 Stress Ratio");
  const stressJ3Metric = createDemoMetric("J3 Stress Ratio");
  const stressJ4Metric = createDemoMetric("J4 Stress Ratio");
  const deformMetric = createDemoMetric("Total Deformation");
  const demoTrendWrap = document.createElement("div");
  demoTrendWrap.className = "demo-trend";
  const demoTrendTitle = document.createElement("div");
  demoTrendTitle.className = "demo-trend-title";
  const demoTrendWindowSelect = createSelectInput(
    DEMO_TREND_WINDOW_OPTIONS.map((ms) => ({
      value: String(ms),
      label: `${Math.round(ms / 1000)}s`
    })),
    String(demoTrendWindowMs)
  );
  demoTrendWindowSelect.className = "demo-trend-window-select";
  const demoTrendWindowField = createControlField("Trend Window", demoTrendWindowSelect);
  demoTrendWindowField.classList.add("demo-trend-window-field");
  const demoTrendClearBtn = document.createElement("button");
  demoTrendClearBtn.type = "button";
  demoTrendClearBtn.className = "ghost-btn demo-trend-clear-btn";
  demoTrendClearBtn.textContent = "Clear Trend";
  demoTrendClearBtn.title = "Clear trend chart history.";
  const demoTrendToolbar = document.createElement("div");
  demoTrendToolbar.className = "demo-trend-toolbar";
  demoTrendToolbar.append(demoTrendWindowField, demoTrendClearBtn);
  const updateDemoTrendTitle = () => {
    const sec = Math.round(normalizeDemoTrendWindowMs(demoTrendWindowMs) / 1000);
    demoTrendTitle.textContent = `Trend (${sec}s): error / stress / deformation`;
  };
  updateDemoTrendTitle();
  const demoTrendCanvas = document.createElement("canvas");
  demoTrendCanvas.className = "demo-trend-canvas";
  demoTrendWrap.append(demoTrendTitle, demoTrendToolbar, demoTrendCanvas);

  demoVisualGrid.append(
    demoStatusRow,
    demoTrendWrap,
    ikErrorMetric.row,
    stressJ2Metric.row,
    stressJ3Metric.row,
    stressJ4Metric.row,
    deformMetric.row
  );

  const demoReadout = document.createElement("pre");
  demoReadout.className = "demo-readout";

  const getDemoTargetInput = () => ({
    x: clampNumber(demoTargetXInput.value, -2000, 2000, demoRuntime.target.x),
    y: clampNumber(demoTargetYInput.value, -2000, 2000, demoRuntime.target.y),
    z: clampNumber(demoTargetZInput.value, -2000, 2000, demoRuntime.target.z)
  });

  const setDemoTargetInput = (target) => {
    if (!target) return;
    demoTargetXInput.value = String(Number(target.x || 0));
    demoTargetYInput.value = String(Number(target.y || 0));
    demoTargetZInput.value = String(Number(target.z || 0));
  };

  const formatTriplet = (obj) => {
    if (!obj) return "(n/a)";
    const x = Number(obj.x || 0).toFixed(2);
    const y = Number(obj.y || 0).toFixed(2);
    const z = Number(obj.z || 0).toFixed(2);
    return `(${x}, ${y}, ${z})`;
  };

  const metricToneColor = (ratio) => {
    const r = clampNumber(ratio, 0, 1, 0);
    if (r < 0.42) return "#35c679";
    if (r < 0.75) return "#f8a61f";
    return "#ff4a45";
  };

  const setMetricValue = (metric, ratio, valueText) => {
    if (!metric) return;
    const safeRatio = clampNumber(ratio, 0, 1, 0);
    metric.value.textContent = valueText;
    metric.fill.style.width = `${(safeRatio * 100).toFixed(1)}%`;
    metric.fill.style.background = metricToneColor(safeRatio);
  };

  const setBadgeState = (badge, text, tone = "neutral") => {
    if (!badge) return;
    badge.textContent = text;
    badge.className = `demo-badge tone-${tone}`;
  };

  const updateDemoReadout = () => {
    const fk = runDemoForwardFromCurrentPose();
    const ikPreview = runDemoInverseKinematics(demoArmModel, demoRuntime.target, {
      elbow: demoRuntime.elbow,
      wristPitchDeg: demoRuntime.wristPitchDeg
    });
    const ik = demoRuntime.lastIk;
    const fea = demoRuntime.lastFea;

    const target = {
      x: toFiniteNumber(demoRuntime.target?.x, 0),
      y: toFiniteNumber(demoRuntime.target?.y, 0),
      z: toFiniteNumber(demoRuntime.target?.z, 0)
    };
    const liveError = {
      x: target.x - toFiniteNumber(fk?.tcp?.x, 0),
      y: target.y - toFiniteNumber(fk?.tcp?.y, 0),
      z: target.z - toFiniteNumber(fk?.tcp?.z, 0)
    };
    const liveErrorNorm = Math.hypot(liveError.x, liveError.y, liveError.z);
    const feaMaxRatio = Number.isFinite(Number(fea?.summary?.maxRatio))
      ? Number(fea.summary.maxRatio)
      : NaN;
    const feaDeformationMm = Number.isFinite(Number(fea?.summary?.totalDeformationMm))
      ? Number(fea.summary.totalDeformationMm)
      : NaN;

    updateDemoOverlay({
      forceVisible: demoRuntime.enabled,
      fk,
      ikPreview
    });

    const ikErrorRatio = clampNumber(liveErrorNorm / 40, 0, 1, 0);
    setMetricValue(ikErrorMetric, ikErrorRatio, `${liveErrorNorm.toFixed(2)} mm`);

    if (ikPreview) {
      setBadgeState(
        demoReachBadge,
        ikPreview.reachable ? "IK reachable" : "IK unreachable (outside workspace)",
        ikPreview.reachable ? "ok" : "bad"
      );
    } else {
      setBadgeState(demoReachBadge, "IK not solved", "neutral");
    }

    if (fea?.summary) {
      const r2 = clampNumber(Number(fea.byTarget?.j2?.stressRatio ?? 0), 0, 1.2, 0);
      const r3 = clampNumber(Number(fea.byTarget?.j3?.stressRatio ?? 0), 0, 1.2, 0);
      const r4 = clampNumber(Number(fea.byTarget?.j4?.stressRatio ?? 0), 0, 1.2, 0);
      setMetricValue(stressJ2Metric, r2 / 1.2, `${r2.toFixed(2)} ratio`);
      setMetricValue(stressJ3Metric, r3 / 1.2, `${r3.toFixed(2)} ratio`);
      setMetricValue(stressJ4Metric, r4 / 1.2, `${r4.toFixed(2)} ratio`);

      const deformMm = Number(fea.summary.totalDeformationMm || 0);
      setMetricValue(deformMetric, clampNumber(deformMm / 18, 0, 1, 0), `${deformMm.toFixed(2)} mm`);

      const maxRatio = Number(fea.summary.maxRatio || 0);
      setBadgeState(
        demoFeaBadge,
        `Pseudo-FEA max ratio ${maxRatio.toFixed(2)}`,
        maxRatio < 0.45 ? "ok" : (maxRatio < 0.8 ? "warn" : "bad")
      );
    } else {
      setMetricValue(stressJ2Metric, 0, "--");
      setMetricValue(stressJ3Metric, 0, "--");
      setMetricValue(stressJ4Metric, 0, "--");
      setMetricValue(deformMetric, 0, "--");
      setBadgeState(demoFeaBadge, "Pseudo-FEA not run", "neutral");
    }

    pushDemoTrendSample({
      errorMm: liveErrorNorm,
      maxRatio: feaMaxRatio,
      deformationMm: feaDeformationMm
    });
    drawDemoTrendChart(demoTrendCanvas);

    const lines = [];
    lines.push(`Mode: ${demoRuntime.enabled ? "Demo ON" : "Demo OFF"} (for fast visualization, not physical truth)`);
    lines.push(
      `Assembly Lock: ${assemblyLockRuntime.enabled ? "ON" : "OFF"}, ` +
      `coupling=${assemblyLockRuntime.disableCouplings ? "disabled" : "enabled"}, ` +
      `autoPivot=${assemblyLockRuntime.autoInferPivots ? "on" : "off"}`
    );
    lines.push(`Trend Window: ${Math.round(normalizeDemoTrendWindowMs(demoTrendWindowMs) / 1000)}s`);
    lines.push(
      `Geometry (mm): H=${demoArmModel.baseHeight.toFixed(2)} ` +
      `L2=${demoArmModel.link2.toFixed(3)} L3=${demoArmModel.link3.toFixed(3)} Tool=${demoArmModel.tool.toFixed(2)}`
    );
    lines.push(`FK (robot_local): ${formatTriplet(fk?.tcp)}`);
    lines.push(`Target (robot_local): ${formatTriplet(target)}`);
    lines.push(
      `Error: dx=${liveError.x.toFixed(3)} dy=${liveError.y.toFixed(3)} dz=${liveError.z.toFixed(3)} ` +
      `|d|=${liveErrorNorm.toFixed(3)} mm`
    );

    if (ikPreview) {
      lines.push(
        `IK Preview: elbow=${ikPreview.elbow}, reachable=${ikPreview.reachable ? "yes" : "no"}, ` +
        `residual=${Number(ikPreview.errorNorm || 0).toFixed(3)} mm`
      );
    }

    if (ik?.jointDeg) {
      lines.push(
        `Solve IK: J1=${ik.jointDeg.j1.toFixed(2)} J2=${ik.jointDeg.j2.toFixed(2)} ` +
        `J3=${ik.jointDeg.j3.toFixed(2)} J4=${ik.jointDeg.j4.toFixed(2)}`
      );
    } else {
      lines.push("Solve IK: not executed");
    }

    if (fea?.summary) {
      lines.push(
        `Pseudo-FEA: payload=${Number(fea.payloadNewton || 0).toFixed(2)}N, ` +
        `maxRatio=${Number(fea.summary.maxRatio || 0).toFixed(3)}, ` +
        `maxStress=${Number(fea.summary.maxStressMpa || 0).toFixed(3)}MPa, ` +
        `deformation=${Number(fea.summary.totalDeformationMm || 0).toFixed(3)}mm`
      );
    } else {
      lines.push("Pseudo-FEA: not executed");
    }
    demoReadout.textContent = lines.join("\n");
  
  };

  const commitDemoRuntimeFromInputs = ({ syncTarget = true } = {}) => {
    demoRuntime.enabled = !!demoEnabledInput.checked;
    demoRuntime.autoFea = !!demoAutoFeaInput.checked;
    demoRuntime.elbow = String(demoElbowSelect.value || "down").trim().toLowerCase() === "up" ? "up" : "down";
    demoRuntime.wristPitchDeg = clampNumber(demoWristPitchInput.value, -180, 180, demoRuntime.wristPitchDeg);
    demoRuntime.payloadNewton = clampNumber(demoPayloadInput.value, 0, 1000, demoRuntime.payloadNewton);
    if (syncTarget) {
      demoRuntime.target = getDemoTargetInput();
      setDemoTargetInput(demoRuntime.target);
    }
    demoWristPitchInput.value = String(demoRuntime.wristPitchDeg);
    demoPayloadInput.value = String(demoRuntime.payloadNewton);
    syncDemoRuntimeIntoLoadedConfig();
    updateDemoReadout();
  };

  demoReadoutUpdater = updateDemoReadout;
  drawDemoTrendChart(demoTrendCanvas);
  updateDemoReadout();

  const coordReadout = document.createElement("pre");
  coordReadout.className = "coord-readout";

  const getProbeInputPoint = () => new THREE.Vector3(
    clampNumber(coordXInput.value, -99999, 99999, 0),
    clampNumber(coordYInput.value, -99999, 99999, 0),
    clampNumber(coordZInput.value, -99999, 99999, 0)
  );

  const setProbeInputPoint = (vec) => {
    if (!vec) return;
    coordXInput.value = String(Number(vec.x || 0));
    coordYInput.value = String(Number(vec.y || 0));
    coordZInput.value = String(Number(vec.z || 0));
  };

  const updateCoordReadout = (worldPoint = coordProbeLastWorldPoint, sourceSpace = coordSpaceSelect.value) => {
    if (!worldPoint) {
      coordReadout.textContent = buildCoordinateSpaceGuideText();
      return;
    }
    coordReadout.textContent = `${buildCoordinateProbeReport(worldPoint, sourceSpace)}\n\n${buildCoordinateSpaceGuideText()}`;
  };

  coordProbeReadoutUpdater = () => {
    if (coordProbeLastWorldPoint && coordSpaceSelect.value === "selected_parent_local") {
      const converted = convertPointFromWorldToSpace(coordProbeLastWorldPoint, "selected_parent_local");
      if (converted.point) {
        setProbeInputPoint(converted.point);
      }
    }
    updateCoordReadout(coordProbeLastWorldPoint, coordSpaceSelect.value);
  };
  coordProbeReadoutUpdater();

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

  let presetList = readPresetList();
  const sortPresetList = () => {
    presetList.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  };

  const refreshPresetOptions = (selectedName = "") => {
    sortPresetList();
    presetSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = presetList.length > 0 ? "Select a preset..." : "No presets";
    presetSelect.appendChild(placeholder);

    presetList.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.name;
      option.textContent = preset.name;
      presetSelect.appendChild(option);
    });

    const targetSelect = selectedName || presetSelect.value;
    if (targetSelect && presetList.some((preset) => preset.name === targetSelect)) {
      presetSelect.value = targetSelect;
    } else {
      presetSelect.value = "";
    }

    const hasSelection = Boolean(presetSelect.value);
    loadPresetBtn.disabled = !hasSelection;
    loadSendPresetBtn.disabled = !hasSelection;
    deletePresetBtn.disabled = !hasSelection;
  };

  const saveCurrentPreset = () => {
    let name = normalizePresetName(presetNameInput.value);
    if (!name) {
      name = buildAutoPresetName();
      presetNameInput.value = name;
    }

    const record = buildPresetRecord(name);
    const idx = presetList.findIndex((item) => item.name === name);
    if (idx >= 0) {
      presetList[idx] = record;
    } else {
      presetList.push(record);
    }

    sortPresetList();
    if (presetList.length > PRESET_MAX_COUNT) {
      presetList = presetList.slice(0, PRESET_MAX_COUNT);
    }

    if (!writePresetList(presetList)) {
      return;
    }

    refreshPresetOptions(name);
    log("Preset saved", { name });
  };

  const applyPresetByName = (name, sendMoves = false) => {
    const preset = presetList.find((item) => item.name === name);
    if (!preset) {
      log("Preset not found", { name });
      return;
    }

    applyPresetGlobalSettings(preset, { pollInput, delayInput, globalRealtimeInput });

    const byTarget = new Map();
    const byName = new Map();
    const joints = Array.isArray(preset.joints) ? preset.joints : [];
    joints.forEach((joint) => {
      if (!joint || typeof joint !== "object") return;
      if (joint.target) byTarget.set(String(joint.target), joint);
      if (joint.name) byName.set(String(joint.name), joint);
    });

    states.forEach((state, idx) => {
      const presetJoint = byTarget.get(state.target) || byName.get(state.name) || joints[idx] || null;
      if (presetJoint) {
        applyPresetJointToState(state, presetJoint);
      }

      if (sendMoves) {
        setTimeout(() => {
          sendMoveCommand(state, { silentWhenClosed: true });
        }, idx * 90);
      }
    });

    log(sendMoves ? "Preset loaded and sent" : "Preset loaded", { name });
  };

  const deletePresetByName = (name) => {
    const oldLen = presetList.length;
    presetList = presetList.filter((item) => item.name !== name);
    if (presetList.length === oldLen) return;

    if (!writePresetList(presetList)) {
      return;
    }

    refreshPresetOptions("");
    log("Preset deleted", { name });
  };

  const writeJointConfig = async ({ selectedOnly = false } = {}) => {
    if (selectedOnly && !selectedJointState) {
      log("No selected joint for write operation.");
      return;
    }

    try {
      const targetStates = collectWriteTargetStates({ selectedOnly });

      if (isWsOpen()) {
        try {
          const gatewayConfig = await readJointConfigViaGateway();
          const config = buildRuntimeJointConfig({
            selectedOnly,
            baseConfig: gatewayConfig,
            targetStates
          });
          await writeJointConfigViaGateway(config);
          loadedJointConfig = cloneConfig(config);
          applyMotionLocksFromConfig(loadedJointConfig);
          log(selectedOnly
            ? "Selected joint written to joints.json (gateway direct write)."
            : "All joints written to joints.json (gateway direct write).");
          return;
        } catch (gatewayError) {
          log("Gateway direct write failed, fallback to browser file write.", { error: String(gatewayError) });
        }
      }

      const handle = supportsFileSystemAccess()
        ? await ensureJointConfigFileHandle({ promptIfMissing: true })
        : null;
      const fileConfig = await readJointConfigFromFileHandle(handle || jointConfigFileHandle);
      const config = buildRuntimeJointConfig({
        selectedOnly,
        baseConfig: fileConfig || loadedJointConfig || FALLBACK_CONFIG,
        targetStates
      });
      const result = await writeConfigToFileOrDownload(config, {
        preferFileName: "joints.json",
        fileHandle: handle || jointConfigFileHandle,
        promptForFileHandle: false
      });
      loadedJointConfig = cloneConfig(config);
      applyMotionLocksFromConfig(loadedJointConfig);

      if (result.method === "file") {
        log(selectedOnly ? "Selected joint written to joints.json" : "All joints written to joints.json");
      } else {
        log("Direct file write unavailable, exported as joints.json download.");
      }
    } catch (error) {
      log("Write joints.json failed", { error: String(error) });
    }
  };

  const locateCoordinateProbeFromInputs = () => {
    const inputPoint = getProbeInputPoint();
    const fromSpace = coordSpaceSelect.value;
    const converted = convertPointFromSpaceToWorld(inputPoint, fromSpace);
    if (!converted.point) {
      log("Coordinate locate failed", { space: fromSpace, error: converted.error });
      coordReadout.textContent = `${buildCoordinateSpaceGuideText()}

Error: ${String(converted.error || "unknown error")}`;
      return;
    }

    setProbeInputPoint(inputPoint);
    showCoordinateProbe(converted.point);
    updateCoordReadout(converted.point, fromSpace);
    log("Coordinate located", { space: fromSpace, point: [inputPoint.x, inputPoint.y, inputPoint.z] });
  };

  const useSelectedPivotAsProbePoint = () => {
    if (!selectedJointState) {
      const msg = "No selected joint parent object";
      log(msg);
      coordReadout.textContent = `${buildCoordinateSpaceGuideText()}

Error: ${String(converted.error || "unknown error")}`;
      return;
    }

    const pivotSpace = normalizePivotSpace(selectedJointState.pivotSpace, "world");
    const pivotValue = toVec3(selectedJointState.pivot);
    const worldPoint = pivotSpace === "local" ? robotLocalToWorld(pivotValue) : pivotValue;
    const toSpace = coordSpaceSelect.value;
    const converted = convertPointFromWorldToSpace(worldPoint, toSpace);
    if (!converted.point) {
      log("Pivot coordinate convert failed", { space: toSpace, error: converted.error });
      coordReadout.textContent = `${buildCoordinateSpaceGuideText()}

Error: ${String(converted.error || "unknown error")}`;
      return;
    }

    setProbeInputPoint(converted.point);
    showCoordinateProbe(worldPoint);
    updateCoordReadout(worldPoint, toSpace);
    log("Pivot coordinate converted", {
      joint: selectedJointState.name,
      pivotSpace,
      toSpace
    });
  };

  pollInput.addEventListener("change", () => {
    positionPollIntervalMs = clampInt(pollInput.value, 100, 3000);
    pollInput.value = String(positionPollIntervalMs);
    restartPositionPolling();
  });

  delayInput.addEventListener("change", () => {
    sliderAutoSendDelayMs = clampInt(delayInput.value, 20, 1200);
    delayInput.value = String(sliderAutoSendDelayMs);
  });

  globalRealtimeInput.addEventListener("change", () => {
    globalRealtimeSendEnabled = !!globalRealtimeInput.checked;
    if (!globalRealtimeSendEnabled) {
      states.forEach((state) => {
        if (state.autoSendTimer) {
          clearTimeout(state.autoSendTimer);
          state.autoSendTimer = null;
        }
      });
    }
  });

  frontViewBtn.addEventListener("click", () => {
    setPlaneView("xy");
  });

  sideViewBtn.addEventListener("click", () => {
    setPlaneView("yz");
  });

  topViewBtn.addEventListener("click", () => {
    setPlaneView("xz");
  });

  bindJointConfigBtn.addEventListener("click", async () => {
    try {
      const handle = await bindJointConfigFileHandle();
      if (handle) {
        log("Bound joints.json file. You can now one-click write.");
      } else {
        log("Bind canceled.");
      }
    } catch (error) {
      log("Bind joints.json failed", { error: String(error) });
    }
  });

  writeSelectedJointBtn.addEventListener("click", async () => {
    await writeJointConfig({ selectedOnly: true });
  });

  writeAllJointsBtn.addEventListener("click", async () => {
    await writeJointConfig({ selectedOnly: false });
  });

  downloadJointConfigBtn.addEventListener("click", () => {
    const targetStates = collectWriteTargetStates({ selectedOnly: false });
    const config = buildRuntimeJointConfig({ selectedOnly: false, targetStates });
    const text = serializeConfig(config);
    downloadConfigFile(text, "joints.json");
    loadedJointConfig = cloneConfig(config);
    applyMotionLocksFromConfig(loadedJointConfig);
    log("joints.json downloaded from current runtime parameters.");
  });

  locateCoordBtn.addEventListener("click", () => {
    locateCoordinateProbeFromInputs();
  });

  usePivotBtn.addEventListener("click", () => {
    useSelectedPivotAsProbePoint();
  });

  hideCoordBtn.addEventListener("click", () => {
    hideCoordinateProbe();
    updateCoordReadout(null, coordSpaceSelect.value);
    log("Hide coordinate probe");
  });

  alignFrameBtn.addEventListener("click", () => {
    const result = alignRobotFrameByJ1AndFront();
    if (!result?.ok) {
      log("Axis line edit apply failed", { error: String(result?.error || "unknown") });
      return;
    }
    log("Axis line updated from pick", {
      originWorld: result.originWorld,
      j1AxisWorld: result.j1AxisWorld,
      frameCalibration: result.frameCalibration,
      frontTargetUsed: result.frontTargetUsed,
      frontHorizontalLen: result.frontHorizontalLen,
      yawMethod: result.yawMethod
    });
  });

  coordSpaceSelect.addEventListener("change", () => {
    if (coordProbeLastWorldPoint) {
      const converted = convertPointFromWorldToSpace(coordProbeLastWorldPoint, coordSpaceSelect.value);
      if (converted.point) {
        setProbeInputPoint(converted.point);
      }
    }
    updateCoordReadout(coordProbeLastWorldPoint, coordSpaceSelect.value);
  });

  [coordXInput, coordYInput, coordZInput].forEach((input) => {
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        locateCoordinateProbeFromInputs();
      }
    });
  });

  [physicalPivotXInput, physicalPivotYInput, physicalPivotZInput].forEach((input) => {
    input.addEventListener("change", () => {
      captureActivePhysicalPivotInputs();
      syncPhysicalInputsFromDraft();
    });
  });

  physicalTargetSelect.addEventListener("change", () => {
    captureActivePhysicalPivotInputs();
    syncPhysicalInputsFromDraft();
  });

  physicalSpaceSelect.addEventListener("change", () => {
    captureActivePhysicalPivotInputs();
    convertPhysicalDraftSpace(physicalSpaceSelect.value);
    syncPhysicalInputsFromDraft();
  });

  physicalReloadBtn.addEventListener("click", () => {
    captureActivePhysicalPivotInputs();
    pullPhysicalDraftFromConfig();
    syncPhysicalInputsFromDraft();
    log("Physical config reloaded from current joints.json state");
  });

  physicalUseSelectedPivotBtn.addEventListener("click", () => {
    if (!selectedJointState) {
      log("No selected joint for use-pivot operation.");
      return;
    }

    captureActivePhysicalPivotInputs();
    const key = String(physicalTargetSelect.value || "j2");
    if (!physicalDraft.joints[key]) return;

    const worldPoint = getJointPivotWorldFromState(selectedJointState);
    const point = convertWorldPointToPhysicalSpace(worldPoint, physicalDraft.space);
    physicalDraft.joints[key].pivot = [point.x, point.y, point.z];
    syncPhysicalInputsFromDraft();
    showCoordinateProbe(worldPoint);
    updateCoordReadout(worldPoint, "world");
    log("Loaded selected joint pivot to physical calibration", {
      from: selectedJointState.name,
      to: key,
      space: physicalDraft.space
    });
  });

  physicalApplyBtn.addEventListener("click", () => {
    applyPhysicalDraftToRuntime();
  });

  axisTargetSelect.addEventListener("change", () => {
    syncAxisInputsFromRuntime();
    if (axisLineEditorActive) {
      const target = String(axisTargetSelect.value || "j2");
      startAxisLineEditor(target);
      const state = findJointStateByTarget(target);
      if (state) {
        setSelectedJointState(state);
      }
    }
    syncAxisEditorButtons();
  });

  axisReloadBtn.addEventListener("click", () => {
    syncAxisInputsFromRuntime();
  });

  axisApplyBtn.addEventListener("click", () => {
    applyAxisInputsToRuntime();
  });

  axisShowBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const state = findJointStateByTarget(target);
    if (!state) {
      log("Axis target joint not found", { target });
      return;
    }
    setSelectedJointState(state);
  });

  axisDragBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const editingThis = axisLineEditorActive && axisLineEditorTarget === target;
    if (editingThis && axisLineEditorMode === "direction") {
      stopAxisLineEditor();
      log("Axis drag editor stopped", { target });
      return;
    }
    startAxisLineEditor(target);
    setAxisLineEditorMode("direction");
    const state = findJointStateByTarget(target);
    if (state) {
      setSelectedJointState(state);
    }
    syncAxisInputsFromRuntime();
    syncAxisEditorButtons();
    log("Axis direction drag mode enabled", { target });
  });

  axisPickBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const editingThis = axisLineEditorActive && axisLineEditorTarget === target;
    if (editingThis && axisLineEditorMode === "pick") {
      setAxisLineEditorMode("direction");
      syncAxisEditorButtons();
      log("Axis point-pick mode disabled", { target });
      return;
    }

    startAxisLineEditor(target);
    setAxisLineEditorMode("pick");
    const state = findJointStateByTarget(target);
    if (state) {
      setSelectedJointState(state);
    }
    syncAxisInputsFromRuntime();
    syncAxisEditorButtons();
    log("Axis point-pick mode enabled (click mesh to create outside->inside axis)", { target });
  });

  axisPinBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    if (!axisLineEditorActive || axisLineEditorTarget !== target) {
      startAxisLineEditor(target);
      const state = findJointStateByTarget(target);
      if (state) {
        setSelectedJointState(state);
      }
    }

    setAxisLineEditorLinePinned(!axisLineEditorLinePinned);
    syncAxisEditorButtons();
    log(axisLineEditorLinePinned ? "Axis line position pinned" : "Axis line position unpinned", { target });
  });

  axisSlideBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const editingThis = axisLineEditorActive && axisLineEditorTarget === target;
    if (editingThis && axisLineEditorMode === "pivot_slide") {
      setAxisLineEditorMode("direction");
      syncAxisEditorButtons();
      log("Axis pivot-slide mode disabled", { target });
      return;
    }

    startAxisLineEditor(target);
    if (!axisLineEditorLinePinned) {
      setAxisLineEditorLinePinned(true);
    }
    setAxisLineEditorMode("pivot_slide");
    const state = findJointStateByTarget(target);
    if (state) {
      setSelectedJointState(state);
    }
    syncAxisInputsFromRuntime();
    syncAxisEditorButtons();
    log("Axis pivot-slide mode enabled (pivot constrained on axis)", {
      target,
      linePinned: axisLineEditorLinePinned
    });
  });

  demoTrendWindowSelect.addEventListener("change", () => {
    demoTrendWindowMs = normalizeDemoTrendWindowMs(demoTrendWindowSelect.value, demoTrendWindowMs);
    demoTrendWindowSelect.value = String(demoTrendWindowMs);
    trimDemoTrendHistory();
    updateDemoTrendTitle();
    drawDemoTrendChart(demoTrendCanvas);
    updateDemoReadout();
    log("Demo trend window changed", { windowSeconds: Math.round(demoTrendWindowMs / 1000) });
  });

  demoTrendClearBtn.addEventListener("click", () => {
    resetDemoTrendHistory();
    drawDemoTrendChart(demoTrendCanvas);
    log("Demo trend history cleared");
  });

  demoEnabledInput.addEventListener("change", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    resetDemoTrendHistory();
    updateDemoTrendTitle();
    drawDemoTrendChart(demoTrendCanvas);
    if (!demoRuntime.enabled) {
      demoRuntime.lastFea = null;
      clearDemoFeaVisualization();
    } else if (demoRuntime.autoFea) {
      runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
    }
    updateDemoReadout();
    log("Demo IK/FEA mode changed", { enabled: demoRuntime.enabled, autoFea: demoRuntime.autoFea });
  });

  demoAutoFeaInput.addEventListener("change", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    if (demoRuntime.enabled && demoRuntime.autoFea) {
      runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
    }
    updateDemoReadout();
  });

  [demoElbowSelect, demoWristPitchInput, demoPayloadInput].forEach((input) => {
    input.addEventListener("change", () => {
      commitDemoRuntimeFromInputs({ syncTarget: true });
      if (demoRuntime.enabled && demoRuntime.autoFea) {
        runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
      }
      updateDemoReadout();
    });
  });

  [demoTargetXInput, demoTargetYInput, demoTargetZInput].forEach((input) => {
    input.addEventListener("change", () => {
      commitDemoRuntimeFromInputs({ syncTarget: true });
    });
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        commitDemoRuntimeFromInputs({ syncTarget: true });
      }
    });
  });

  demoFromFkBtn.addEventListener("click", () => {
    const fk = runDemoForwardFromCurrentPose();
    demoRuntime.lastFk = fk;
    if (fk?.tcp) {
      demoRuntime.target = { x: fk.tcp.x, y: fk.tcp.y, z: fk.tcp.z };
      setDemoTargetInput(demoRuntime.target);
      const worldPoint = robotLocalToWorld(new THREE.Vector3(fk.tcp.x, fk.tcp.y, fk.tcp.z));
      showCoordinateProbe(worldPoint);
      updateCoordReadout(worldPoint, "robot_local");
    }
    syncDemoRuntimeIntoLoadedConfig();
    updateDemoReadout();
    log("Demo target captured from FK", { target: demoRuntime.target });
  });

  demoSolveIkBtn.addEventListener("click", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    const ik = runDemoInverseAndApply(demoRuntime.target, {
      elbow: demoRuntime.elbow,
      wristPitchDeg: demoRuntime.wristPitchDeg
    });
    if (ik?.target) {
      const worldPoint = robotLocalToWorld(new THREE.Vector3(ik.target.x, ik.target.y, ik.target.z));
      showCoordinateProbe(worldPoint);
      updateCoordReadout(worldPoint, "robot_local");
    }
    updateDemoReadout();
    log("Demo IK solved", {
      reachable: ik?.reachable === true,
      errorMm: Number(ik?.errorNorm || 0).toFixed(3)
    });
  });

  demoRunFeaBtn.addEventListener("click", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    const fea = runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
    updateDemoReadout();
    log("Pseudo FEA updated", {
      payloadN: Number(fea?.payloadNewton || 0).toFixed(2),
      maxRatio: Number(fea?.summary?.maxRatio || 0).toFixed(3)
    });
  });

  demoClearFeaBtn.addEventListener("click", () => {
    demoRuntime.lastFea = null;
    clearDemoFeaVisualization();
    updateDemoReadout();
    log("Pseudo FEA visualization cleared");
  });

  presetSelect.addEventListener("change", () => {
    const hasSelection = Boolean(presetSelect.value);
    loadPresetBtn.disabled = !hasSelection;
    loadSendPresetBtn.disabled = !hasSelection;
    deletePresetBtn.disabled = !hasSelection;
    if (hasSelection) {
      presetNameInput.value = presetSelect.value;
    }
  });

  presetNameInput.addEventListener("change", () => {
    presetNameInput.value = normalizePresetName(presetNameInput.value);
  });

  savePresetBtn.addEventListener("click", () => {
    saveCurrentPreset();
  });

  loadPresetBtn.addEventListener("click", () => {
    const name = presetSelect.value;
    if (!name) return;
    applyPresetByName(name, false);
  });

  loadSendPresetBtn.addEventListener("click", () => {
    const name = presetSelect.value;
    if (!name) return;
    applyPresetByName(name, true);
  });

  deletePresetBtn.addEventListener("click", () => {
    const name = presetSelect.value;
    if (!name) return;
    deletePresetByName(name);
  });

  queryAllBtn.addEventListener("click", () => {
    queryAllPositionsStaggered();
    const ids = buildPollIdList();
    ids.forEach((id, idx) => {
      setTimeout(() => send({ type: "vin", id }, true), idx * 70);
      setTimeout(() => send({ type: "temp", id }, true), idx * 70 + 30);
      setTimeout(() => send({ type: "id_read", id }, true), idx * 70 + 45);
    });
  });

  defaultBtn.addEventListener("click", () => {
    states.forEach((state, idx) => {
      applyJointVisual(state, state.defaultPos);
      if (shouldRealtimeSend(state)) {
        setTimeout(() => sendMoveCommand(state, { silentWhenClosed: true }), idx * 90);
      }
    });
  });

  hardResetBtn.addEventListener("click", () => {
    resetArmToDefaults({ silentWhenClosed: false });
    log("Hard reset triggered", { jointCount: jointStates.length });
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

  if (FRONT_MINIMAL_MODE) {
    const commonSection = createPanelSection(
      "Arm Controls",
      "Essential runtime actions for real-arm commissioning.",
      [panelTools],
      { collapsible: false }
    );
    servoPanel.append(panelHeader, commonSection, grid);
  } else {
    const commonSection = createPanelSection(
      "Global Controls",
      "Polling, camera presets, and config write actions.",
      [panelTools, viewTools, configTools],
      { collapsible: false }
    );
    const presetSection = createPanelSection(
      "Presets",
      "Save/load parameter snapshots for quick demos.",
      [presetTools],
      { collapsible: true, open: false }
    );
    const coordSection = createPanelSection(
      "Coordinate Probe",
      "Locate points in 3D and compare coordinate spaces.",
      [coordTools, coordReadout],
      { collapsible: true, open: true }
    );
    const physicalSection = createPanelSection(
      "Closed-Chain & Axis",
      "Edit J2/J3/J4 linkage params and axis lines.",
      [physicalTools],
      { collapsible: true, open: true }
    );
    const demoSection = createPanelSection(
      "IK + Pseudo-FEA Demo",
      "Fast visual demo mode; not a real material simulation.",
      [demoTools, demoLegend, demoVisualGrid, demoReadout],
      { collapsible: true, open: false }
    );

    servoPanel.append(
      panelHeader,
      commonSection,
      presetSection,
      coordSection,
      physicalSection,
      demoSection,
      grid
    );
  }
  replaceMojibakeInDom(servoPanel);
}

function buildServoPanelFallback(error) {
  if (!servoPanel) return;
  servoPanel.innerHTML = "";

  const section = document.createElement("section");
  section.className = "panel-section";

  const title = document.createElement("h3");
  title.className = "panel-section-title";
  title.textContent = "Debug Panel Load Failed";
  const hint = document.createElement("p");
  hint.className = "panel-section-hint";
  hint.textContent = "Please refresh. If it still fails, check logs and report errors.";

  const retryBtn = document.createElement("button");
  retryBtn.textContent = "Reload Debug Panel";
  retryBtn.addEventListener("click", () => {
    renderServoPanelSafely(jointStates);
  });

  const detail = document.createElement("pre");
  detail.className = "demo-readout";
  detail.textContent = `Error Details: ${String(error || "unknown error")}`;
  section.append(title, hint, retryBtn, detail);
  servoPanel.append(section);
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
  jointStates.length = 0;
  reachableServoIds.clear();
  noPosMuteUntilById.clear();
  lastActualIdByQueryId.clear();
  lastVoltageById.clear();
  lastTempById.clear();
  expectedQueryId = null;
  const configPivotSpace = normalizePivotSpace(config?.pivotSpace, "world");
  const physicalPivotByTarget = new Map();
  const physicalRaw = config?.physicalKinematics;
  if (physicalRaw && typeof physicalRaw === "object") {
    const pointSpace = String(physicalRaw.space || "robot_local").trim().toLowerCase();
    const jointsRaw = physicalRaw.joints && typeof physicalRaw.joints === "object" ? physicalRaw.joints : {};
    Object.keys(jointsRaw).forEach((key) => {
      const jointRaw = jointsRaw[key];
      if (!jointRaw || typeof jointRaw !== "object") return;
      const target = String(jointRaw.target || key || "");
      if (!target) return;
      const pivotLocal = toRobotLocalFromConfigPoint(jointRaw.pivot, pointSpace);
      if (!pivotLocal) return;
      physicalPivotByTarget.set(target, [pivotLocal.x, pivotLocal.y, pivotLocal.z]);
    });
  }

  for (const joint of config.joints) {
    const target = String(joint.target || "");
    const legacyPivot = parseOptionalVec3(joint.pivot);
    const physicalPivot = physicalPivotByTarget.get(target) || null;
    const pivotValue = legacyPivot || physicalPivot || [0, 0, 0];
    const state = {
      name: String(joint.name || `J${jointStates.length + 1}`),
      target,
      parentTarget: String(joint.parentTarget || defaultParentTargetForTarget(target)).trim().toLowerCase(),
      uiHidden: joint.uiHidden === true,
      controlRole: String(joint.controlRole || ""),
      derivedType: normalizeDerivedType(joint.derivedType),
      derivedSourceTarget: String(joint.derivedSourceTarget || "").trim().toLowerCase(),
      derivedSourceTargets: Array.isArray(joint.derivedSourceTargets)
        ? joint.derivedSourceTargets.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean)
        : [],
      derivedGain: toFiniteNumber(joint.derivedGain, 1),
      derivedOffsetDeg: toFiniteNumber(joint.derivedOffsetDeg, 0),
      servoId: clampInt(joint.servoId ?? (jointStates.length + 1), 1, 253),
      pivotSpace: normalizePivotSpace(joint.pivotSpace, configPivotSpace),
      closureEnabled: joint.closureEnabled === true,
      closureParentTarget: String(joint.closureParentTarget || ""),
      closureGain: toFiniteNumber(joint.closureGain, 1),
      closureMaxDeg: toFiniteNumber(joint.closureMaxDeg, 0),
      closureOffsetDeg: toFiniteNumber(joint.closureOffsetDeg, 0),
      closureInvert: joint.closureInvert === true,
      axis: safeAxis(joint.axis || "z"),
      invert: Boolean(joint.invert),
      min: clampInt(joint.min ?? 0, 0, 1000),
      max: clampInt(joint.max ?? 1000, 0, 1000),
      guardMin: clampInt(joint.guardMin ?? (joint.min ?? 0), 0, 1000),
      guardMax: clampInt(joint.guardMax ?? (joint.max ?? 1000), 0, 1000),
      minDeg: Number(joint.minDeg ?? -90),
      maxDeg: Number(joint.maxDeg ?? 90),
      commandScale: normalizeCommandScale(
        joint.commandScale,
        estimateDefaultCommandScaleByJointRange(joint.minDeg ?? -90, joint.maxDeg ?? 90)
      ),
      defaultPos: clampInt(joint.defaultPos ?? 500, 0, 1000),
      defaultTime: clampInt(joint.defaultTime ?? 300, 20, 30000),
      pivot: [pivotValue[0], pivotValue[1], pivotValue[2]],
      servoMapPoints: null,
      backlash: normalizeBacklashConfig(joint.backlash),
      lastCommandBasePos: null,
      lastCommandDir: 0,
      lastCommandSentPos: null,
      pivotGroup: pivotsByTarget?.[target] || null,
      targetGroup: groupsByTarget?.[target] || null,
      meshGroup: meshGroupsByTarget?.[target] || null,
      currentPos: 500,
      autoSendTimer: null,
      realtimeSendEnabled: true,
      lastServoIdForPoll: clampInt(joint.servoId ?? (jointStates.length + 1), 1, 253),
      idInput: null,
      rangeInput: null,
      valueInput: null,
      timeInput: null,
      minInput: null,
      maxInput: null,
      guardMinInput: null,
      guardMaxInput: null,
      minDegInput: null,
      maxDegInput: null,
      commandScaleInput: null,
      axisInput: null,
      invertInput: null,
      defaultPosInput: null,
      pivotXInput: null,
      pivotYInput: null,
      pivotZInput: null,
      realtimeInput: null,
      showAxisBtn: null,
      cardEl: null,
      idChipEl: null,
      actualIdChipEl: null,
      actualIdReadoutEl: null,
      posChipEl: null,
      degChipEl: null,
      vinChipEl: null,
      tempChipEl: null
    };

    normalizeJointLimits(state);
    enforceMotionAxisLockOnState(state, { syncUi: false });
    state.servoMapPoints = parseServoMapPoints(joint.servoMapPoints ?? joint.angleMap ?? null, state);
    state.pivot = normalizePivotArray(state.pivot, [0, 0, 0]);
    state.defaultPos = clampByGuard(state, state.defaultPos);
    state.currentPos = state.defaultPos;
    jointStates.push(state);
  }
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





