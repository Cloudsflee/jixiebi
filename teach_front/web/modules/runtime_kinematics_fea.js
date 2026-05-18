function safeText(v) {
  return String(v ?? "");
}

function formatNum(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

function toneByError(err) {
  if (!Number.isFinite(err)) return "";
  if (err <= 5) return "ok";
  if (err <= 20) return "warn";
  return "bad";
}

function updatePrimaryCtaByMode(app) {
  const ikActive = app.kinMode === "ik" || app.kinMode === "compare";
  if (app.dom.btnSolveIK) {
    app.dom.btnSolveIK.disabled = !ikActive;
    app.dom.btnSolveIK.classList.toggle("btn-strong", ikActive);
  }
  if (app.dom.btnSolveFK) {
    app.dom.btnSolveFK.disabled = app.kinMode === "ik";
    app.dom.btnSolveFK.classList.toggle("btn-strong", app.kinMode === "fk");
  }
}

function updateKinematicsNarrative(app, payload) {
  const data = payload || {};
  const conclusion = safeText(data.conclusion || "等待求解");
  const reason = safeText(data.reason || "输入目标点后执行 IK/FK 计算。");
  const suggestion = safeText(data.suggestion || "建议先在 IK 模式输入目标点，再执行逆解。");

  if (app.dom.ikStatus) {
    app.dom.ikStatus.innerHTML = `<strong>结论：</strong>${conclusion}<br /><strong>原因：</strong>${reason}<br /><strong>建议：</strong>${suggestion}`;
  }

  if (app.dom.kinExplainText) {
    const explain = safeText(data.explain || reason);
    app.dom.kinExplainText.textContent = explain;
  }
}

function renderCandidateList(app) {
  if (!app.dom.kinCandidateList) return;
  const candidates = Array.isArray(app.kinTeachingState?.candidates) ? app.kinTeachingState.candidates : [];
  if (!candidates.length) {
    app.dom.kinCandidateList.innerHTML = '<p class="kin-empty">暂无候选解。先执行逆解可查看肘上/肘下方案。</p>';
    return;
  }

  const selected = Number.isFinite(app.kinTeachingState.selectedCandidate)
    ? app.kinTeachingState.selectedCandidate
    : (Number(candidates[0]?.index) || 0);
  app.kinTeachingState.selectedCandidate = selected;

  const html = candidates.map((c) => {
    const active = Number(c.index) === Number(selected);
    const clipTag = c.clipped ? "限位裁剪" : "未裁剪";
    return `
      <button type="button" class="kin-candidate-item${active ? " is-active" : ""}" data-candidate-index="${c.index}">
        <span class="kin-candidate-title">${safeText(c.label)}${active ? "（推荐）" : ""}</span>
        <span class="kin-candidate-meta">误差 ${formatNum(c.errorMm, 2)} mm | 裁剪 ${clipTag}</span>
      </button>
    `;
  }).join("");

  app.dom.kinCandidateList.innerHTML = html;
  const items = Array.from(app.dom.kinCandidateList.querySelectorAll("[data-candidate-index]"));
  items.forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.getAttribute("data-candidate-index"));
      if (!Number.isFinite(idx)) return;
      app.kinTeachingState.selectedCandidate = idx;
      const pick = candidates.find((c) => Number(c.index) === idx);
      if (pick && pick.angles) {
        app.animateToAngles(pick.angles, 700);
        app.kinLastSolve.clipped = Boolean(pick.clipped);
        app.kinLastSolve.reachable = app.kinTeachingState.reachabilityLevel !== "unreachable";
        updateKinematicsNarrative(app, {
          conclusion: `已切换到 ${pick.label}`,
          reason: `该解误差 ${formatNum(pick.errorMm, 2)} mm，最小限位裕量 ${formatNum(pick.minLimitMarginDeg, 1)}°。`,
          suggestion: "观察机械臂姿态变化，并对比两组候选解的可执行性。",
          explain: `候选解对比：${pick.label} 的平滑度代价为 ${formatNum(pick.smoothnessDeltaDeg, 1)}°。`
        });
        app.updateKinematicsReadout({ step: "validate" });
        if (typeof app.scheduleUiStateSave === "function") {
          app.scheduleUiStateSave();
        }
        renderCandidateList(app);
      }
    });
  });
}

