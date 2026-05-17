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
  getKinematicsTargetFromUiRuntime,
  refreshFeaTextsRuntime,
  runFeaRuntime,
  runKinematicsPathDemoRuntime,
  setKinematicsChipRuntime,
  setKinematicsModeRuntime,
  setKinematicsStepRuntime,
  solveFkToUiRuntime,
  solveIkFromUiRuntime,
  toggleFeaAnimationRuntime,
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

const TEACH_WEB_VERSION = "20260518-hotfix-model-visible";

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

    this.fea = {
      enabled: false,
      running: true,
      load: 50,
      exaggeration: 120,
      maxStress: 0,
      maxDisp: 0,
      safetyFactor: 0,
      risk: "LOW"
    };
    this.feaHistory = [];
    this.lastHistoryPush = 0;
    this.lastFeaUpdate = 0;

    this.currentStage = "control";
    this.activeControlJointNames = ["J1", "J2", "J3", "J5"];

    this.dom = {};
  }

  async init() {
    this.cacheDom();
    this.bindStaticUi();
    await this.loadConfig();
    this.initScene();
    await this.buildRobot();
    this.buildJointUi();
    this.buildLessonsUi();
    this.populateCalibrationUi();
    this.applyJointAngles();
    this.updateOriginText();
    this.updateEefReadout();
    this.refreshFeaTexts();
    drawFeaChartCore(this.dom.chart, this.feaHistory);
    this.setKinematicsMode("ik");
    this.setTeachingStage("control");
    this.updateKinematicsReadout({ step: "input" });
    this.animate(0);
    this.log("Teaching demo initialized");
  }

  cacheDom() {
    const byId = (id) => document.getElementById(id);

    this.dom.viewport = byId("viewport");
    this.dom.logs = byId("logs");
    this.dom.eefPos = byId("eefPos");
    this.dom.originText = byId("originText");
    this.dom.modeText = byId("modeText");

    this.dom.btnDemo = byId("btnDemo");
    this.dom.btnReset = byId("btnReset");

    this.dom.btnStageControl = byId("btnStageControl");
    this.dom.btnStageKinematics = byId("btnStageKinematics");
    this.dom.btnStageFea = byId("btnStageFea");
    this.dom.stagePanels = Array.from(document.querySelectorAll("[data-stage-panel]"));

    this.dom.jointControls = byId("jointControls");
    this.dom.lessonList = byId("lessonList");
    this.dom.lessonSpeech = byId("lessonSpeech");
    this.dom.btnPrevLesson = byId("btnPrevLesson");
    this.dom.btnNextLesson = byId("btnNextLesson");
    this.dom.btnAutoLesson = byId("btnAutoLesson");

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
    this.dom.btnKineDemo = byId("btnKineDemo");

    this.dom.feaLoad = byId("feaLoad");
    this.dom.feaLoadText = byId("feaLoadText");
    this.dom.feaExaggeration = byId("feaExaggeration");
    this.dom.feaExaggerationText = byId("feaExaggerationText");
    this.dom.btnRunFea = byId("btnRunFea");
    this.dom.btnPauseFea = byId("btnPauseFea");
    this.dom.metricStress = byId("metricStress");
    this.dom.metricDisp = byId("metricDisp");
    this.dom.metricSf = byId("metricSf");
    this.dom.metricRisk = byId("metricRisk");
    this.dom.chart = byId("feaChart");
  }

  bindStaticUi() {
    this.dom.btnStageControl?.addEventListener("click", () => this.setTeachingStage("control"));
    this.dom.btnStageKinematics?.addEventListener("click", () => this.setTeachingStage("kinematics"));
    this.dom.btnStageFea?.addEventListener("click", () => this.setTeachingStage("fea"));

    this.dom.btnReset?.addEventListener("click", () => this.resetPose());
    this.dom.btnDemo?.addEventListener("click", () => this.runOneClickDemo());

    this.dom.btnPrevLesson?.addEventListener("click", () => this.stepLesson(-1));
    this.dom.btnNextLesson?.addEventListener("click", () => this.stepLesson(1));
    this.dom.btnAutoLesson?.addEventListener("click", () => this.toggleAutoLesson());

    this.dom.toggleAxes?.addEventListener("change", () => {
      const visible = this.dom.toggleAxes.checked;
      for (const helper of this.axisHelpers.values()) {
        helper.visible = visible;
      }
    });

    this.dom.toggleGrid?.addEventListener("change", () => {
      if (this.gridHelper) {
        this.gridHelper.visible = this.dom.toggleGrid.checked;
      }
    });

    this.dom.kinModeIK?.addEventListener("click", () => this.setKinematicsMode("ik"));
    this.dom.kinModeFK?.addEventListener("click", () => this.setKinematicsMode("fk"));
    this.dom.kinModeCompare?.addEventListener("click", () => this.setKinematicsMode("compare"));
    this.dom.btnSolveIK?.addEventListener("click", () => this.solveIkFromUi());
    this.dom.btnSolveFK?.addEventListener("click", () => this.solveFkToUi());
    this.dom.btnKineDemo?.addEventListener("click", () => this.runKinematicsPathDemo());

    this.dom.btnRunFea?.addEventListener("click", () => this.runFea());
    this.dom.btnPauseFea?.addEventListener("click", () => this.toggleFeaAnimation());

    this.dom.feaLoad?.addEventListener("input", () => {
      this.fea.load = Number(this.dom.feaLoad.value);
      this.refreshFeaTexts();
      this.fea.enabled = true;
      this.updateFeaVisual(performance.now());
    });

    this.dom.feaExaggeration?.addEventListener("input", () => {
      this.fea.exaggeration = Number(this.dom.feaExaggeration.value);
      this.refreshFeaTexts();
      this.fea.enabled = true;
      this.updateFeaVisual(performance.now());
    });

    this.dom.calibJoint?.addEventListener("change", () => this.syncCalibrationInputs());
    this.dom.btnApplyFrame?.addEventListener("click", () => this.applyCalibration());
    this.dom.btnWriteSelectedJ?.addEventListener("click", () => this.writeSelectedJoint());

    window.addEventListener("resize", () => this.onResize());
  }

  async loadConfig() {
    const url = `./joints.json?v=${TEACH_WEB_VERSION}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load joints.json (${res.status})`);
    }
    this.config = await res.json();
    this.demoFeaModel = this.resolveDemoFeaModel();
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

    return normalizePseudoFeaModel({
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
      this.dom.modeText.textContent = "鎵嬪姩鎺у埗";
    }
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
    }
  }

  setTeachingStage(stage) {
    return setTeachingStageRuntime(this, stage);
  }

  setKinematicsMode(mode) {
    return setKinematicsModeRuntime(this, mode);
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

  runFea() {
    return runFeaRuntime(this);
  }

  toggleFeaAnimation() {
    return toggleFeaAnimationRuntime(this);
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

const app = new TeachingDemoApp();
app.init().catch((err) => {
  const logEl = document.getElementById("logs");
  if (logEl) {
    logEl.textContent = `[BOOT ERROR] ${String(err)}\n${logEl.textContent}`;
  }
  // eslint-disable-next-line no-console
  console.error(err);
});

