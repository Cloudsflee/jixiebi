import * as THREE from "./vendor/three/three.module.js";
import { OrbitControls } from "./vendor/three/jsm/controls/OrbitControls.js";
import { STLLoader } from "./vendor/three/jsm/loaders/STLLoader.js";
import {
  DEFAULT_PSEUDO_FEA_MODEL,
  normalizePseudoFeaModel
} from "./modules/demo_fea.js";
import {
  drawFeaChart as drawFeaChartCore,
  updateFeaVisualRuntime
} from "./modules/teaching_fea_runtime.js";
import { DEG2RAD, clamp, toFiniteNumber, toFixed3 } from "./modules/app_math.js";
import { computeFk as computeFkCore, solveIk as solveIkCore } from "./modules/teaching_kinematics.js";
import {
  alignRobotFrameByJ1AndFrontRuntime,
  buildRobotRuntime,
  createAxisHelperRuntime,
  createPartRecordRuntime,
  disposeRobotRuntime,
  fitCameraToRobotRuntime,
  getJointAxisWorldByNameRuntime,
  initSceneRuntime,
  isFeaTargetRuntime,
  jointNameFromTargetRuntime,
  loadPartMeshRuntime,
  normalizeJointRuntime,
  normalizeMeshNameRuntime,
  onResizeRuntime,
  parseFrontAxisVectorRuntime,
  resolveFrameCalibrationConfigRuntime
} from "./modules/runtime_scene_robot.js";
import {
  applyLessonRuntime,
  buildJointUiRuntime,
  buildLessonsUiRuntime,
  clearKinematicsDemoTimersRuntime,
  runOneClickDemoRuntime,
  setTeachingStageRuntime,
  stepLessonRuntime,
  toggleAutoLessonRuntime
} from "./modules/runtime_teaching_control.js";
import {
  initHardwareBridgeRuntime,
  readHardwareJointsRuntime,
  syncTwinToHardwareRuntime
} from "./modules/runtime_hardware_bridge.js";
import {
  buildControlDemoUiRuntime,
  runCaseDemoRuntime,
  setDemoPlayingRuntime,
  stopCaseDemoRuntime
} from "./modules/runtime_lab_demo.js";
import {
  focusFeaRiskSectionRuntime,
  getKinematicsTargetFromUiRuntime,
  projectTargetToReachableRuntime,
  refreshFeaTeachingUiRuntime,
  refreshKinematicsTeachingUiRuntime,
  refreshFeaTextsRuntime,
  refreshFeaInputUiRuntime,
  buildFeaInputControlsRuntime,
  buildFeaAnalysisContextRuntime,
  applyFeaPoseSourceRuntime,
  setFeaPayloadMassRuntime,
  applyFeaLoadScenarioRuntime,
  setFeaLoadDirectionRuntime,
  setFeaMaterialPresetRuntime,
  applyFeaLabCaseInputsRuntime,
  replayFeaHistoryMarkRuntime,
  reverseCheckRuntime,
  runFeaRuntime,
  runFeaStepRuntime,
  runKinematicsPathDemoRuntime,
  runKinematicsStepRuntime,
  setKinematicsChipRuntime,
  setKinematicsModeRuntime,
  setKinematicsStepRuntime,
  solveFkToUiRuntime,
  solveIkFromUiRuntime,
  toggleFeaAdvancedRuntime,
  toggleFeaAnimationRuntime,
  toggleFeaDeformStyleRuntime,
  toggleFeaHotspotRuntime,
  toggleKinematicsAdvancedRuntime,
  updateEefReadoutRuntime,
  updateFeaVisualRuntimeFacade,
  updateKinematicsReadoutRuntime
} from "./modules/runtime_kinematics_fea.js";
import {
  applyCalibrationRuntime,
  populateCalibrationUiRuntime,
  recomputeJointFramesRuntime,
  syncCalibrationInputsRuntime,
  writeSelectedJointRuntime
} from "./modules/runtime_calibration.js";
const TEACH_WEB_VERSION = "20260519-fea-inputs";
const TOUR_MODULE_URL = `./modules/runtime_tour_guide.js?v=20260519-tour-fix3`;
const UI_STATE_STORAGE_KEY = "teach_front_ui_state_v1";
const GATEWAY_URL_KEY = "teach_front_gateway_url";
const ENTRY_MODE_KEY = "teach_front_entry_mode";
const ENTRY_TS_KEY = "teach_front_entry_ts";

function verifyGatewayEntry() {
  const params = new URLSearchParams(window.location.search || "");
  const entry = params.get("entry");
  const isAllowedEntry = entry === "connected" || entry === "skip";

  let mode = "";
  let ts = Number.NaN;
  try {
    mode = String(sessionStorage.getItem(ENTRY_MODE_KEY) || "");
    ts = Number(sessionStorage.getItem(ENTRY_TS_KEY));
  } catch (_err) {
    mode = "";
    ts = Number.NaN;
  }

  const ttlMs = 10 * 60 * 1000;
  const age = Date.now() - ts;
  const fresh = Number.isFinite(ts) && age >= 0 && age <= ttlMs;
  const ok = isAllowedEntry && mode === entry && fresh;

  if (!ok) {
    window.location.replace("./index.html");
  }
  return ok;
}

const ALLOW_TEACHING_BOOT = verifyGatewayEntry();

class TeachingDemoApp {
  constructor() {
    this.config = null;
    this.demoFeaModel = normalizePseudoFeaModel(DEFAULT_PSEUDO_FEA_MODEL);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.gridHelper = null;
    this.loader = new STLLoader();

    this.robotFrame = null;
    this.rigRoot = null;
    this.jointDefs = new Map();
    this.jointNodes = new Map();
    this.jointContents = new Map();
    this.axisHelpers = new Map();
    this.jointAngles = {};
    this.jointUi = new Map();

    this.partRecords = [];
    this.feaRecords = [];

    this.lessonItems = [];
    this.currentLessonIndex = 0;
    this.autoLessonTimer = null;
    this.motion = null;
    this.kinDemoTimerIds = [];

    this.kinMode = "ik";
    this.kinLastSolve = { reachable: null, clipped: null, errorMm: null };
    this.kinTeachingState = {
      step: "input",
      selectedCandidate: -1,
      advancedExpanded: false,
      reachabilityLevel: "unknown",
      marginMm: null,
      candidates: [],
      lastDiagnostics: null,
      reverseCheck: null
    };

    this.fea = {
      enabled: false,
      running: true,
      load: 50,
      exaggeration: 120,
      poseSource: "lesson:0",
      loadScenario: "rated",
      loadDirection: "gravity",
      materialPreset: "al6061",
      payloadMassKg: 0.5,
      loadPoint: "tip",
      loadType: "steady",
      sectionPreset: "standard",
      constraintMode: "fixed",
      dynamicMode: "static",
      temperaturePreset: "ambient",
      maxStress: 0,
      maxDisp: 0,
      safetyFactor: 0,
      risk: "LOW"
    };
    this.feaTeachingState = {
      step: "setup",
      advancedExpanded: false,
      focusSection: "j2",
      showHotspot: true,
      deformStyle: "exaggerated",
      selectedHistoryIndex: -1,
      historyMarks: [],
      lastDiagnostics: null,
      pulseEnabled: true
    };
    this.feaHistory = [];
    this.lastHistoryPush = 0;
    this.lastFeaUpdate = 0;

    this.currentStage = "control";
    this.activeControlJointNames = ["J1", "J2", "J3", "J5"];
    this.uiStateSaveTimer = null;
    this.initialUiState = null;
    this.hasRestoredCameraState = false;
    this.gatewayCheckWs = null;
    this.gatewayCheckToken = 0;
    this.tour = null;
    this.tourSuppressUiSave = false;
    this.isDemoPlaying = false;
    this.labDemoAbort = { stopped: false };
    this.hardwareJoints = {};

    this.dom = {};
  }