function updateDiagnosticsPanel(app, data = {}) {
  if (app.dom.kinDiagReachability) {
    const map = {
      reachable: "可达",
      boundary: "边界附近",
      unreachable: "不可达"
    };
    app.dom.kinDiagReachability.textContent = map[data.reachability] || "-";
  }
  if (app.dom.kinDiagMargin) {
    app.dom.kinDiagMargin.textContent = Number.isFinite(data.marginMm) ? `${formatNum(data.marginMm, 2)} mm` : "-";
  }
  if (app.dom.kinDiagPlanarR) {
    app.dom.kinDiagPlanarR.textContent = Number.isFinite(data.planarRadiusMm) ? `${formatNum(data.planarRadiusMm, 2)} mm` : "-";
  }
  if (app.dom.kinDiagZOffset) {
    app.dom.kinDiagZOffset.textContent = Number.isFinite(data.verticalOffsetMm) ? `${formatNum(data.verticalOffsetMm, 2)} mm` : "-";
  }
  if (app.dom.kinDiagSingularity) {
    app.dom.kinDiagSingularity.textContent = data.nearSingularity ? "接近奇异/边界" : "状态稳定";
  }

  const reason = safeText(data.reason || "-");
  if (app.dom.kinReasonText) {
    app.dom.kinReasonText.textContent = reason;
  }
}

function updateSelectionBasis(app) {
  const candidates = Array.isArray(app.kinTeachingState?.candidates) ? app.kinTeachingState.candidates : [];
  const selectedIndex = Number(app.kinTeachingState?.selectedCandidate);
  const selected = candidates.find((c) => Number(c.index) === selectedIndex) || candidates[0] || null;
  if (!selected) {
    if (app.dom.kinBasisLimitMargin) app.dom.kinBasisLimitMargin.textContent = "-";
    if (app.dom.kinBasisError) app.dom.kinBasisError.textContent = "-";
    if (app.dom.kinBasisSmoothness) app.dom.kinBasisSmoothness.textContent = "-";
    return;
  }

  if (app.dom.kinBasisLimitMargin) app.dom.kinBasisLimitMargin.textContent = `${formatNum(selected.minLimitMarginDeg, 1)}°`;
  if (app.dom.kinBasisError) app.dom.kinBasisError.textContent = `${formatNum(selected.errorMm, 2)} mm`;
  if (app.dom.kinBasisSmoothness) app.dom.kinBasisSmoothness.textContent = `${formatNum(selected.smoothnessDeltaDeg, 1)}°`;
}

function updateReverseCheck(app, payload = null) {
  if (!app.dom.kinReverseStatus) return;
  if (!payload) {
    app.dom.kinReverseStatus.textContent = "尚未执行反向验证。";
    return;
  }
  const dx = Number(payload.dx);
  const dy = Number(payload.dy);
  const dz = Number(payload.dz);
  const e = Number(payload.errMm);
  app.dom.kinReverseStatus.textContent = `ΔX=${formatNum(dx, 2)} mm, ΔY=${formatNum(dy, 2)} mm, ΔZ=${formatNum(dz, 2)} mm, 合成误差=${formatNum(e, 2)} mm`;
}

function applyCandidateAngles(app, candidate, modeText = "逆解驱动") {
  if (!candidate || !candidate.angles) return;
  app.animateToAngles(candidate.angles, 900);
  app.kinLastSolve.reachable = app.kinTeachingState.reachabilityLevel !== "unreachable";
  app.kinLastSolve.clipped = Boolean(candidate.clipped);
  if (app.dom.modeText) {
    app.dom.modeText.textContent = modeText;
  }
}

function buildKinematicsFailureSuggestion(result) {
  const projected = result?.diagnostics?.projectedTarget;
  if (projected) {
    return "可点击“一键投影到最近可达点”，快速获得可解目标。";
  }
  return "建议减小目标半径或调整高度后重试。";
}

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
        ? "IK：输入目标点，先判定可达性，再生成候选解并选择推荐姿态。"
        : next === "fk"
          ? "FK：基于当前关节角计算末端位置，再对照目标点验证误差。"
          : "Compare：对比目标点与 FK 结果误差，可切换候选解观察差异。";
  }

  if (app.dom.btnStepRun) {
    app.dom.btnStepRun.disabled = next === "fk";
  }

  updatePrimaryCtaByMode(app);
}

