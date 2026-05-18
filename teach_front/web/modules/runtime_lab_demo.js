import { toFiniteNumber } from "./app_math.js";
import { applyFeaLabCaseInputsRuntime } from "./runtime_kinematics_fea.js";
import { solveIk as solveIkCore } from "./teaching_kinematics.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function findKinCase(config, caseId) {
  const list = Array.isArray(config?.kinLabCases) ? config.kinLabCases : [];
  const id = String(caseId || config?.labDefaults?.defaultKinLabCase || "K3");
  return list.find((c) => c.id === id) || list[0] || null;
}

function findFeaCase(config, caseId) {
  const list = Array.isArray(config?.feaLabCases) ? config.feaLabCases : [];
  const id = String(caseId || config?.labDefaults?.defaultFeaLabCase || "F3");
  return list.find((c) => c.id === id) || list[0] || null;
}

export function setDemoPlayingRuntime(app, playing) {
  app.isDemoPlaying = Boolean(playing);
  app.labDemoAbort = app.labDemoAbort || { stopped: false };
  if (!playing) {
    app.labDemoAbort.stopped = false;
  }
  document.body.classList.toggle("is-demo-playing", app.isDemoPlaying);
  if (app.dom.btnDemo) {
    const label = app.dom.btnDemo.querySelector(".sidebar-btn-label");
    if (label) {
      label.textContent = app.isDemoPlaying ? "停止演示" : "一键教学演示";
    }
  }
  if (app.dom.btnSyncHw) {
    app.dom.btnSyncHw.disabled = app.isDemoPlaying;
  }
  if (app.dom.btnReadHw) {
    app.dom.btnReadHw.disabled = app.isDemoPlaying;
  }
}

export function stopCaseDemoRuntime(app) {
  if (app.labDemoAbort) {
    app.labDemoAbort.stopped = true;
  }
  app.clearKinematicsDemoTimers();
  setDemoPlayingRuntime(app, false);
  if (app.dom.modeText && !app.isDemoPlaying) {
    app.dom.modeText.textContent = "手动控制";
  }
  app.log("教学演示已停止");
}

function isDemoStopped(app) {
  return Boolean(app.labDemoAbort?.stopped);
}

function applyKinCaseSetup(app, labCase) {
  if (!labCase) return;
  app.setTeachingStage("kinematics");
  const mode = labCase.mode === "fk" ? "fk" : "ik";
  app.setKinematicsMode(mode);

  if (Number.isFinite(labCase.lessonIndex)) {
    app.applyLesson(labCase.lessonIndex, false);
  }

  const target = labCase.target;
  if (target && mode === "ik") {
    if (app.dom.ikX) app.dom.ikX.value = String(toFiniteNumber(target.x, 210));
    if (app.dom.ikY) app.dom.ikY.value = String(toFiniteNumber(target.y, 0));
    if (app.dom.ikZ) app.dom.ikZ.value = String(toFiniteNumber(target.z, 180));
  }
}

async function runKinAction(app, action, labCase) {
  switch (action) {
    case "loadTarget": {
      applyKinCaseSetup(app, labCase);
      app.setKinematicsStep("input");
      app.updateKinematicsReadout({ step: "input" });
      break;
    }
    case "loadLessonAngles": {
      applyKinCaseSetup(app, labCase);
      if (Number.isFinite(labCase.lessonIndex)) {
        app.applyLesson(labCase.lessonIndex, true);
      }
      app.setKinematicsStep("input");
      break;
    }
    case "checkReachable": {
      app.setKinematicsStep("reachable");
      const target = app.getKinematicsTargetFromUi();
      const result = solveIkCore(target, app.config?.linkage, app.jointDefs, app.jointAngles);
      const diagnostics = result?.diagnostics || {};
      app.kinTeachingState.reachabilityLevel = diagnostics.reachability || (result.ok ? "reachable" : "unreachable");
      app.kinTeachingState.marginMm = Number(diagnostics.marginMm);
      app.kinTeachingState.lastDiagnostics = diagnostics;
      if (result.ok && Array.isArray(result.candidates)) {
        app.kinTeachingState.candidates = result.candidates;
        app.kinTeachingState.selectedCandidate = Number.isFinite(result.chosenIndex)
          ? result.chosenIndex
          : (result.candidates[0]?.index ?? 0);
      } else {
        app.kinTeachingState.candidates = [];
      }
      app.updateKinematicsReadout({ step: "reachable" });
      if (!result.ok && diagnostics.projectedTarget && app.dom.btnProjectReachable) {
        app.dom.btnProjectReachable.disabled = false;
      }
      break;
    }
    case "solveIk":
      app.solveIkFromUi();
      break;
    case "solveFk":
      app.solveFkToUi();
      break;
    case "switchSecondCandidate": {
      const candidates = app.kinTeachingState?.candidates || [];
      if (candidates.length >= 2) {
        const second = candidates[1];
        app.kinTeachingState.selectedCandidate = second.index;
        if (second.angles) {
          app.animateToAngles(second.angles, 800);
        }
        app.updateKinematicsReadout({ step: "solve" });
      }
      break;
    }
    case "validateFk":
      app.reverseCheck();
      app.setKinematicsStep("validate");
      break;
    case "projectReachable":
      app.projectTargetToReachable();
      break;
    default:
      break;
  }
}

