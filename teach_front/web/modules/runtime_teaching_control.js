export function buildJointUiRuntime(app, deps) {
  const { toFixed3 } = deps;
  if (!app.dom.jointControls) {
    return;
  }

  app.dom.jointControls.innerHTML = "";
  app.jointUi.clear();

  const joints = Array.isArray(app.config?.joints) ? app.config.joints : [];
  for (const raw of joints) {
    const name = String(raw?.name || "");
    if (!name || raw?.uiHidden === true || !app.activeControlJointNames.includes(name)) {
      continue;
    }

    const def = app.jointDefs.get(name);
    if (!def) {
      continue;
    }

    const card = document.createElement("div");
    card.className = "joint-card";

    const head = document.createElement("div");
    head.className = "joint-head";

    const nameEl = document.createElement("span");
    nameEl.className = "joint-name";
    nameEl.textContent = `${name} 轴`;

    const valueEl = document.createElement("span");
    valueEl.className = "joint-value";
    valueEl.textContent = `${toFixed3(app.jointAngles[name] || 0)} deg`;

    head.append(nameEl, valueEl);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(def.minDeg);
    input.max = String(def.maxDeg);
    input.step = "0.1";
    input.value = String(def.defaultDeg);
    input.addEventListener("input", () => {
      app.setJointAngle(name, Number(input.value), { mode: "手动拖动关节" });
    });

    card.append(head, input);
    app.dom.jointControls.appendChild(card);
    app.jointUi.set(name, { input, valueEl });
  }
}

export function buildLessonsUiRuntime(app) {
  if (!app.dom.lessonList) {
    return;
  }

  app.dom.lessonList.innerHTML = "";
  app.lessonItems = [];

  const lessons = Array.isArray(app.config?.lessons) ? app.config.lessons : [];
  lessons.forEach((lesson, idx) => {
    const item = document.createElement("div");
    item.className = "lesson-item";
    item.innerHTML = `
      <p class="lesson-title">${lesson.id || `L${idx + 1}`} ${lesson.title || "教学步骤"}</p>
      <p class="lesson-sub">目标点 (${lesson.target?.x ?? 0}, ${lesson.target?.y ?? 0}, ${lesson.target?.z ?? 0})</p>
    `;
    item.addEventListener("click", () => app.applyLesson(idx));
    app.dom.lessonList.appendChild(item);
    app.lessonItems.push(item);
  });

  app.applyLesson(0, false);
}

export function applyLessonRuntime(app, index, animate, deps) {
  const { toFiniteNumber } = deps;
  const lessons = Array.isArray(app.config?.lessons) ? app.config.lessons : [];
  if (!lessons.length) {
    return;
  }

  const idx = ((index % lessons.length) + lessons.length) % lessons.length;
  app.currentLessonIndex = idx;
  const lesson = lessons[idx];

  for (let i = 0; i < app.lessonItems.length; i += 1) {
    app.lessonItems[i].classList.toggle("active", i === idx);
  }

  if (app.dom.lessonSpeech) {
    app.dom.lessonSpeech.textContent = String(lesson.speech || "");
  }

  if (app.dom.ikX) app.dom.ikX.value = String(toFiniteNumber(lesson.target?.x, 0));
  if (app.dom.ikY) app.dom.ikY.value = String(toFiniteNumber(lesson.target?.y, 0));
  if (app.dom.ikZ) app.dom.ikZ.value = String(toFiniteNumber(lesson.target?.z, 0));

  app.fea.load = toFiniteNumber(lesson.load, app.fea.load);
  if (app.dom.feaLoad) {
    app.dom.feaLoad.value = String(app.fea.load);
  }
  app.refreshFeaTexts();

  const angles = lesson.angles && typeof lesson.angles === "object" ? lesson.angles : {};
  if (animate) {
    app.animateToAngles(angles, 900);
  } else {
    for (const [k, v] of Object.entries(angles)) {
      app.setJointAngle(String(k), Number(v), { syncUi: true, applyNow: false, updateKinematics: false });
    }
    app.applyJointAngles();
    app.updateEefReadout();
  }

  if (app.dom.modeText) {
    app.dom.modeText.textContent = `教学流程 - ${lesson.title || "示教"}`;
  }
  app.kinLastSolve.reachable = null;
  app.kinLastSolve.clipped = null;
  app.updateKinematicsReadout({ step: "input" });
}