export function setKinematicsStepRuntime(app, step) {
  if (!app.dom.kinSteps) {
    return;
  }
  const items = Array.from(app.dom.kinSteps.querySelectorAll("li[data-step]"));
  items.forEach((item) => {
    item.classList.toggle("is-step-active", item.dataset.step === step);
  });
  if (app.kinTeachingState) {
    app.kinTeachingState.step = step;
  }
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
  const dx = fk.x - target.x;
  const dy = fk.y - target.y;
  const dz = fk.z - target.z;

  const reachabilityLevel = app.kinTeachingState?.reachabilityLevel || "unknown";
  const clipped = app.kinLastSolve.clipped;
  const reachText = reachabilityLevel === "reachable"
    ? "可达"
    : reachabilityLevel === "boundary"
      ? "边界附近"
      : reachabilityLevel === "unreachable"
        ? "不可达"
        : "-";

  if (reachabilityLevel === "reachable") {
    app.setKinematicsChip(app.dom.kinReachable, reachText, "ok");
  } else if (reachabilityLevel === "boundary") {
    app.setKinematicsChip(app.dom.kinReachable, reachText, "warn");
  } else if (reachabilityLevel === "unreachable") {
    app.setKinematicsChip(app.dom.kinReachable, reachText, "bad");
  } else {
    app.setKinematicsChip(app.dom.kinReachable, "-", "");
  }

  const errTone = toneByError(err);
  app.setKinematicsChip(app.dom.kinError, `${err.toFixed(2)} mm`, errTone);

  if (clipped === true) {
    app.setKinematicsChip(app.dom.kinClip, "已裁剪", "warn");
  } else if (clipped === false) {
    app.setKinematicsChip(app.dom.kinClip, "无裁剪", "ok");
  } else {
    app.setKinematicsChip(app.dom.kinClip, "-", "");
  }

  if (app.dom.kinDiagErrVec) {
    app.dom.kinDiagErrVec.textContent = `(${formatNum(dx, 2)}, ${formatNum(dy, 2)}, ${formatNum(dz, 2)}) mm`;
  }

  app.kinLastSolve.errorMm = err;
  updateSelectionBasis(app);

  if (options.fromReverseCheck === true) {
    updateReverseCheck(app, { dx, dy, dz, errMm: err });
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
  const diagnostics = result?.diagnostics || {};
  app.kinTeachingState.reachabilityLevel = diagnostics.reachability || (result.ok ? "reachable" : "unreachable");
  app.kinTeachingState.marginMm = Number(diagnostics.marginMm);
  app.kinTeachingState.lastDiagnostics = diagnostics;
  updateDiagnosticsPanel(app, diagnostics);

  if (!result.ok) {
    app.kinTeachingState.candidates = [];
    app.kinTeachingState.selectedCandidate = -1;
    renderCandidateList(app);

    app.kinLastSolve.reachable = false;
    app.kinLastSolve.clipped = null;
    app.kinLastSolve.errorMm = null;

    const projected = diagnostics.projectedTarget;
    if (projected && app.dom.btnProjectReachable) {
      app.dom.btnProjectReachable.disabled = false;
    }

    updateKinematicsNarrative(app, {
      conclusion: "逆解失败",
      reason: safeText(result.message || "目标超出可达范围"),
      suggestion: buildKinematicsFailureSuggestion(result),
      explain: `可达性判定：${app.kinTeachingState.reachabilityLevel === "unreachable" ? "不可达" : "边界附近"}。`
    });

    if (app.dom.modeText) {
      app.dom.modeText.textContent = "逆解失败";
    }
    app.updateKinematicsReadout({ step: "reachable" });
    app.log("IK failed", target);
    return;
  }

  app.setKinematicsStep("solve");
  app.kinTeachingState.candidates = Array.isArray(result.candidates) ? result.candidates : [];
  app.kinTeachingState.selectedCandidate = Number.isFinite(result.chosenIndex) ? result.chosenIndex : (app.kinTeachingState.candidates[0]?.index ?? 0);
  renderCandidateList(app);

  const chosen = app.kinTeachingState.candidates.find((c) => Number(c.index) === Number(app.kinTeachingState.selectedCandidate))
    || app.kinTeachingState.candidates[0]
    || null;

  if (chosen) {
    applyCandidateAngles(app, chosen, "逆解驱动");
  }

  if (app.dom.btnProjectReachable) {
    app.dom.btnProjectReachable.disabled = true;
  }

  const clippedText = chosen?.clipped ? "存在限位裁剪" : "未触发限位裁剪";
  const marginText = Number.isFinite(diagnostics.marginMm) ? `${formatNum(diagnostics.marginMm, 2)} mm` : "-";

  updateKinematicsNarrative(app, {
    conclusion: `逆解完成（推荐：${safeText(chosen?.label || "候选解")})`,
    reason: `可达性 ${app.kinTeachingState.reachabilityLevel === "boundary" ? "边界附近" : "可达"}，边界裕量 ${marginText}，${clippedText}。`,
    suggestion: "可在高级分析区切换候选解，对比限位裕量与平滑度。",
    explain: safeText(diagnostics.reason || "候选解已根据误差、限位与平滑度自动排序。")
  });

  app.kinLastSolve.reachable = true;
  app.kinLastSolve.clipped = Boolean(chosen?.clipped);
  app.updateKinematicsReadout({ step: "validate" });
  app.log("IK solved", chosen?.angles || result.angles);
}

export function solveFkToUiRuntime(app, deps) {
  const { computeFkCore } = deps;
  app.setTeachingStage("kinematics");
  app.setKinematicsStep("solve");

  const fk = computeFkCore(app.jointAngles, app.config?.linkage);
  if (app.dom.ikX) app.dom.ikX.value = fk.x.toFixed(1);
  if (app.dom.ikY) app.dom.ikY.value = fk.y.toFixed(1);
  if (app.dom.ikZ) app.dom.ikZ.value = fk.z.toFixed(1);

  if (app.dom.modeText) {
    app.dom.modeText.textContent = "正解计算";
  }

  app.kinTeachingState.reachabilityLevel = "reachable";
  app.kinTeachingState.marginMm = Number.NaN;
  app.kinTeachingState.candidates = [];
  app.kinTeachingState.selectedCandidate = -1;
  app.kinTeachingState.reverseCheck = null;
  renderCandidateList(app);

  app.kinLastSolve.reachable = true;
  app.kinLastSolve.clipped = false;
  app.kinLastSolve.errorMm = 0;

  updateKinematicsNarrative(app, {
    conclusion: "正解完成",
    reason: `已由当前关节角计算末端点：X=${fk.x.toFixed(1)}, Y=${fk.y.toFixed(1)}, Z=${fk.z.toFixed(1)}。`,
    suggestion: "点击“反向验证”查看与目标点的误差向量。",
    explain: "FK 是由关节角直接映射到末端位姿的前向计算。"
  });

  updateDiagnosticsPanel(app, {
    reachability: "reachable",
    marginMm: Number.NaN,
    planarRadiusMm: Math.sqrt(fk.x * fk.x + fk.y * fk.y),
    verticalOffsetMm: Number.NaN,
    nearSingularity: false,
    reason: "FK 模式下可直接观察当前角度对应的末端位置。"
  });

  app.updateKinematicsReadout({ step: "validate" });
  app.log("FK solved", fk);
}

export function runKinematicsStepRuntime(app, direction) {
  const order = ["input", "reachable", "solve", "validate"];
  const current = String(app.kinTeachingState?.step || "input");
  const idx = Math.max(0, order.indexOf(current));
  const nextIdx = Math.min(order.length - 1, Math.max(0, idx + direction));
  const next = order[nextIdx];
  app.setKinematicsStep(next);

  const explainMap = {
    input: "步骤1：先输入目标点或确认当前关节角。",
    reachable: "步骤2：检查目标是否在可达工作空间内。",
    solve: "步骤3：执行 IK/FK 求解并更新机械臂姿态。",
    validate: "步骤4：比较目标点与末端计算结果的误差。"
  };
  if (app.dom.kinExplainText) {
    app.dom.kinExplainText.textContent = explainMap[next];
  }
}

export function projectTargetToReachableRuntime(app) {
  const p = app.kinTeachingState?.lastDiagnostics?.projectedTarget;
  if (!p) {
    updateKinematicsNarrative(app, {
      conclusion: "无需投影",
      reason: "当前目标已经可达，未提供投影点。",
      suggestion: "可直接执行逆解。",
      explain: "投影功能仅在目标不可达时启用。"
    });
    return;
  }

  if (app.dom.ikX) app.dom.ikX.value = formatNum(p.x, 1);
  if (app.dom.ikY) app.dom.ikY.value = formatNum(p.y, 1);
  if (app.dom.ikZ) app.dom.ikZ.value = formatNum(p.z, 1);

  updateKinematicsNarrative(app, {
    conclusion: "已投影到最近可达点",
    reason: `投影点为 X=${formatNum(p.x, 1)}, Y=${formatNum(p.y, 1)}, Z=${formatNum(p.z, 1)}。`,
    suggestion: "点击“执行逆解”继续。",
    explain: "该投影沿目标方向缩放到可达边界附近。"
  });

  if (app.dom.btnProjectReachable) {
    app.dom.btnProjectReachable.disabled = true;
  }
  if (typeof app.scheduleUiStateSave === "function") {
    app.scheduleUiStateSave();
  }
}

export function reverseCheckRuntime(app, deps) {
  const { computeFkCore } = deps;
  const target = app.getKinematicsTargetFromUi();
  const fk = computeFkCore(app.jointAngles, app.config?.linkage);
  const dx = fk.x - target.x;
  const dy = fk.y - target.y;
  const dz = fk.z - target.z;
  const errMm = Math.sqrt(dx * dx + dy * dy + dz * dz);

  app.kinTeachingState.reverseCheck = { dx, dy, dz, errMm };
  updateReverseCheck(app, { dx, dy, dz, errMm });
  app.updateKinematicsReadout({ step: "validate", fromReverseCheck: true });

  updateKinematicsNarrative(app, {
    conclusion: "反向验证完成",
    reason: `误差向量 = (${formatNum(dx, 2)}, ${formatNum(dy, 2)}, ${formatNum(dz, 2)}) mm。`,
    suggestion: errMm > 20 ? "误差较大，建议重新执行逆解或调整目标点。" : "误差可接受，可继续下一步教学。",
    explain: "反向验证用于确认当前关节角是否准确达到目标点。"
  });
}

export function toggleKinematicsAdvancedRuntime(app) {
  app.kinTeachingState.advancedExpanded = !Boolean(app.kinTeachingState.advancedExpanded);
  const expanded = app.kinTeachingState.advancedExpanded;
  if (app.dom.kinAdvancedPanel) {
    app.dom.kinAdvancedPanel.hidden = !expanded;
  }
  if (app.dom.btnToggleKinAdvanced) {
    app.dom.btnToggleKinAdvanced.textContent = expanded ? "收起高级分析" : "展开高级分析";
  }
  if (typeof app.scheduleUiStateSave === "function") {
    app.scheduleUiStateSave();
  }
}

export function refreshKinematicsTeachingUiRuntime(app) {
  const expanded = Boolean(app.kinTeachingState?.advancedExpanded);
  if (app.dom.kinAdvancedPanel) {
    app.dom.kinAdvancedPanel.hidden = !expanded;
  }
  if (app.dom.btnToggleKinAdvanced) {
    app.dom.btnToggleKinAdvanced.textContent = expanded ? "收起高级分析" : "展开高级分析";
  }

  updatePrimaryCtaByMode(app);
  renderCandidateList(app);
  updateSelectionBasis(app);
  updateReverseCheck(app, app.kinTeachingState?.reverseCheck || null);
}

export function updateEefReadoutRuntime(app, deps) {
  const { computeFkCore } = deps;
  const fk = computeFkCore(app.jointAngles, app.config?.linkage);
  if (app.dom.eefPos) {
    app.dom.eefPos.textContent = `X ${fk.x.toFixed(1)} | Y ${fk.y.toFixed(1)} | Z ${fk.z.toFixed(1)}`;
  }
  app.updateKinematicsReadout({ step: "validate" });
}

function setFeaNarrative(app, payload = {}) {
  const conclusion = safeText(payload.conclusion || "尚未开始");
  const reason = safeText(payload.reason || "配置载荷与变形样式后运行仿真。");
  const suggestion = safeText(payload.suggestion || "可用步骤回放观察响应变化。");
  const explain = safeText(payload.explain || reason);

  if (app.dom.feaStatusText) {
    app.dom.feaStatusText.innerHTML = `<strong>结论：</strong>${conclusion}<br /><strong>原因：</strong>${reason}<br /><strong>建议：</strong>${suggestion}`;
  }
  if (app.dom.feaExplainText) {
    app.dom.feaExplainText.textContent = explain;
  }
}

function updateFeaStepperUi(app) {
  const order = ["setup", "compute", "observe", "explain"];
  const step = safeText(app.feaTeachingState?.step || "setup");
  const index = Math.max(0, order.indexOf(step));

  if (app.dom.feaStepText) {
    const map = {
      setup: "步骤 1/4 设置",
      compute: "步骤 2/4 计算",
      observe: "步骤 3/4 观察",
      explain: "步骤 4/4 解释"
    };
    app.dom.feaStepText.textContent = map[step] || "步骤 1/4 设置";
  }

  const items = Array.from(document.querySelectorAll("#feaStepper li[data-fea-step]"));
  items.forEach((li, idx) => {
    li.classList.toggle("is-active", idx === index);
    li.classList.toggle("is-done", idx < index);
  });

  if (app.dom.btnFeaStepPrev) {
    app.dom.btnFeaStepPrev.disabled = index <= 0;
  }
  if (app.dom.btnFeaStepNext) {
    app.dom.btnFeaStepNext.disabled = index >= order.length - 1;
    app.dom.btnFeaStepNext.classList.toggle("btn-strong", index < order.length - 1);
  }
}

function updateFeaLegendState(app, hotspotLevel) {
  const level = safeText(hotspotLevel || "").toLowerCase();
  const map = {
    low: "低",
    medium: "中",
    high: "高",
    critical: "危险"
  };
  if (app.dom.feaLegendState) {
    app.dom.feaLegendState.textContent = map[level] || "-";
  }
}

function updateFeaSectionContrib(app, sectionRank = []) {
  const rows = Array.isArray(sectionRank) ? sectionRank : [];
  if (app.dom.feaSectionRows) {
    if (!rows.length) {
      app.dom.feaSectionRows.innerHTML = '<p class="fea-empty">暂无诊断数据，请先运行有限元演示。</p>';
    } else {
      app.dom.feaSectionRows.innerHTML = rows.map((r) => `
        <div class="fea-section-row${r.rank === 1 ? " is-top" : ""}">
          <span>${safeText(String(r.section || "").toUpperCase())}</span>
          <span>${formatNum(Number(r.stressPct || 0) * 100, 1)}%</span>
          <span>${formatNum(Number(r.dispPct || 0) * 100, 1)}%</span>
        </div>
      `).join("");
    }
  }

  const peak = rows[0] || null;
  if (app.dom.feaRiskReason) {
    app.dom.feaRiskReason.textContent = peak
      ? `${safeText(String(peak.section).toUpperCase())} dominates. Stress ${formatNum(peak.stressMpa, 1)} MPa, disp ${formatNum(peak.deformationMm, 3)} mm.`
      : "-";
  }
}

function renderFeaHistoryMarks(app) {
  if (!app.dom.feaHistoryList) return;
  const marks = Array.isArray(app.feaTeachingState?.historyMarks) ? app.feaTeachingState.historyMarks : [];
  if (!marks.length) {
    app.dom.feaHistoryList.innerHTML = '<p class="fea-empty">No keyframes yet.</p>';
    return;
  }

  const selected = Number.isFinite(app.feaTeachingState.selectedHistoryIndex)
    ? app.feaTeachingState.selectedHistoryIndex
    : (marks.length - 1);
  app.feaTeachingState.selectedHistoryIndex = selected;

  app.dom.feaHistoryList.innerHTML = marks.slice(-12).map((m, idx) => {
    const globalIdx = marks.length - Math.min(12, marks.length) + idx;
    const active = globalIdx === selected;
    return `
      <button type="button" class="fea-history-item${active ? " is-active" : ""}" data-mark-index="${globalIdx}">
        <span>T${globalIdx + 1} | ${safeText(m.risk || "-")}</span>
        <span>${formatNum(m.stress, 1)} MPa / ${formatNum(m.disp, 3)} mm</span>
      </button>
    `;
  }).join("");

  const items = Array.from(app.dom.feaHistoryList.querySelectorAll('[data-mark-index]'));
  items.forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.getAttribute("data-mark-index"));
      if (!Number.isFinite(idx)) return;
      replayFeaHistoryMarkRuntime(app, idx);
      if (typeof app.scheduleUiStateSave === "function") app.scheduleUiStateSave();
    });
  });
}