async function runFeaAction(app, action, labCase) {
  switch (action) {
    case "loadPose": {
      app.setTeachingStage("fea");
      app.fea.enabled = true;
      app.fea.running = true;
      applyFeaLabCaseInputsRuntime(app, labCase);
      app.feaTeachingState.step = "setup";
      break;
    }
    case "setLoad": {
      applyFeaLabCaseInputsRuntime(app, labCase);
      app.feaTeachingState.step = "setup";
      break;
    }
    case "runAnalysis": {
      app.feaTeachingState.step = "compute";
      app.runFea();
      await delay(400);
      app.updateFeaVisual(performance.now());
      await delay(500);
      app.feaTeachingState.step = "observe";
      break;
    }
    case "observeHotspot": {
      app.feaTeachingState.step = "observe";
      app.focusFeaRiskSection();
      app.updateFeaVisual(performance.now());
      break;
    }
    case "explainHotspot": {
      app.feaTeachingState.step = "explain";
      app.focusFeaRiskSection();
      const narrative = app.config?.energyCalibration?.optimizationNarrative || "";
      if (app.dom.feaExplainText && narrative && (labCase.id === "F3" || labCase.id === "F2")) {
        app.dom.feaExplainText.textContent = `${app.dom.feaExplainText.textContent} ${narrative}`;
      }
      break;
    }
    default:
      break;
  }
}

function setKinNarration(app, text, phase) {
  if (app.dom.kinExplainText) {
    app.dom.kinExplainText.textContent = text;
  }
  if (phase) {
    app.setKinematicsStep(phase);
  }
}

function setFeaNarrationStep(app, text, phase) {
  if (app.dom.feaExplainText) {
    app.dom.feaExplainText.textContent = text;
  }
  if (phase) {
    app.feaTeachingState.step = phase;
    const items = Array.from(document.querySelectorAll("#feaStepper li[data-fea-step]"));
    const order = ["setup", "compute", "observe", "explain"];
    const index = Math.max(0, order.indexOf(phase));
    items.forEach((li, idx) => {
      li.classList.toggle("is-active", idx === index);
      li.classList.toggle("is-done", idx < index);
    });
    if (app.dom.feaStepText) {
      const map = { setup: "步骤 1/4 设置", compute: "步骤 2/4 计算", observe: "步骤 3/4 观察", explain: "步骤 4/4 解释" };
      app.dom.feaStepText.textContent = map[phase] || map.setup;
    }
  }
}

export async function runCaseDemoRuntime(app, caseId, kind = "auto") {
  const stage = kind === "kin" || kind === "fea"
    ? kind
    : (app.currentStage === "fea" ? "fea" : app.currentStage === "kinematics" ? "kin" : null);

  if (stage === "kin" || (!stage && app.currentStage === "kinematics")) {
    const labCase = findKinCase(app.config, caseId);
    if (!labCase?.demoScript?.steps?.length) {
      app.log("未找到正逆解演示案例", caseId);
      return;
    }
    app.clearKinematicsDemoTimers();
    app.labDemoAbort = { stopped: false };
    setDemoPlayingRuntime(app, true);
    if (app.dom.modeText) app.dom.modeText.textContent = "一键教学演示";
    applyKinCaseSetup(app, labCase);

    const pauseMs = toFiniteNumber(labCase.demoScript.pauseBetweenStepsMs, 850);
    try {
      for (const step of labCase.demoScript.steps) {
        if (isDemoStopped(app)) break;
        setKinNarration(app, step.narration || "", step.phase);
        await runKinAction(app, step.action, labCase);
        await delay(pauseMs);
      }
    } finally {
      setDemoPlayingRuntime(app, false);
      if (app.dom.modeText) app.dom.modeText.textContent = "手动控制";
      app.log("正逆解教学演示结束", labCase.id);
    }
    return;
  }

  if (stage === "fea" || app.currentStage === "fea") {
    const labCase = findFeaCase(app.config, caseId);
    if (!labCase?.demoScript?.steps?.length) {
      app.log("未找到有限元演示案例", caseId);
      return;
    }
    app.labDemoAbort = { stopped: false };
    setDemoPlayingRuntime(app, true);
    if (app.dom.modeText) app.dom.modeText.textContent = "一键教学演示";
    app.setTeachingStage("fea");
    app.fea.enabled = true;
    app.fea.running = true;

    const pauseMs = toFiniteNumber(labCase.demoScript.pauseBetweenStepsMs, 900);
    try {
      for (const step of labCase.demoScript.steps) {
        if (isDemoStopped(app)) break;
        setFeaNarrationStep(app, step.narration || "", step.phase);
        await runFeaAction(app, step.action, labCase);
        await delay(pauseMs);
      }
    } finally {
      setDemoPlayingRuntime(app, false);
      if (app.dom.modeText) app.dom.modeText.textContent = "手动控制";
      app.log("有限元教学演示结束", labCase.id);
    }
  }
}

export function runKinematicsCaseDemoRuntime(app, caseId) {
  return runCaseDemoRuntime(app, caseId, "kin");
}

export function runFeaCaseDemoRuntime(app, caseId) {
  return runCaseDemoRuntime(app, caseId, "fea");
}