export function stepLessonRuntime(app, direction) {
  app.applyLesson(app.currentLessonIndex + direction);
}

export function toggleAutoLessonRuntime(app) {
  if (app.autoLessonTimer) {
    clearInterval(app.autoLessonTimer);
    app.autoLessonTimer = null;
    if (app.dom.btnAutoLesson) {
      app.dom.btnAutoLesson.textContent = "自动播放";
    }
    app.log("Auto lesson stopped");
    return;
  }

  app.applyLesson(app.currentLessonIndex + 1);
  app.autoLessonTimer = setInterval(() => {
    app.applyLesson(app.currentLessonIndex + 1);
  }, 3500);

  if (app.dom.btnAutoLesson) {
    app.dom.btnAutoLesson.textContent = "停止自动播放";
  }
  app.log("Auto lesson started");
}

export function clearKinematicsDemoTimersRuntime(app) {
  if (!Array.isArray(app.kinDemoTimerIds)) {
    app.kinDemoTimerIds = [];
    return;
  }
  app.kinDemoTimerIds.forEach((id) => clearTimeout(id));
  app.kinDemoTimerIds = [];
}

export function nudgeJointForTourRuntime(app, jointName, deltaDeg) {
  const name = String(jointName || "");
  if (!name || !app.jointDefs.has(name)) {
    return;
  }
  const def = app.jointDefs.get(name);
  const current = Number(app.jointAngles[name] || def?.defaultDeg || 0);
  const next = Math.min(def.maxDeg, Math.max(def.minDeg, current + Number(deltaDeg || 0)));
  app.setJointAngle(name, next, { mode: "教学引导", syncUi: true });
}

export function runControlLessonSequenceRuntime(app, indices, animate = true) {
  const list = Array.isArray(indices) ? indices : [0];
  for (const raw of list) {
    const idx = Number(raw);
    if (Number.isFinite(idx)) {
      app.applyLesson(idx, animate);
    }
  }
}

export function runOneClickDemoRuntime(app) {
  app.clearKinematicsDemoTimers();
  app.setTeachingStage("control");
  if (app.dom.modeText) {
    app.dom.modeText.textContent = "一键教学演示";
  }

  app.fea.enabled = true;
  app.fea.running = true;
  if (app.dom.feaLoad) app.dom.feaLoad.value = "82";
  if (app.dom.feaExaggeration) app.dom.feaExaggeration.value = "165";
  app.fea.load = 82;
  app.fea.exaggeration = 165;
  app.refreshFeaTexts();

  app.applyLesson(1);
  app.kinDemoTimerIds.push(setTimeout(() => app.applyLesson(2), 1600));
  app.kinDemoTimerIds.push(setTimeout(() => app.applyLesson(3), 3200));
  app.kinDemoTimerIds.push(setTimeout(() => {
    app.solveIkFromUi();
    app.log("One-click demo sequence complete");
  }, 4700));
}

export function setTeachingStageRuntime(app, stage) {
  const normalized = stage === "kinematics" || stage === "fea" ? stage : "control";
  app.currentStage = normalized;

  const btnMap = {
    control: app.dom.btnStageControl,
    kinematics: app.dom.btnStageKinematics,
    fea: app.dom.btnStageFea
  };

  Object.keys(btnMap).forEach((key) => {
    const btn = btnMap[key];
    if (btn) {
      btn.classList.toggle("is-stage-active", key === normalized);
    }
  });

  if (Array.isArray(app.dom.stagePanels)) {
    app.dom.stagePanels.forEach((panel) => {
      const key = String(panel?.dataset?.stagePanel || "").trim().toLowerCase();
      panel.classList.toggle("is-stage-active", key === normalized);
    });
  }

  if (app.dom.modeText) {
    app.dom.modeText.textContent =
      normalized === "control"
        ? "控制示教阶段"
        : normalized === "kinematics"
          ? "正逆解实验阶段"
          : "有限元演示阶段";
  }
}