function updateFeaTeachingPanel(app, payload = {}) {
  const diagnostics = payload.diagnostics || {};
  const sectionRank = Array.isArray(diagnostics.sectionRank) ? diagnostics.sectionRank : [];
  updateFeaStepperUi(app);

  updateFeaSectionContrib(app, sectionRank);
  updateFeaLegendState(app, payload.hotspotLevel);
  renderFeaHistoryMarks(app);
}

function focusFeaPeakSection(app) {
  const section = safeText(app.feaTeachingState?.focusSection || "").toLowerCase();
  if (!section || !app.controls || !app.camera || !Array.isArray(app.partRecords)) {
    return;
  }

  const targets = app.partRecords.filter((r) => String(r?.part?.target || "").toLowerCase() === section);
  if (!targets.length) {
    return;
  }

  const Vec3 = app.camera.position?.constructor;
  if (!Vec3) {
    return;
  }
  const center = new Vec3(0, 0, 0);
  let count = 0;
  targets.forEach((r) => {
    if (!r?.mesh?.getWorldPosition) return;
    const p = r.mesh.getWorldPosition(new Vec3());
    center.add(p);
    count += 1;
  });
  if (!count) return;
  center.multiplyScalar(1 / count);

  const camTarget = center.clone().add(new Vec3(120, 90, 120));
  app.camera.position.lerp(camTarget, 0.35);
  app.controls.target.lerp(center, 0.45);
  app.controls.update();
}

