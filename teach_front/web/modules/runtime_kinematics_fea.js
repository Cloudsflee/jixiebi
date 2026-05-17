export function setKinematicsModeRuntime(app, mode) {
  const next = mode === "fk" || mode === "compare" ? mode : "ik";
  app.kinMode = next;

  const toggle = (el, active) => {
    if (!el) return;
    el.classList.toggle("is-mode-active", active);
  };

  toggle(app.dom.kinModeIK, next === "ik");
  toggle(app.dom.kinModeFK, next === "fk");
  toggle(app.dom.kinModeCompare, next === "compare");

  if (app.dom.kinInputHint) {
    app.dom.kinInputHint.textContent =
      next === "ik"
        ? "IK: 输入目标点，点击“执行逆解”生成关节角。"
        : next === "fk"
          ? "FK: 基于当前关节角计算末端点。"
          : "Compare: 对比目标点与 FK 结果偏差。";
  }
}

export function setKinematicsStepRuntime(app, step) {
  if (!app.dom.kinSteps) {
    return;
  }
  const items = Array.from(app.dom.kinSteps.querySelectorAll("li[data-step]"));
  items.forEach((item) => {
    item.classList.toggle("is-step-active", item.dataset.step === step);
  });
}

export function setKinematicsChipRuntime(_app, el, text, tone = "") {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("tone-ok", "tone-warn", "tone-bad");
  if (tone) {
    el.classList.add(`tone-${tone}`);
  }
}

export function getKinematicsTargetFromUiRuntime(app, deps) {
  const { toFiniteNumber } = deps;
  return {
    x: toFiniteNumber(app.dom.ikX?.value, 0),
    y: toFiniteNumber(app.dom.ikY?.value, 0),
    z: toFiniteNumber(app.dom.ikZ?.value, 0)
  };
}

export function updateKinematicsReadoutRuntime(app, options = {}, deps) {
  const { THREE, computeFkCore } = deps;
  const step = options.step || "validate";
  app.setKinematicsStep(step);

  const target = app.getKinematicsTargetFromUi();
  const fk = computeFkCore(app.jointAngles, app.config?.linkage);
  const targetV = new THREE.Vector3(target.x, target.y, target.z);
  const fkV = new THREE.Vector3(fk.x, fk.y, fk.z);
  const err = targetV.distanceTo(fkV);

  const reachable = app.kinLastSolve.reachable;
  const clipped = app.kinLastSolve.clipped;

  if (reachable === true) {
    app.setKinematicsChip(app.dom.kinReachable, "Reachable", "ok");
  } else if (reachable === false) {
    app.setKinematicsChip(app.dom.kinReachable, "Unreachable", "bad");
  } else {
    app.setKinematicsChip(app.dom.kinReachable, "-", "");
  }

  const errTone = err <= 5 ? "ok" : (err <= 20 ? "warn" : "bad");
  app.setKinematicsChip(app.dom.kinError, `${err.toFixed(2)} mm`, errTone);

  if (clipped === true) {
    app.setKinematicsChip(app.dom.kinClip, "Clipped", "warn");
  } else if (clipped === false) {
    app.setKinematicsChip(app.dom.kinClip, "No Clip", "ok");
  } else {
    app.setKinematicsChip(app.dom.kinClip, "-", "");
  }
}

export function runKinematicsPathDemoRuntime(app) {
  app.clearKinematicsDemoTimers();
  app.setTeachingStage("kinematics");
  app.setKinematicsMode("compare");
  if (app.dom.modeText) {
    app.dom.modeText.textContent = "运动学路径演示";
  }

  const sequence = [
    { target: { x: 210, y: 80, z: 180 }, action: "ik" },
    { target: { x: 190, y: -40, z: 190 }, action: "ik" },
    { target: { x: 225, y: 55, z: 165 }, action: "ik" }
  ];

  sequence.forEach((node, idx) => {
    const timer = setTimeout(() => {
      if (app.dom.ikX) app.dom.ikX.value = String(node.target.x);
      if (app.dom.ikY) app.dom.ikY.value = String(node.target.y);
      if (app.dom.ikZ) app.dom.ikZ.value = String(node.target.z);
      if (node.action === "ik") {
        app.solveIkFromUi();
      } else {
        app.solveFkToUi();
      }
    }, idx * 1200);
    app.kinDemoTimerIds.push(timer);
  });

  const doneTimer = setTimeout(() => {
    app.log("Kinematics path demo finished");
    app.kinDemoTimerIds = [];
  }, sequence.length * 1200 + 120);
  app.kinDemoTimerIds.push(doneTimer);
}