  async init() {
    document.body.classList.remove("is-demo-playing");
    this.isDemoPlaying = false;
    this.cacheDom();
    this.initialUiState = this.loadUiState();
    this.bindStaticUi();
    await this.initTourGuide();
    try {
      await this.loadConfig();
    } catch (err) {
      this.log(`配置加载失败（部分功能受限）: ${err?.message || err}`);
      // eslint-disable-next-line no-console
      console.error(err);
    }
    this.initScene();
    this.bindViewportStateHooks();
    await this.buildRobot();
    this.buildJointUi();
    this.buildControlDemoUi();
    this.populateCalibrationUi();
    this.applyJointAngles();
    this.updateOriginText();
    this.updateEefReadout();
    this.refreshFeaTexts();
    this.refreshKinematicsTeachingUi();
    this.refreshFeaTeachingUi();
    initHardwareBridgeRuntime(this);
    this.checkGatewayStatus(false);
    drawFeaChartCore(this.dom.chart, this.feaHistory, this.feaTeachingState.selectedHistoryIndex);
    const restored = this.restoreUiState();
    if (!restored) {
      this.setKinematicsMode("ik");
      this.setTeachingStage("control");
    }
    this.updateKinematicsReadout({ step: "input" });
    this.animate(0);
    this.log("Teaching demo initialized");
  }