export function toggleFeaAdvancedRuntime(app) {
  app.feaTeachingState.advancedExpanded = !Boolean(app.feaTeachingState.advancedExpanded);
  const expanded = app.feaTeachingState.advancedExpanded;
  if (app.dom.feaAdvancedPanel) {
    app.dom.feaAdvancedPanel.hidden = !expanded;
  }
  if (app.dom.btnToggleFeaAdvanced) {
    app.dom.btnToggleFeaAdvanced.textContent = expanded ? "收起高级" : "展开高级";
  }
}

export function runFeaStepRuntime(app, direction) {
  const order = ["setup", "compute", "observe", "explain"];
  const current = safeText(app.feaTeachingState.step || "setup");
  const idx = Math.max(0, order.indexOf(current));
  const next = order[Math.max(0, Math.min(order.length - 1, idx + direction))];
  app.feaTeachingState.step = next;

  const explainMap = {
    setup: "步骤 1：设置载荷与变形样式。",
    compute: "步骤 2：计算应力与位移场。",
    observe: "步骤 3：观察云图、热点与风险趋势。",
    explain: "步骤 4：解释为何该区段主导风险。"
  };

  const stepNames = { setup: "设置", compute: "计算", observe: "观察", explain: "解释" };
  setFeaNarrative(app, {
    conclusion: `有限元流程：${stepNames[next] || next}`,
    reason: explainMap[next],
    suggestion: "可用关键帧回放对比相邻状态。",
    explain: explainMap[next]
  });
  updateFeaStepperUi(app);
}