export function solveIkFromUiRuntime(app, deps) {
  const { toFiniteNumber, solveIkCore } = deps;
  app.setTeachingStage("kinematics");

  const target = {
    x: toFiniteNumber(app.dom.ikX?.value, 0),
    y: toFiniteNumber(app.dom.ikY?.value, 0),
    z: toFiniteNumber(app.dom.ikZ?.value, 0)
  };

  app.setKinematicsStep("reachable");
  const result = solveIkCore(target, app.config?.linkage, app.jointDefs, app.jointAngles);

  if (!result.ok) {
    if (app.dom.ikStatus) {
      app.dom.ikStatus.textContent = `逆解失败: ${result.message}`;
    }
    if (app.dom.modeText) {
      app.dom.modeText.textContent = "逆解失败";
    }
    app.kinLastSolve.reachable = false;
    app.kinLastSolve.clipped = null;
    app.kinLastSolve.errorMm = null;
    app.updateKinematicsReadout({ step: "reachable" });
    app.log("IK failed", target);
    return;
  }

  app.setKinematicsStep("solve");
  app.animateToAngles(result.angles, 900);

  if (app.dom.ikStatus) {
    app.dom.ikStatus.textContent = result.clipped
      ? "逆解完成（部分角度触发限位裁剪）"
      : "逆解完成（已更新 J1~J4）";
  }

  if (app.dom.modeText) {
    app.dom.modeText.textContent = "逆解驱动";
  }

  app.kinLastSolve.reachable = true;
  app.kinLastSolve.clipped = Boolean(result.clipped);
  app.updateKinematicsReadout({ step: "validate" });
  app.log("IK solved", result.angles);
}

export function solveFkToUiRuntime(app, deps) {
  const { computeFkCore } = deps;
  app.setTeachingStage("kinematics");
  app.setKinematicsStep("solve");

  const fk = computeFkCore(app.jointAngles, app.config?.linkage);
  if (app.dom.ikX) app.dom.ikX.value = fk.x.toFixed(1);
  if (app.dom.ikY) app.dom.ikY.value = fk.y.toFixed(1);
  if (app.dom.ikZ) app.dom.ikZ.value = fk.z.toFixed(1);

  if (app.dom.ikStatus) {
    app.dom.ikStatus.textContent = `正解完成: X=${fk.x.toFixed(1)}, Y=${fk.y.toFixed(1)}, Z=${fk.z.toFixed(1)}`;
  }
  if (app.dom.modeText) {
    app.dom.modeText.textContent = "正解计算";
  }

  app.kinLastSolve.reachable = true;
  app.kinLastSolve.clipped = false;
  app.kinLastSolve.errorMm = 0;
  app.updateKinematicsReadout({ step: "validate" });
  app.log("FK solved", fk);
}

export function updateEefReadoutRuntime(app, deps) {
  const { computeFkCore } = deps;
  const fk = computeFkCore(app.jointAngles, app.config?.linkage);
  if (app.dom.eefPos) {
    app.dom.eefPos.textContent = `X ${fk.x.toFixed(1)} | Y ${fk.y.toFixed(1)} | Z ${fk.z.toFixed(1)}`;
  }
  app.updateKinematicsReadout({ step: "validate" });
}

export function refreshFeaTextsRuntime(app) {
  if (app.dom.feaLoadText) {
    app.dom.feaLoadText.textContent = `${app.fea.load}%`;
  }
  if (app.dom.feaExaggerationText) {
    app.dom.feaExaggerationText.textContent = `${app.fea.exaggeration}%`;
  }
}

export function runFeaRuntime(app) {
  app.setTeachingStage("fea");
  app.fea.enabled = true;
  app.fea.running = true;
  if (app.dom.modeText) {
    app.dom.modeText.textContent = "有限元演示";
  }
  app.updateFeaVisual(performance.now());
  app.log("FEA simulation started", {
    load: app.fea.load,
    exaggeration: app.fea.exaggeration
  });
}

export function toggleFeaAnimationRuntime(app) {
  app.fea.running = !app.fea.running;
  if (app.dom.btnPauseFea) {
    app.dom.btnPauseFea.textContent = app.fea.running ? "暂停形变动画" : "恢复形变动画";
  }
  app.log(app.fea.running ? "FEA animation resumed" : "FEA animation paused");
}

export function updateFeaVisualRuntimeFacade(app, nowMs, deps) {
  const { updateFeaVisualRuntimeCore, drawFeaChartCore } = deps;
  const result = updateFeaVisualRuntimeCore({
    nowMs,
    fea: app.fea,
    lastFeaUpdate: app.lastFeaUpdate,
    lastHistoryPush: app.lastHistoryPush,
    feaRecords: app.feaRecords,
    demoFeaModel: app.demoFeaModel,
    jointAngles: app.jointAngles,
    metricElements: {
      metricStress: app.dom.metricStress,
      metricDisp: app.dom.metricDisp,
      metricSf: app.dom.metricSf,
      metricRisk: app.dom.metricRisk
    }
  });

  app.lastFeaUpdate = result.lastFeaUpdate;
  app.lastHistoryPush = result.lastHistoryPush;

  if (result.historyPushed) {
    app.feaHistory.push({
      stress: app.fea.maxStress,
      disp: app.fea.maxDisp
    });
    if (app.feaHistory.length > 90) {
      app.feaHistory.shift();
    }
    drawFeaChartCore(app.dom.chart, app.feaHistory);
  }
}