  async initTourGuide() {
    try {
      const mod = await import(TOUR_MODULE_URL);
      this.tour = mod.initTourGuideRuntime(this);
      await this.tour.loadScript();
      try {
        const bundleKey = "teach_front_tour_bundle_v";
        const bundleVer = "20260519-tour-fix3";
        if (localStorage.getItem(bundleKey) !== bundleVer) {
          localStorage.removeItem(mod.TOUR_COMPLETED_KEY);
          try {
            sessionStorage.removeItem(mod.TOUR_WELCOME_SKIP_SESSION_KEY);
          } catch (_err2) {
            // ignore
          }
          localStorage.setItem(bundleKey, bundleVer);
        }
      } catch (_err) {
        // ignore
      }
      this.tour.showWelcomeIfNeeded();
      requestAnimationFrame(() => {
        this.tour?.showWelcomeIfNeeded?.();
      });
    } catch (err) {
      this.log(`教学引导模块加载失败: ${err?.message || err}`);
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  cacheDom() {
    const byId = (id) => document.getElementById(id);

    this.dom.viewport = byId("viewport");
    this.dom.logs = byId("logs");
    this.dom.eefPos = byId("eefPos");
    this.dom.originText = byId("originText");
    this.dom.modeText = byId("modeText");
    this.dom.gatewayStatusBadge = byId("gatewayStatusBadge");
    this.dom.gatewayStatusText = byId("gatewayStatusText");
    this.dom.gatewayStatusMeta = byId("gatewayStatusMeta");
    this.dom.btnGatewayRecheck = byId("btnGatewayRecheck");
    this.dom.btnGatewayBack = byId("btnGatewayBack");

    this.dom.btnTourGuide = byId("btnTourGuide");
    this.dom.btnDemo = byId("btnDemo");
    this.dom.btnReset = byId("btnReset");

    this.dom.btnStageControl = byId("btnStageControl");
    this.dom.btnStageKinematics = byId("btnStageKinematics");
    this.dom.btnStageFea = byId("btnStageFea");
    this.dom.btnStageSidebarToggle = byId("btnStageSidebarToggle");
    this.dom.stagePanels = Array.from(document.querySelectorAll("[data-stage-panel]"));

    this.dom.jointControls = byId("jointControls");
    this.dom.controlDemoPanel = byId("controlDemoPanel");
    this.dom.controlDemoTitle = byId("controlDemoTitle");
    this.dom.controlDemoStepText = byId("controlDemoStepText");
    this.dom.controlDemoProgress = byId("controlDemoProgress");
    this.dom.controlDemoNarration = byId("controlDemoNarration");

    this.dom.toggleAxes = byId("toggleAxes");
    this.dom.toggleGrid = byId("toggleGrid");

    this.dom.calibJoint = byId("calibJoint");
    this.dom.pivotX = byId("pivotX");
    this.dom.pivotY = byId("pivotY");
    this.dom.pivotZ = byId("pivotZ");
    this.dom.axisX = byId("axisX");
    this.dom.axisY = byId("axisY");
    this.dom.axisZ = byId("axisZ");
    this.dom.btnApplyFrame = byId("btnApplyFrame");
    this.dom.btnWriteSelectedJ = byId("btnWriteSelectedJ");

    this.dom.ikX = byId("ikX");
    this.dom.ikY = byId("ikY");
    this.dom.ikZ = byId("ikZ");
    this.dom.ikStatus = byId("ikStatus");
    this.dom.kinInputHint = byId("kinInputHint");
    this.dom.kinSteps = byId("kinSteps");
    this.dom.kinReachable = byId("kinReachable");
    this.dom.kinError = byId("kinError");
    this.dom.kinClip = byId("kinClip");
    this.dom.kinModeIK = byId("kinModeIK");
    this.dom.kinModeFK = byId("kinModeFK");
    this.dom.kinModeCompare = byId("kinModeCompare");
    this.dom.btnSolveIK = byId("btnSolveIK");
    this.dom.btnSolveFK = byId("btnSolveFK");
    this.dom.btnReverseCheck = byId("btnReverseCheck");
    this.dom.btnKineDemo = byId("btnKineDemo");
    this.dom.btnStepPrev = byId("btnStepPrev");
    this.dom.btnStepRun = byId("btnStepRun");
    this.dom.btnProjectReachable = byId("btnProjectReachable");
    this.dom.btnToggleKinAdvanced = byId("btnToggleKinAdvanced");
    this.dom.kinExplainText = byId("kinExplainText");
    this.dom.kinCandidateList = byId("kinCandidateList");
    this.dom.kinBasisLimitMargin = byId("kinBasisLimitMargin");
    this.dom.kinBasisError = byId("kinBasisError");
    this.dom.kinBasisSmoothness = byId("kinBasisSmoothness");
    this.dom.kinReverseStatus = byId("kinReverseStatus");
    this.dom.kinAdvancedPanel = byId("kinAdvancedPanel");
    this.dom.kinDiagReachability = byId("kinDiagReachability");
    this.dom.kinDiagMargin = byId("kinDiagMargin");
    this.dom.kinDiagPlanarR = byId("kinDiagPlanarR");
    this.dom.kinDiagZOffset = byId("kinDiagZOffset");
    this.dom.kinDiagSingularity = byId("kinDiagSingularity");
    this.dom.kinDiagErrVec = byId("kinDiagErrVec");
    this.dom.kinReasonText = byId("kinReasonText");
    this.dom.btnSyncHw = byId("btnSyncHw");
    this.dom.btnReadHw = byId("btnReadHw");
    this.dom.kinHwStatus = byId("kinHwStatus");

    this.dom.feaPoseSource = byId("feaPoseSource");
    this.dom.feaPoseSummary = byId("feaPoseSummary");
    this.dom.feaLoadScenarioRow = byId("feaLoadScenarioRow");
    this.dom.feaLoadDirectionRow = byId("feaLoadDirectionRow");
    this.dom.feaMaterialPreset = byId("feaMaterialPreset");
    this.dom.feaPayloadMass = byId("feaPayloadMass");
    this.dom.feaPayloadMassText = byId("feaPayloadMassText");
    this.dom.feaLoadPointRow = byId("feaLoadPointRow");
    this.dom.feaLoadTypeRow = byId("feaLoadTypeRow");
    this.dom.feaSectionPresetRow = byId("feaSectionPresetRow");
    this.dom.feaConstraintModeRow = byId("feaConstraintModeRow");
    this.dom.feaDynamicModeRow = byId("feaDynamicModeRow");
    this.dom.feaTemperatureRow = byId("feaTemperatureRow");
    this.dom.feaInputSummary = byId("feaInputSummary");
    this.dom.feaLoad = byId("feaLoad");
    this.dom.feaLoadText = byId("feaLoadText");
    this.dom.feaExaggeration = byId("feaExaggeration");
    this.dom.feaExaggerationText = byId("feaExaggerationText");
    this.dom.btnRunFea = byId("btnRunFea");
    this.dom.btnPauseFea = byId("btnPauseFea");
    this.dom.btnFeaStepPrev = byId("btnFeaStepPrev");
    this.dom.btnFeaStepNext = byId("btnFeaStepNext");
    this.dom.btnToggleFeaAdvanced = byId("btnToggleFeaAdvanced");
    this.dom.btnFeaHotspot = byId("btnFeaHotspot");
    this.dom.btnFeaDeformStyle = byId("btnFeaDeformStyle");
    this.dom.btnFeaDeformExaggerated = byId("btnFeaDeformExaggerated");
    this.dom.btnFeaDeformReal = byId("btnFeaDeformReal");
    this.dom.btnFeaFocusRisk = byId("btnFeaFocusRisk");
    this.dom.metricStress = byId("metricStress");
    this.dom.metricDisp = byId("metricDisp");
    this.dom.metricSf = byId("metricSf");
    this.dom.metricRisk = byId("metricRisk");
    this.dom.feaStatusText = byId("feaStatusText");
    this.dom.feaExplainText = byId("feaExplainText");
    this.dom.feaStepText = byId("feaStepText");
    this.dom.feaLegendState = byId("feaLegendState");
    this.dom.feaAdvancedPanel = byId("feaAdvancedPanel");
    this.dom.feaSectionRows = byId("feaSectionRows");
    this.dom.feaRiskReason = byId("feaRiskReason");
    this.dom.feaHistoryList = byId("feaHistoryList");
    this.dom.chart = byId("feaChart");

    const collapsed = document.body.classList.contains("is-sidebar-collapsed");
    if (this.dom.btnStageSidebarToggle) {
      this.dom.btnStageSidebarToggle.textContent = collapsed ? "»" : "«";
    }
  }

  bindStaticUi() {
    this.dom.btnStageControl?.addEventListener("click", () => this.setTeachingStage("control"));
    this.dom.btnStageKinematics?.addEventListener("click", () => this.setTeachingStage("kinematics"));
    this.dom.btnStageFea?.addEventListener("click", () => this.setTeachingStage("fea"));
    this.dom.btnStageSidebarToggle?.addEventListener("click", () => {
      const body = document.body;
      const collapsed = body.classList.toggle("is-sidebar-collapsed");
      this.dom.btnStageSidebarToggle.textContent = collapsed ? "»" : "«";
      this.scheduleUiStateSave();
      this.onResize();
    });

    this.dom.btnReset?.addEventListener("click", () => this.resetPose());
    this.dom.btnTourGuide?.addEventListener("click", () => {
      this.startTourGuide({ fromWelcome: false }).catch((err) => {
        this.log(`教学引导启动失败: ${err?.message || err}`);
      });
    });
    this.dom.btnDemo?.addEventListener("click", () => this.runOneClickDemo());
    this.dom.btnSyncHw?.addEventListener("click", () => {
      this.syncTwinToHardware().catch((err) => this.log(err?.message || err));
    });
    this.dom.btnReadHw?.addEventListener("click", () => {
      this.readHardwareJoints().catch((err) => this.log(err?.message || err));
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape" || !this.isDemoPlaying) {
        return;
      }
      if (this.tour?.active) {
        return;
      }
      this.stopCaseDemo();
    });
    this.dom.btnGatewayRecheck?.addEventListener("click", () => this.checkGatewayStatus(true));
    this.dom.btnGatewayBack?.addEventListener("click", () => this.goBackToGateway());

    this.dom.toggleAxes?.addEventListener("change", () => {
      const visible = this.dom.toggleAxes.checked;
      for (const helper of this.axisHelpers.values()) {
        helper.visible = visible;
      }
      this.scheduleUiStateSave();
    });

    this.dom.toggleGrid?.addEventListener("change", () => {
      if (this.gridHelper) {
        this.gridHelper.visible = this.dom.toggleGrid.checked;
      }
      this.scheduleUiStateSave();
    });

    this.dom.kinModeIK?.addEventListener("click", () => this.setKinematicsMode("ik"));
    this.dom.kinModeFK?.addEventListener("click", () => this.setKinematicsMode("fk"));
    this.dom.kinModeCompare?.addEventListener("click", () => this.setKinematicsMode("compare"));
    this.dom.btnSolveIK?.addEventListener("click", () => this.solveIkFromUi());
    this.dom.btnSolveFK?.addEventListener("click", () => this.solveFkToUi());
    this.dom.btnReverseCheck?.addEventListener("click", () => this.reverseCheck());
    this.dom.btnKineDemo?.addEventListener("click", () => this.runKinematicsPathDemo());
    this.dom.btnStepPrev?.addEventListener("click", () => this.runKinematicsStep(-1));
    this.dom.btnStepRun?.addEventListener("click", () => this.runKinematicsStep(1));
    this.dom.btnProjectReachable?.addEventListener("click", () => this.projectTargetToReachable());
    this.dom.btnToggleKinAdvanced?.addEventListener("click", () => this.toggleKinematicsAdvanced());

    this.dom.btnRunFea?.addEventListener("click", () => this.runFea());
    this.dom.btnPauseFea?.addEventListener("click", () => this.toggleFeaAnimation());
    this.dom.btnFeaStepPrev?.addEventListener("click", () => this.runFeaStep(-1));
    this.dom.btnFeaStepNext?.addEventListener("click", () => this.runFeaStep(1));
    this.dom.btnToggleFeaAdvanced?.addEventListener("click", () => this.toggleFeaAdvanced());
    this.dom.btnFeaHotspot?.addEventListener("click", () => this.toggleFeaHotspot());
    this.dom.btnFeaDeformStyle?.addEventListener("click", () => this.toggleFeaDeformStyle());
    this.dom.btnFeaDeformExaggerated?.addEventListener("click", () => this.toggleFeaDeformStyle("exaggerated"));
    this.dom.btnFeaDeformReal?.addEventListener("click", () => this.toggleFeaDeformStyle("real"));
    this.dom.btnFeaFocusRisk?.addEventListener("click", () => this.focusFeaRiskSection());

    this.dom.feaPoseSource?.addEventListener("change", () => {
      applyFeaPoseSourceRuntime(this, this.dom.feaPoseSource.value);
    });
    this.dom.feaMaterialPreset?.addEventListener("change", () => {
      setFeaMaterialPresetRuntime(this, this.dom.feaMaterialPreset.value);
    });
    this.dom.feaPayloadMass?.addEventListener("input", () => {
      setFeaPayloadMassRuntime(this, Number(this.dom.feaPayloadMass.value));
    });
    this.dom.feaPayloadMass?.addEventListener("change", () => {
      setFeaPayloadMassRuntime(this, Number(this.dom.feaPayloadMass.value));
    });

    this.dom.feaLoad?.addEventListener("input", () => {
      this.fea.load = Number(this.dom.feaLoad.value);
      const presets = this.config?.feaInputPresets?.loadScenarios || [];
      const match = presets.find((s) => Number(s.loadPercent) === this.fea.load);
      if (match) {
        this.fea.loadScenario = match.id;
      }
      refreshFeaInputUiRuntime(this);
      this.fea.enabled = true;
      this.updateFeaVisual(performance.now());
      this.scheduleUiStateSave();
    });

    this.dom.feaExaggeration?.addEventListener("input", () => {
      this.fea.exaggeration = Number(this.dom.feaExaggeration.value);
      this.refreshFeaTexts();
      this.fea.enabled = true;
      this.updateFeaVisual(performance.now());
      this.scheduleUiStateSave();
    });

    this.dom.calibJoint?.addEventListener("change", () => this.syncCalibrationInputs());
    this.dom.btnApplyFrame?.addEventListener("click", () => this.applyCalibration());
    this.dom.btnWriteSelectedJ?.addEventListener("click", () => this.writeSelectedJoint());

    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("pagehide", () => {
      this.saveUiState();
      this.closeGatewayProbe();
    });
    window.addEventListener("beforeunload", () => this.saveUiState());
  }

  bindViewportStateHooks() {
    if (!this.controls) {
      return;
    }
    this.controls.addEventListener("change", () => {
      this.scheduleUiStateSave(180);
    });
  }

  getGatewayUrl() {
    try {
      const saved = String(sessionStorage.getItem(GATEWAY_URL_KEY) || "").trim();
      if (saved) {
        return saved;
      }
    } catch (_err) {
      // ignore storage errors
    }
    return "ws://127.0.0.1:8787";
  }

  setGatewayStatus(text, tone = "warn", meta = "") {
    if (this.dom.gatewayStatusText) {
      this.dom.gatewayStatusText.textContent = text;
    }
    if (this.dom.gatewayStatusMeta) {
      this.dom.gatewayStatusMeta.textContent = meta;
    }
    if (this.dom.gatewayStatusBadge) {
      this.dom.gatewayStatusBadge.textContent = tone === "ok" ? "已连接" : tone === "bad" ? "未连接" : "检测中";
      this.dom.gatewayStatusBadge.classList.remove("tone-ok", "tone-warn", "tone-bad");
      if (tone === "ok") this.dom.gatewayStatusBadge.classList.add("tone-ok");
      if (tone === "warn") this.dom.gatewayStatusBadge.classList.add("tone-warn");
      if (tone === "bad") this.dom.gatewayStatusBadge.classList.add("tone-bad");
    }
  }

  closeGatewayProbe() {
    if (this.gatewayCheckWs) {
      try {
        this.gatewayCheckWs.close();
      } catch (_err) {
        // ignore
      }
      this.gatewayCheckWs = null;
    }
  }

  goBackToGateway() {
    this.closeGatewayProbe();
    window.location.href = "./index.html";
  }

  checkGatewayStatus(triggeredByUser = false) {
    const url = this.getGatewayUrl();
    this.gatewayCheckToken += 1;
    const token = this.gatewayCheckToken;
    this.closeGatewayProbe();
    this.setGatewayStatus("正在检测网关连接状态...", "warn", `网关地址: ${url}`);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (_err) {
      this.setGatewayStatus("无法创建网关连接，请检查地址或网关进程。", "bad", `网关地址: ${url}`);
      return;
    }
    this.gatewayCheckWs = ws;
    let opened = false;

    const clearProbe = () => {
      if (token !== this.gatewayCheckToken) {
        return;
      }
      this.gatewayCheckWs = null;
    };

    const timeoutId = setTimeout(() => {
      if (token !== this.gatewayCheckToken) {
        return;
      }
      this.setGatewayStatus("检测超时：未连接到网关。", "bad", `网关地址: ${url}`);
      this.closeGatewayProbe();
    }, 2200);

    ws.addEventListener("open", () => {
      if (token !== this.gatewayCheckToken) {
        return;
      }
      opened = true;
      clearTimeout(timeoutId);
      this.setGatewayStatus("网关在线，可继续教学。", "ok", `网关地址: ${url}`);
      if (triggeredByUser) {
        this.log("Gateway reachable", { url });
      }
      try {
        ws.close();
      } catch (_err) {
        // ignore
      }
      clearProbe();
    });

    ws.addEventListener("error", () => {
      if (token !== this.gatewayCheckToken) {
        return;
      }
      clearTimeout(timeoutId);
      this.setGatewayStatus("网关不可达，请返回连接页重新连接。", "bad", `网关地址: ${url}`);
      clearProbe();
    });

    ws.addEventListener("close", () => {
      if (token !== this.gatewayCheckToken) {
        return;
      }
      clearTimeout(timeoutId);
      if (!opened) {
        this.setGatewayStatus("网关不可达，请返回连接页重新连接。", "bad", `网关地址: ${url}`);
      }
      clearProbe();
    });
  }

  async loadConfig() {
    const url = `./joints.json?v=${TEACH_WEB_VERSION}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load joints.json (${res.status})`);
    }
    this.config = await res.json();
    this.demoFeaModel = this.resolveDemoFeaModel();
    buildFeaInputControlsRuntime(this);
    refreshFeaInputUiRuntime(this);
    this.log("Config loaded", {
      joints: Array.isArray(this.config?.joints) ? this.config.joints.length : 0,
      parts: Array.isArray(this.config?.parts) ? this.config.parts.length : 0
    });
  }

  resolveDemoFeaModel() {
    const linkage = this.config?.linkage || {};
    const link2 = toFiniteNumber(linkage?.activeLinkLengthMm?.J2, 135.045);
    const link3 = toFiniteNumber(linkage?.activeLinkLengthMm?.J3, 145.031);
    const tool = toFiniteNumber(linkage?.toolMm, 70);
    const demoFeaRaw = this.config?.demoFea || {};

    const base = normalizePseudoFeaModel({
      ...DEFAULT_PSEUDO_FEA_MODEL,
      ...demoFeaRaw,
      sections: {
        ...DEFAULT_PSEUDO_FEA_MODEL.sections,
        ...(demoFeaRaw.sections || {}),
        j2: {
          ...DEFAULT_PSEUDO_FEA_MODEL.sections.j2,
          ...(demoFeaRaw.sections?.j2 || {}),
          leverMm: toFiniteNumber(demoFeaRaw.sections?.j2?.leverMm, link2)
        },
        j3: {
          ...DEFAULT_PSEUDO_FEA_MODEL.sections.j3,
          ...(demoFeaRaw.sections?.j3 || {}),
          leverMm: toFiniteNumber(demoFeaRaw.sections?.j3?.leverMm, link3)
        },
        j4: {
          ...DEFAULT_PSEUDO_FEA_MODEL.sections.j4,
          ...(demoFeaRaw.sections?.j4 || {}),
          leverMm: toFiniteNumber(demoFeaRaw.sections?.j4?.leverMm, tool)
        }
      }
    });
    const presets = this.config?.feaInputPresets || {};
    const matId = this.fea?.materialPreset || "al6061";
    const matList = Array.isArray(presets.materialPresets) ? presets.materialPresets : [];
    const matPreset = matList.find((m) => m.id === matId) || matList[0] || {};
    const dirId = this.fea?.loadDirection || "gravity";
    const dirList = Array.isArray(presets.loadDirections) ? presets.loadDirections : [];
    const dirPreset = dirList.find((d) => d.id === dirId) || dirList[0] || {};
    base._feaMaterial = {
      ...(this.config?.feaMaterial || {}),
      yieldStressMpa: matPreset.yieldStressMpa ?? this.config?.feaMaterial?.yieldStressMpa,
      sectionModulusScale: matPreset.sectionModulusScale ?? this.config?.feaMaterial?.sectionModulusScale
    };
    base._energyWeights = this.config?.energyCalibration?.sectionLoadWeights || {};
    base._loadDirectionFactor = Number(dirPreset.momentFactor) || 1;
    const feaCtx = buildFeaAnalysisContextRuntime(this);
    if (Number.isFinite(feaCtx.dynamicGain)) {
      base.dynamicGain = feaCtx.dynamicGain;
    }
    return base;
  }

  updateOriginText() {
    if (!this.dom.originText) {
      return;
    }
    const mode = String(this.config?.originMode || "j1_ground");
    if (mode === "j1_ground") {
      this.dom.originText.textContent = "原点 = 底座底平面中心";
    } else {
      this.dom.originText.textContent = `原点模式: ${mode}`;
    }
  }

  initScene() {
    return initSceneRuntime(this, { THREE, OrbitControls });
  }

  disposeRobot() {
    return disposeRobotRuntime(this);
  }

  normalizeJoint(raw) {
    return normalizeJointRuntime(raw, { THREE, toFiniteNumber });
  }

  createAxisHelper(axisVec) {
    return createAxisHelperRuntime(axisVec, { THREE });
  }

  async buildRobot() {
    return buildRobotRuntime(this, { THREE });
  }

  normalizeMeshName(name) {
    return normalizeMeshNameRuntime(name);
  }

  isFeaTarget(target) {
    return isFeaTargetRuntime(target);
  }

  parseFrontAxisVector(axisName) {
    return parseFrontAxisVectorRuntime(axisName, { THREE });
  }

  resolveFrameCalibrationConfig() {
    return resolveFrameCalibrationConfigRuntime(this);
  }

  jointNameFromTarget(target) {
    return jointNameFromTargetRuntime(target);
  }

  getJointAxisWorldByName(name) {
    return getJointAxisWorldByNameRuntime(this, name, { THREE });
  }

  alignRobotFrameByJ1AndFront() {
    return alignRobotFrameByJ1AndFrontRuntime(this, { THREE, DEG2RAD });
  }

  createPartRecord(mesh, part) {
    return createPartRecordRuntime(this, mesh, part, { THREE, clamp, toFiniteNumber });
  }

  async loadPartMesh(part, file, targetGroups) {
    return loadPartMeshRuntime(this, part, file, targetGroups, { THREE });
  }

  buildJointUi() {
    return buildJointUiRuntime(this, { toFixed3 });
  }

  buildLessonsUi() {
    return buildLessonsUiRuntime(this);
  }

  buildControlDemoUi() {
    return buildControlDemoUiRuntime(this);
  }

  applyLesson(index, animate = true) {
    return applyLessonRuntime(this, index, animate, { toFiniteNumber });
  }

  stepLesson(direction) {
    return stepLessonRuntime(this, direction);
  }

  toggleAutoLesson() {
    return toggleAutoLessonRuntime(this);
  }

  clearKinematicsDemoTimers() {
    return clearKinematicsDemoTimersRuntime(this);
  }

  runOneClickDemo() {
    return runOneClickDemoRuntime(this);
  }

  runCaseDemo(caseId, kind = "auto") {
    return runCaseDemoRuntime(this, caseId, kind);
  }

  stopCaseDemo() {
    return stopCaseDemoRuntime(this);
  }

  syncTwinToHardware() {
    return syncTwinToHardwareRuntime(this);
  }

  readHardwareJoints() {
    return readHardwareJointsRuntime(this);
  }

  setJointAngle(name, value, options = {}) {
    const def = this.jointDefs.get(name);
    if (!def) {
      return;
    }

    if (def.derivedType === "offset_minus_sum") {
      const j2Deg = Number(this.jointAngles.J2 || 0);
      const j3Deg = Number(this.jointAngles.J3 || 0);
      const desiredQ4 = Number(value);
      if (Number.isFinite(desiredQ4)) {
        def.derivedOffsetDeg = desiredQ4 + j2Deg + j3Deg;
      }
    }

    const v = clamp(Number(value), def.minDeg, def.maxDeg);
    this.jointAngles[name] = v;

    const ui = this.jointUi.get(name);
    if (ui && options.syncUi !== false) {
      ui.input.value = String(v);
      ui.valueEl.textContent = `${toFixed3(v)} deg`;
    }

    if (options.applyNow !== false) {
      this.applyJointAngles();
      this.updateEefReadout();
    }

    if (options.mode && this.dom.modeText) {
      this.dom.modeText.textContent = options.mode;
    }

    if (options.updateKinematics !== false) {
      this.updateKinematicsReadout({ step: "input" });
    }

    if (this.currentStage === "fea" && this.fea?.poseSource === "twin") {
      this.refreshFeaInputUi();
      if (options.applyNow !== false) {
        this.fea.enabled = true;
        this.updateFeaVisual(performance.now());
      }
    }

    if (options.persist !== false) {
      this.scheduleUiStateSave();
    }
  }

  resetPose() {
    this.clearKinematicsDemoTimers();
    for (const def of this.jointDefs.values()) {
      this.setJointAngle(def.name, def.defaultDeg, { syncUi: true, applyNow: false, updateKinematics: false });
    }
    this.applyJointAngles();
    this.kinLastSolve = { reachable: null, clipped: null, errorMm: null };
    this.updateEefReadout();
    if (this.dom.modeText) {
      this.dom.modeText.textContent = "手动控制";
    }
    this.scheduleUiStateSave();
    this.log("Robot reset to default pose");
  }

  applyJointAngles() {
    for (const def of this.jointDefs.values()) {
      const node = this.jointNodes.get(def.name);
      if (!node) {
        continue;
      }

      let angle = this.jointAngles[def.name] || 0;

      if (def.derivedType === "follow") {
        const srcName = String(def.derivedSourceName || "").trim();
        if (srcName && this.jointDefs.has(srcName)) {
          const srcDeg = Number(this.jointAngles[srcName] || 0);
          angle = clamp(srcDeg * def.derivedGain + def.derivedOffsetDeg, def.minDeg, def.maxDeg);
          this.jointAngles[def.name] = angle;
        }
      } else if (def.derivedType === "offset_minus_sum") {
        const srcNames = Array.isArray(def.derivedSourceNames) && def.derivedSourceNames.length > 0
          ? def.derivedSourceNames
          : ["J2", "J3"];
        let next = def.derivedOffsetDeg;
        let valid = true;
        for (const srcName of srcNames) {
          if (!this.jointDefs.has(srcName)) {
            valid = false;
            break;
          }
          next -= Number(this.jointAngles[srcName] || 0);
        }
        if (valid) {
          angle = clamp(next, def.minDeg, def.maxDeg);
          this.jointAngles[def.name] = angle;
        }
      }

      node.quaternion.setFromAxisAngle(def.axis, angle * DEG2RAD);
      const ui = this.jointUi.get(def.name);
      if (ui) {
        ui.valueEl.textContent = `${toFixed3(angle)} deg`;
      }
    }
  }

  animateToAngles(targetAngles, durationMs) {
    const from = {};
    const to = {};

    for (const def of this.jointDefs.values()) {
      from[def.name] = this.jointAngles[def.name] || 0;
      const target = Object.prototype.hasOwnProperty.call(targetAngles || {}, def.name)
        ? Number(targetAngles[def.name])
        : from[def.name];
      to[def.name] = clamp(target, def.minDeg, def.maxDeg);
    }

    this.motion = {
      start: performance.now(),
      duration: Math.max(120, Number(durationMs) || 800),
      from,
      to
    };
  }

  stepMotion(now) {
    if (!this.motion) {
      return;
    }

    const t = clamp((now - this.motion.start) / this.motion.duration, 0, 1);
    const s = t * t * (3 - 2 * t);

    for (const def of this.jointDefs.values()) {
      const from = this.motion.from[def.name];
      const to = this.motion.to[def.name];
      this.jointAngles[def.name] = from + (to - from) * s;
      const ui = this.jointUi.get(def.name);
      if (ui) {
        ui.input.value = String(this.jointAngles[def.name]);
      }
    }

    this.applyJointAngles();
    this.updateEefReadout();
    this.updateKinematicsReadout({ step: "validate" });

    if (t >= 1) {
      this.motion = null;
      this.scheduleUiStateSave(0);
    }
  }

  setTeachingStage(stage) {
    const result = setTeachingStageRuntime(this, stage);
    this.scheduleUiStateSave();
    return result;
  }

  setKinematicsMode(mode) {
    const result = setKinematicsModeRuntime(this, mode);
    this.scheduleUiStateSave();
    return result;
  }

  setKinematicsStep(step) {
    return setKinematicsStepRuntime(this, step);
  }

  setKinematicsChip(el, text, tone = "") {
    return setKinematicsChipRuntime(this, el, text, tone);
  }

  getKinematicsTargetFromUi() {
    return getKinematicsTargetFromUiRuntime(this, { toFiniteNumber });
  }

  updateKinematicsReadout(options = {}) {
    return updateKinematicsReadoutRuntime(this, options, { THREE, computeFkCore });
  }

  runKinematicsPathDemo() {
    return runKinematicsPathDemoRuntime(this);
  }

  runKinematicsStep(direction) {
    const result = runKinematicsStepRuntime(this, direction);
    this.scheduleUiStateSave();
    return result;
  }

  toggleKinematicsAdvanced() {
    const result = toggleKinematicsAdvancedRuntime(this);
    this.scheduleUiStateSave();
    return result;
  }

  projectTargetToReachable() {
    const result = projectTargetToReachableRuntime(this);
    this.scheduleUiStateSave();
    return result;
  }

  reverseCheck() {
    const result = reverseCheckRuntime(this, { computeFkCore });
    this.scheduleUiStateSave();
    return result;
  }

  refreshKinematicsTeachingUi() {
    return refreshKinematicsTeachingUiRuntime(this);
  }

  solveIkFromUi() {
    return solveIkFromUiRuntime(this, { toFiniteNumber, solveIkCore });
  }

  solveFkToUi() {
    return solveFkToUiRuntime(this, { computeFkCore });
  }

  updateEefReadout() {
    return updateEefReadoutRuntime(this, { computeFkCore });
  }

  refreshFeaTexts() {
    return refreshFeaTextsRuntime(this);
  }

  refreshFeaInputUi() {
    return refreshFeaInputUiRuntime(this);
  }

  runFea() {
    const result = runFeaRuntime(this);
    this.scheduleUiStateSave();
    return result;
  }

  runFeaStep(direction) {
    const result = runFeaStepRuntime(this, direction);
    this.scheduleUiStateSave();
    return result;
  }

  toggleFeaAdvanced() {
    const result = toggleFeaAdvancedRuntime(this);
    this.scheduleUiStateSave();
    return result;
  }

  toggleFeaHotspot() {
    const result = toggleFeaHotspotRuntime(this);
    this.scheduleUiStateSave();
    return result;
  }

  toggleFeaDeformStyle(mode) {
    const result = toggleFeaDeformStyleRuntime(this, mode);
    this.scheduleUiStateSave();
    return result;
  }

  focusFeaRiskSection() {
    const result = focusFeaRiskSectionRuntime(this);
    this.scheduleUiStateSave();
    return result;
  }

  replayFeaHistoryMark(index) {
    const result = replayFeaHistoryMarkRuntime(this, index);
    this.scheduleUiStateSave();
    return result;
  }

  refreshFeaTeachingUi() {
    return refreshFeaTeachingUiRuntime(this);
  }

  toggleFeaAnimation() {
    const result = toggleFeaAnimationRuntime(this);
    this.scheduleUiStateSave();
    return result;
  }

  updateFeaVisual(nowMs) {
    return updateFeaVisualRuntimeFacade(this, nowMs, {
      updateFeaVisualRuntimeCore: updateFeaVisualRuntime,
      drawFeaChartCore
    });
  }

  populateCalibrationUi() {
    return populateCalibrationUiRuntime(this);
  }

  syncCalibrationInputs() {
    return syncCalibrationInputsRuntime(this, { toFixed3 });
  }

  recomputeJointFrames() {
    return recomputeJointFramesRuntime(this, { THREE });
  }

  applyCalibration() {
    return applyCalibrationRuntime(this, { THREE, toFixed3, toFiniteNumber });
  }

  writeSelectedJoint() {
    return writeSelectedJointRuntime(this);
  }

  fitCameraToRobot() {
    return fitCameraToRobotRuntime(this, { THREE });
  }

  onResize() {
    return onResizeRuntime(this);
  }

  scheduleUiStateSave(delayMs = 120) {
    if (this.uiStateSaveTimer) {
      clearTimeout(this.uiStateSaveTimer);
    }
    this.uiStateSaveTimer = setTimeout(() => {
      this.uiStateSaveTimer = null;
      this.saveUiState();
    }, Math.max(0, Number(delayMs) || 0));
  }

  async startTourGuide(options) {
    if (!this.tour) {
      await this.initTourGuide();
    }
    if (!this.tour) {
      this.log("教学引导不可用，请刷新页面重试");
      return;
    }
    return this.tour.startTour(options || {});
  }

  stopTourGuide(options) {
    return this.tour?.stopTour(options || {});
  }

  saveUiState() {
    if (this.tourSuppressUiSave) {
      return;
    }
    try {
      const jointAngles = {};
      for (const def of this.jointDefs.values()) {
        const v = Number(this.jointAngles[def.name]);
        if (Number.isFinite(v)) {
          jointAngles[def.name] = v;
        }
      }

      const payload = {
        stage: this.currentStage,
        kinMode: this.kinMode,
        sidebarCollapsed: document.body.classList.contains("is-sidebar-collapsed"),
        toggleAxes: Boolean(this.dom.toggleAxes?.checked),
        toggleGrid: Boolean(this.dom.toggleGrid?.checked),
        ikTarget: {
          x: Number(this.dom.ikX?.value),
          y: Number(this.dom.ikY?.value),
          z: Number(this.dom.ikZ?.value)
        },
        kinTeaching: {
          step: String(this.kinTeachingState?.step || "input"),
          selectedCandidate: Number(this.kinTeachingState?.selectedCandidate ?? -1),
          advancedExpanded: Boolean(this.kinTeachingState?.advancedExpanded),
          reachabilityLevel: String(this.kinTeachingState?.reachabilityLevel || "unknown"),
          marginMm: Number(this.kinTeachingState?.marginMm),
          reverseCheck: this.kinTeachingState?.reverseCheck && typeof this.kinTeachingState.reverseCheck === "object"
            ? {
              dx: Number(this.kinTeachingState.reverseCheck.dx),
              dy: Number(this.kinTeachingState.reverseCheck.dy),
              dz: Number(this.kinTeachingState.reverseCheck.dz),
              errMm: Number(this.kinTeachingState.reverseCheck.errMm)
            }
            : null,
          candidates: Array.isArray(this.kinTeachingState?.candidates)
            ? this.kinTeachingState.candidates.map((c) => ({
              index: Number(c.index),
              label: String(c.label || ""),
              angles: c.angles && typeof c.angles === "object" ? c.angles : null,
              clipped: Boolean(c.clipped),
              errorMm: Number(c.errorMm),
              minLimitMarginDeg: Number(c.minLimitMarginDeg),
              smoothnessDeltaDeg: Number(c.smoothnessDeltaDeg)
            }))
            : []
        },
        fea: {
          enabled: Boolean(this.fea.enabled),
          running: Boolean(this.fea.running),
          load: Number(this.fea.load),
          exaggeration: Number(this.fea.exaggeration),
          poseSource: String(this.fea.poseSource || "lesson:0"),
          loadScenario: String(this.fea.loadScenario || "rated"),
          loadDirection: String(this.fea.loadDirection || "gravity"),
          materialPreset: String(this.fea.materialPreset || "al6061"),
          payloadMassKg: Number(this.fea.payloadMassKg),
          loadPoint: String(this.fea.loadPoint || "tip"),
          loadType: String(this.fea.loadType || "steady"),
          sectionPreset: String(this.fea.sectionPreset || "standard"),
          constraintMode: String(this.fea.constraintMode || "fixed"),
          dynamicMode: String(this.fea.dynamicMode || "static"),
          temperaturePreset: String(this.fea.temperaturePreset || "ambient"),
          teaching: {
            step: String(this.feaTeachingState?.step || "setup"),
            advancedExpanded: Boolean(this.feaTeachingState?.advancedExpanded),
            focusSection: String(this.feaTeachingState?.focusSection || "j2"),
            showHotspot: Boolean(this.feaTeachingState?.showHotspot),
            deformStyle: String(this.feaTeachingState?.deformStyle || "exaggerated"),
            selectedHistoryIndex: Number(this.feaTeachingState?.selectedHistoryIndex ?? -1)
          }
        },
        camera: this.camera && this.controls
          ? {
            position: {
              x: Number(this.camera.position.x),
              y: Number(this.camera.position.y),
              z: Number(this.camera.position.z)
            },
            target: {
              x: Number(this.controls.target.x),
              y: Number(this.controls.target.y),
              z: Number(this.controls.target.z)
            }
          }
          : null,
        jointAngles
      };

      localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(payload));
    } catch (_err) {
      // Ignore storage failures (private mode / quota / disabled storage).
    }
  }

  loadUiState() {
    try {
      const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_err) {
      return null;
    }
  }

  restoreUiState() {
    const state = this.initialUiState || this.loadUiState();
    if (!state) {
      return false;
    }

    if (typeof state.sidebarCollapsed === "boolean") {
      document.body.classList.toggle("is-sidebar-collapsed", state.sidebarCollapsed);
      if (this.dom.btnStageSidebarToggle) {
        this.dom.btnStageSidebarToggle.textContent = state.sidebarCollapsed ? "»" : "«";
      }
    }

    if (typeof state.toggleAxes === "boolean" && this.dom.toggleAxes) {
      this.dom.toggleAxes.checked = state.toggleAxes;
      for (const helper of this.axisHelpers.values()) {
        helper.visible = state.toggleAxes;
      }
    }

    if (typeof state.toggleGrid === "boolean" && this.dom.toggleGrid) {
      this.dom.toggleGrid.checked = state.toggleGrid;
      if (this.gridHelper) {
        this.gridHelper.visible = state.toggleGrid;
      }
    }

    if (state.ikTarget && typeof state.ikTarget === "object") {
      const x = Number(state.ikTarget.x);
      const y = Number(state.ikTarget.y);
      const z = Number(state.ikTarget.z);
      if (Number.isFinite(x) && this.dom.ikX) this.dom.ikX.value = String(x);
      if (Number.isFinite(y) && this.dom.ikY) this.dom.ikY.value = String(y);
      if (Number.isFinite(z) && this.dom.ikZ) this.dom.ikZ.value = String(z);
    }

    if (state.kinTeaching && typeof state.kinTeaching === "object") {
      const s = state.kinTeaching;
      if (typeof s.step === "string") {
        this.kinTeachingState.step = s.step;
      }
      if (typeof s.advancedExpanded === "boolean") {
        this.kinTeachingState.advancedExpanded = s.advancedExpanded;
      }
      if (typeof s.reachabilityLevel === "string") {
        this.kinTeachingState.reachabilityLevel = s.reachabilityLevel;
      }
      const marginMm = Number(s.marginMm);
      if (Number.isFinite(marginMm)) {
        this.kinTeachingState.marginMm = marginMm;
      }
      const selected = Number(s.selectedCandidate);
      if (Number.isFinite(selected)) {
        this.kinTeachingState.selectedCandidate = selected;
      }
      if (Array.isArray(s.candidates)) {
        this.kinTeachingState.candidates = s.candidates
          .filter((c) => c && typeof c === "object")
          .map((c) => ({
            index: Number(c.index),
            label: String(c.label || ""),
            angles: c.angles && typeof c.angles === "object" ? c.angles : {},
            clipped: Boolean(c.clipped),
            errorMm: Number(c.errorMm),
            minLimitMarginDeg: Number(c.minLimitMarginDeg),
            smoothnessDeltaDeg: Number(c.smoothnessDeltaDeg)
          }));
      }
      if (s.reverseCheck && typeof s.reverseCheck === "object") {
        const dx = Number(s.reverseCheck.dx);
        const dy = Number(s.reverseCheck.dy);
        const dz = Number(s.reverseCheck.dz);
        const errMm = Number(s.reverseCheck.errMm);
        if ([dx, dy, dz, errMm].every((n) => Number.isFinite(n))) {
          this.kinTeachingState.reverseCheck = { dx, dy, dz, errMm };
        }
      }
    }

    if (state.fea && typeof state.fea === "object") {
      const load = Number(state.fea.load);
      const exaggeration = Number(state.fea.exaggeration);
      if (Number.isFinite(load)) {
        this.fea.load = load;
        if (this.dom.feaLoad) {
          this.dom.feaLoad.value = String(load);
        }
      }
      if (Number.isFinite(exaggeration)) {
        this.fea.exaggeration = exaggeration;
        if (this.dom.feaExaggeration) {
          this.dom.feaExaggeration.value = String(exaggeration);
        }
      }
      if (typeof state.fea.poseSource === "string") {
        this.fea.poseSource = state.fea.poseSource;
        if (this.dom.feaPoseSource) {
          this.dom.feaPoseSource.value = state.fea.poseSource;
        }
      }
      if (typeof state.fea.loadScenario === "string") {
        this.fea.loadScenario = state.fea.loadScenario;
      }
      if (typeof state.fea.loadDirection === "string") {
        this.fea.loadDirection = state.fea.loadDirection;
      }
      if (typeof state.fea.materialPreset === "string") {
        this.fea.materialPreset = state.fea.materialPreset;
        if (this.dom.feaMaterialPreset) {
          this.dom.feaMaterialPreset.value = state.fea.materialPreset;
        }
      }
      const feaNum = (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      this.fea.payloadMassKg = feaNum(state.fea.payloadMassKg, this.fea.payloadMassKg);
      if (this.dom.feaPayloadMass) {
        this.dom.feaPayloadMass.value = String(this.fea.payloadMassKg);
      }
      if (typeof state.fea.loadPoint === "string") this.fea.loadPoint = state.fea.loadPoint;
      if (typeof state.fea.loadType === "string") this.fea.loadType = state.fea.loadType;
      if (typeof state.fea.sectionPreset === "string") this.fea.sectionPreset = state.fea.sectionPreset;
      if (typeof state.fea.constraintMode === "string") this.fea.constraintMode = state.fea.constraintMode;
      if (typeof state.fea.dynamicMode === "string") this.fea.dynamicMode = state.fea.dynamicMode;
      if (typeof state.fea.temperaturePreset === "string") {
        this.fea.temperaturePreset = state.fea.temperaturePreset;
      }
      if (typeof state.fea.enabled === "boolean") {
        this.fea.enabled = state.fea.enabled;
      }
      if (typeof state.fea.running === "boolean") {
        this.fea.running = state.fea.running;
      }
      if (state.fea.teaching && typeof state.fea.teaching === "object") {
        const t = state.fea.teaching;
        if (typeof t.step === "string") this.feaTeachingState.step = t.step;
        if (typeof t.advancedExpanded === "boolean") this.feaTeachingState.advancedExpanded = t.advancedExpanded;
        if (typeof t.focusSection === "string") this.feaTeachingState.focusSection = t.focusSection;
        if (typeof t.showHotspot === "boolean") this.feaTeachingState.showHotspot = t.showHotspot;
        if (typeof t.deformStyle === "string") this.feaTeachingState.deformStyle = t.deformStyle;
        const hIdx = Number(t.selectedHistoryIndex);
        if (Number.isFinite(hIdx)) this.feaTeachingState.selectedHistoryIndex = hIdx;
      }
      if (this.dom.btnPauseFea) {
        this.dom.btnPauseFea.textContent = this.fea.running ? "暂停形变动画" : "恢复形变动画";
      }
      this.refreshFeaInputUi();
      this.refreshFeaTeachingUi();
      if (this.fea.enabled) {
        this.updateFeaVisual(performance.now());
      }
      drawFeaChartCore(this.dom.chart, this.feaHistory, this.feaTeachingState.selectedHistoryIndex);
    }

    if (state.jointAngles && typeof state.jointAngles === "object") {
      for (const def of this.jointDefs.values()) {
        const raw = state.jointAngles[def.name];
        const v = Number(raw);
        if (Number.isFinite(v)) {
          this.setJointAngle(def.name, v, {
            syncUi: true,
            applyNow: false,
            updateKinematics: false,
            persist: false
          });
        }
      }
      this.applyJointAngles();
      this.updateEefReadout();
    }

    if (state.camera && typeof state.camera === "object" && this.camera && this.controls) {
      const px = Number(state.camera.position?.x);
      const py = Number(state.camera.position?.y);
      const pz = Number(state.camera.position?.z);
      const tx = Number(state.camera.target?.x);
      const ty = Number(state.camera.target?.y);
      const tz = Number(state.camera.target?.z);
      const valid = [px, py, pz, tx, ty, tz].every((n) => Number.isFinite(n));
      if (valid) {
        this.camera.position.set(px, py, pz);
        this.controls.target.set(tx, ty, tz);
        this.controls.update();
        this.hasRestoredCameraState = true;
      }
    }

    if (typeof state.kinMode === "string") {
      this.setKinematicsMode(state.kinMode);
    }

    if (typeof state.stage === "string") {
      this.setTeachingStage(state.stage);
    }

    this.updateKinematicsReadout({ step: "input" });
    this.refreshKinematicsTeachingUi();
    this.onResize();
    return true;
  }

  animate(now) {
    requestAnimationFrame((t) => this.animate(t));

    this.stepMotion(now);
    if (this.fea.enabled) {
      this.updateFeaVisual(now);
    }

    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
  }

  log(message, detail) {
    const time = new Date();
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    const ss = String(time.getSeconds()).padStart(2, "0");
    const prefix = `[${hh}:${mm}:${ss}]`;

    const line = detail !== undefined
      ? `${prefix} ${message} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
      : `${prefix} ${message}`;

    if (!this.dom.logs) {
      return;
    }

    this.dom.logs.textContent = `${line}\n${this.dom.logs.textContent}`.slice(0, 12000);
  }
}

if (ALLOW_TEACHING_BOOT) {
  const app = new TeachingDemoApp();
  app.init().catch((err) => {
    const logEl = document.getElementById("logs");
    if (logEl) {
      logEl.textContent = `[BOOT ERROR] ${String(err)}\n${logEl.textContent}`;
    }
    // eslint-disable-next-line no-console
    console.error(err);
  });
}