export function toggleFeaHotspotRuntime(app) {
  app.feaTeachingState.showHotspot = !Boolean(app.feaTeachingState.showHotspot);
  if (app.dom.btnFeaHotspot) {
    app.dom.btnFeaHotspot.textContent = app.feaTeachingState.showHotspot ? "开" : "关";
    app.dom.btnFeaHotspot.setAttribute("aria-pressed", app.feaTeachingState.showHotspot ? "true" : "false");
    app.dom.btnFeaHotspot.classList.toggle("is-on", app.feaTeachingState.showHotspot);
  }
}

function updateFeaDeformSegmentUi(app) {
  const style = app.feaTeachingState.deformStyle === "real" ? "real" : "exaggerated";
  const isReal = style === "real";
  if (app.dom.btnFeaDeformExaggerated) {
    app.dom.btnFeaDeformExaggerated.classList.toggle("is-active", !isReal);
    app.dom.btnFeaDeformExaggerated.setAttribute("aria-pressed", !isReal ? "true" : "false");
  }
  if (app.dom.btnFeaDeformReal) {
    app.dom.btnFeaDeformReal.classList.toggle("is-active", isReal);
    app.dom.btnFeaDeformReal.setAttribute("aria-pressed", isReal ? "true" : "false");
  }
  if (app.dom.btnFeaDeformStyle) {
    app.dom.btnFeaDeformStyle.textContent = isReal ? "变形：真实" : "变形：夸张";
  }
}

export function toggleFeaDeformStyleRuntime(app, mode) {
  if (mode === "real" || mode === "exaggerated") {
    app.feaTeachingState.deformStyle = mode;
  } else {
    app.feaTeachingState.deformStyle = app.feaTeachingState.deformStyle === "real" ? "exaggerated" : "real";
  }
  updateFeaDeformSegmentUi(app);
}

export function focusFeaRiskSectionRuntime(app) {
  focusFeaPeakSection(app);
  setFeaNarrative(app, {
    conclusion: "已聚焦风险区段",
    reason: `当前关注：${safeText(app.feaTeachingState.focusSection || "-").toUpperCase()}。`,
    suggestion: "观察热点附近的颜色与变形。",
    explain: "该视角有助于将指标变化与模型表现联系起来。"
  });
}

export function replayFeaHistoryMarkRuntime(app, index) {
  const marks = Array.isArray(app.feaTeachingState.historyMarks) ? app.feaTeachingState.historyMarks : [];
  if (!Number.isFinite(index) || index < 0 || index >= marks.length) {
    return;
  }

  const mark = marks[index];
  app.feaTeachingState.selectedHistoryIndex = index;
  app.fea.load = Number(mark.load);
  app.fea.exaggeration = Number(mark.exaggeration);
  if (app.dom.feaLoad) app.dom.feaLoad.value = String(app.fea.load);
  if (app.dom.feaExaggeration) app.dom.feaExaggeration.value = String(app.fea.exaggeration);
  app.refreshFeaTexts();

  setFeaNarrative(app, {
    conclusion: `回放关键帧 T${index + 1}`,
    reason: `应力 ${formatNum(mark.stress, 1)} MPa，位移 ${formatNum(mark.disp, 3)} mm，风险 ${safeText(mark.risk)}。`,
    suggestion: "与相邻关键帧对比，理解趋势变化。",
    explain: safeText(mark.diagnostics?.riskReason || "趋势回放。")
  });

  app.updateFeaVisual(performance.now());
}

export function refreshFeaTeachingUiRuntime(app) {
  const expanded = Boolean(app.feaTeachingState?.advancedExpanded);
  if (app.dom.feaAdvancedPanel) app.dom.feaAdvancedPanel.hidden = !expanded;
  if (app.dom.btnToggleFeaAdvanced) app.dom.btnToggleFeaAdvanced.textContent = expanded ? "收起高级" : "展开高级";

  if (app.dom.btnFeaHotspot) {
    app.dom.btnFeaHotspot.textContent = app.feaTeachingState.showHotspot ? "开" : "关";
    app.dom.btnFeaHotspot.setAttribute("aria-pressed", app.feaTeachingState.showHotspot ? "true" : "false");
    app.dom.btnFeaHotspot.classList.toggle("is-on", app.feaTeachingState.showHotspot);
  }
  updateFeaDeformSegmentUi(app);

  updateFeaTeachingPanel(app, {});
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
  app.feaTeachingState.step = "compute";
  if (app.dom.modeText) {
    app.dom.modeText.textContent = "有限元演示";
  }
  updateFeaStepperUi(app);
  setFeaNarrative(app, {
    conclusion: "仿真运行中",
    reason: "正在按当前载荷计算应力与位移场。",
    suggestion: "进入「观察」步骤查看热点与趋势变化。",
    explain: "结合回放与风险聚焦，将数值变化与云图/变形对应理解。"
  });
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
    },
    feaTeachingState: app.feaTeachingState
  });

  app.lastFeaUpdate = result.lastFeaUpdate;
  app.lastHistoryPush = result.lastHistoryPush;

  if (result.snapshot) {
    app.feaTeachingState.focusSection = safeText(result.snapshot?.diagnostics?.peakSection || app.feaTeachingState.focusSection || "j2").toLowerCase();
    app.feaTeachingState.lastDiagnostics = result.snapshot?.diagnostics || null;
    updateFeaTeachingPanel(app, {
      diagnostics: result.snapshot?.diagnostics || null,
      hotspotLevel: result.snapshot?.hotspotLevel || ""
    });
  }

  if (result.historyPushed) {
    app.feaHistory.push({
      stress: app.fea.maxStress,
      disp: app.fea.maxDisp
    });
    if (app.feaHistory.length > 120) {
      app.feaHistory.shift();
    }

    if (result.snapshot) {
      app.feaTeachingState.historyMarks.push(result.snapshot);
      if (app.feaTeachingState.historyMarks.length > 120) {
        app.feaTeachingState.historyMarks.shift();
      }
      app.feaTeachingState.selectedHistoryIndex = app.feaTeachingState.historyMarks.length - 1;
    }

    drawFeaChartCore(app.dom.chart, app.feaHistory, app.feaTeachingState.selectedHistoryIndex);
    renderFeaHistoryMarks(app);
  }
}

export function prepareKinematicsTourFromLessonRuntime(app, lessonIndex = 2, deps) {
  const { toFiniteNumber } = deps;
  app.setTeachingStage("kinematics");
  app.setKinematicsMode("ik");
  const lessons = Array.isArray(app.config?.lessons) ? app.config.lessons : [];
  const lesson = lessons[lessonIndex];
  if (lesson?.target) {
    if (app.dom.ikX) app.dom.ikX.value = String(toFiniteNumber(lesson.target.x, 195));
    if (app.dom.ikY) app.dom.ikY.value = String(toFiniteNumber(lesson.target.y, -62));
    if (app.dom.ikZ) app.dom.ikZ.value = String(toFiniteNumber(lesson.target.z, 205));
  }
  app.setKinematicsStep("input");
  app.updateKinematicsReadout({ step: "input" });
  if (app.dom.kinExplainText) {
    app.dom.kinExplainText.textContent = "步骤 1：输入 L3 课时目标点，准备执行逆解。";
  }
}

export function runKinematicsTeachingSequenceRuntime(app) {
  const order = ["input", "reachable", "solve"];
  for (const step of order) {
    app.setKinematicsStep(step);
  }
  const explainMap = {
    input: "步骤 1：已确认目标点。",
    reachable: "步骤 2：检查目标是否在可达工作空间内。",
    solve: "步骤 3：准备执行逆解并应用关节角。"
  };
  if (app.dom.kinExplainText) {
    app.dom.kinExplainText.textContent = explainMap.solve;
  }
}

export function runFeaTeachingSequenceRuntime(app, lessonIndex = 3) {
  app.setTeachingStage("fea");
  app.applyLesson(lessonIndex, true);
  app.feaTeachingState.step = "setup";
  updateFeaStepperUi(app);
  setFeaNarrative(app, {
    conclusion: "已载入 L4 极限工况",
    reason: "高载荷姿态已应用，可进入计算与观察步骤。",
    suggestion: "点击「运行有限元演示」查看云图。",
    explain: "步骤 1：设置载荷与变形样式。"
  });
}

export function advanceFeaTourToComputeRuntime(app) {
  app.feaTeachingState.step = "compute";
  updateFeaStepperUi(app);
  setFeaNarrative(app, {
    conclusion: "进入计算步骤",
    reason: "步骤 2：将按当前载荷计算应力与位移场。",
    suggestion: "运行演示以生成云图与指标。",
    explain: "步骤 2：计算应力与位移场。"
  });
}
