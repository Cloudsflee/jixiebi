import { drawFeaChart } from "./teaching_fea_runtime.js";

function safeText(v) {
  return String(v ?? "");
}

function tourDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
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

function maybeAppendOptimizationNarrative(app, text) {
  const narrative = String(app.config?.energyCalibration?.optimizationNarrative || "").trim();
  if (!narrative) return text;
  const load = Number(app.fea?.load) || 0;
  const showHint =
    app.fea?.loadScenario === "limit" ||
    load >= 80 ||
    app.fea?.materialPreset === "lightweight";
  if (!showHint || String(text || "").includes(narrative)) {
    return text;
  }
  return `${text} ${narrative}`;
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
    const diag = app.feaTeachingState?.lastDiagnostics;
    const baseReason = diag?.riskReason
      || (peak
        ? `${safeText(String(peak.section).toUpperCase())} 区段应力 ${formatNum(peak.stressMpa, 1)} MPa。`
        : "-");
    app.dom.feaRiskReason.textContent = maybeAppendOptimizationNarrative(app, baseReason);
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

function getFeaInputPresets(app) {
  return app.config?.feaInputPresets || {};
}

function findMaterialPreset(presets, id) {
  const list = Array.isArray(presets?.materialPresets) ? presets.materialPresets : [];
  return list.find((p) => p.id === id) || list[0] || null;
}

function findLoadDirection(presets, id) {
  const list = Array.isArray(presets?.loadDirections) ? presets.loadDirections : [];
  return list.find((d) => d.id === id) || list[0] || null;
}

function findLoadScenario(presets, id) {
  const list = Array.isArray(presets?.loadScenarios) ? presets.loadScenarios : [];
  return list.find((s) => s.id === id) || null;
}

function findListPreset(list, id) {
  const arr = Array.isArray(list) ? list : [];
  return arr.find((p) => p.id === id) || arr[0] || null;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function computeFeaBasePayloadNewtonRuntime(app) {
  const presets = getFeaInputPresets(app);
  const pm = presets.payloadMass || {};
  const loadFactor = Math.max(0, Number(app.fea?.load) || 0) / 100;
  const massKg = clamp(
    Number(app.fea?.payloadMassKg) || pm.defaultKg || 0.5,
    pm.minKg ?? 0.1,
    pm.maxKg ?? 2
  );
  const ratedKg = Math.max(0.1, Number(pm.ratedKg) || 0.5);
  const baseN = Math.max(1, Number(pm.baseNewtonAtRated) || 12);
  return loadFactor * baseN * (massKg / ratedKg);
}

export function buildFeaAnalysisContextRuntime(app) {
  const presets = getFeaInputPresets(app);
  const matPreset = findMaterialPreset(presets, app.fea?.materialPreset || "al6061");
  const dir = findLoadDirection(presets, app.fea?.loadDirection || "gravity");
  const loadPoint = findListPreset(presets.loadPoints, app.fea?.loadPoint || "tip");
  const loadType = findListPreset(presets.loadTypes, app.fea?.loadType || "steady");
  const sectionPreset = findListPreset(presets.sectionPresets, app.fea?.sectionPreset || "standard");
  const constraint = findListPreset(presets.constraintModes, app.fea?.constraintMode || "fixed");
  const dynamic = findListPreset(presets.dynamicModes, app.fea?.dynamicMode || "static");
  const temperature = findListPreset(presets.temperaturePresets, app.fea?.temperaturePreset || "ambient");
  const baseMat = app.config?.feaMaterial || {};
  const yieldFactor = Math.max(0.5, Number(temperature?.yieldFactor) || 1);
  const material = {
    ...baseMat,
    yieldStressMpa: (matPreset?.yieldStressMpa ?? baseMat.yieldStressMpa) * yieldFactor,
    sectionModulusScale: matPreset?.sectionModulusScale ?? baseMat.sectionModulusScale ?? 1
  };
  const sectionScales = sectionPreset?.scales && typeof sectionPreset.scales === "object"
    ? sectionPreset.scales
    : { j2: 1, j3: 1, j4: 1 };
  const payloadNewton = computeFeaBasePayloadNewtonRuntime(app);
  const effectivePayloadNewton = payloadNewton
    * (Number(dir?.momentFactor) || 1)
    * (Number(loadType?.impactFactor) || 1);
  return {
    material,
    energyWeights: app.config?.energyCalibration?.sectionLoadWeights || {},
    loadDirectionFactor: Number(dir?.momentFactor) || 1,
    impactFactor: Number(loadType?.impactFactor) || 1,
    momentLeverFactor: Number(loadPoint?.momentLeverFactor) || 1,
    constraintFactor: Number(constraint?.constraintFactor) || 1,
    sectionScales,
    dynamicGain: Number(dynamic?.dynamicGain),
    payloadNewton,
    effectivePayloadNewton,
    materialPresetId: matPreset?.id || "al6061",
    loadDirectionId: dir?.id || "gravity",
    loadPointId: loadPoint?.id || "tip",
    loadTypeId: loadType?.id || "steady",
    sectionPresetId: sectionPreset?.id || "standard",
    constraintModeId: constraint?.id || "fixed",
    dynamicModeId: dynamic?.id || "static",
    temperaturePresetId: temperature?.id || "ambient",
    payloadMassKg: Number(app.fea?.payloadMassKg) || presets.payloadMass?.defaultKg || 0.5
  };
}

function syncFeaFromUi(app) {
  if (app.dom.feaPayloadMass) {
    app.fea.payloadMassKg = Number(app.dom.feaPayloadMass.value);
  }
}

function feaInputChanged(app) {
  syncFeaFromUi(app);
  refreshFeaInputUiRuntime(app);
  app.fea.enabled = true;
  app.updateFeaVisual(performance.now());
  if (typeof app.scheduleUiStateSave === "function") {
    app.scheduleUiStateSave();
  }
}

export function setFeaPayloadMassRuntime(app, massKg) {
  const presets = getFeaInputPresets(app);
  const pm = presets.payloadMass || {};
  app.fea.payloadMassKg = clamp(Number(massKg), pm.minKg ?? 0.1, pm.maxKg ?? 2);
  if (app.dom.feaPayloadMass) {
    app.dom.feaPayloadMass.value = String(app.fea.payloadMassKg);
  }
  feaInputChanged(app);
}

export function setFeaSegmentPresetRuntime(app, field, presetId) {
  app.fea[field] = String(presetId || "");
  feaInputChanged(app);
}

function buildSegmentRow(app, container, list, field, dataAttr, activeId) {
  if (!container) return;
  container.innerHTML = list.map((item) =>
    `<button type="button" class="fea-seg-btn${activeId === item.id ? " is-active" : ""}" data-${dataAttr}="${safeText(item.id)}" title="${safeText(item.hint || "")}" aria-pressed="${activeId === item.id ? "true" : "false"}">${safeText(item.label)}</button>`
  ).join("");
  container.querySelectorAll(`[data-${dataAttr}]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      setFeaSegmentPresetRuntime(app, field, btn.getAttribute(`data-${dataAttr}`));
    });
  });
}

export function updateFeaInputSummaryRuntime(app) {
  if (!app.dom.feaInputSummary) return;
  const ctx = app.feaTeachingState?.analysisContext || buildFeaAnalysisContextRuntime(app);
  const n = formatNum(ctx.effectivePayloadNewton ?? ctx.payloadNewton, 1);
  const mass = formatNum(ctx.payloadMassKg, 1);
  app.dom.feaInputSummary.textContent =
    `等效载荷 ≈ ${n} N（${mass} kg × ${app.fea.load}% × 方向/冲击）· 截面 ${ctx.sectionPresetId || "-"} · ${ctx.dynamicModeId || "static"} · ${ctx.temperaturePresetId || "ambient"}`;
}

export function updateFeaPoseSummaryRuntime(app) {
  if (!app.dom.feaPoseSummary) return;
  const j2 = Number(app.jointAngles?.J2 || 0);
  const j3 = Number(app.jointAngles?.J3 || 0);
  const j4 = Number(app.jointAngles?.J4 || 0);
  const src = app.fea?.poseSource || "lesson:0";
  const presets = getFeaInputPresets(app);
  const poseList = Array.isArray(presets.poseSources) ? presets.poseSources : [];
  const label = poseList.find((p) => p.id === src)?.label || src;
  app.dom.feaPoseSummary.textContent =
    `当前姿态（${label}）：J2=${j2.toFixed(1)}° J3=${j3.toFixed(1)}° J4=${j4.toFixed(1)}°`;
}

export function applyFeaPoseSourceRuntime(app, poseSource) {
  const src = String(poseSource || "lesson:0");
  app.fea.poseSource = src;
  if (app.dom.feaPoseSource) {
    app.dom.feaPoseSource.value = src;
  }
  if (src === "twin") {
    updateFeaPoseSummaryRuntime(app);
    app.fea.enabled = true;
    app.updateFeaVisual(performance.now());
    if (typeof app.scheduleUiStateSave === "function") {
      app.scheduleUiStateSave();
    }
    return;
  }
  const match = /^lesson:(\d+)$/.exec(src);
  if (match) {
    const idx = Number(match[1]);
    if (Number.isFinite(idx)) {
      app.applyLesson(idx, true);
    }
  }
  updateFeaPoseSummaryRuntime(app);
  app.fea.enabled = true;
  app.updateFeaVisual(performance.now());
  if (typeof app.scheduleUiStateSave === "function") {
    app.scheduleUiStateSave();
  }
}

export function applyFeaLoadScenarioRuntime(app, scenarioId) {
  const presets = getFeaInputPresets(app);
  const scenario = findLoadScenario(presets, scenarioId);
  if (!scenario) return;
  app.fea.loadScenario = scenario.id;
  app.fea.load = Number(scenario.loadPercent);
  if (app.dom.feaLoad) app.dom.feaLoad.value = String(app.fea.load);
  if (Number.isFinite(scenario.payloadMassKg)) {
    app.fea.payloadMassKg = Number(scenario.payloadMassKg);
    if (app.dom.feaPayloadMass) {
      app.dom.feaPayloadMass.value = String(app.fea.payloadMassKg);
    }
  }
  refreshFeaInputUiRuntime(app);
  app.fea.enabled = true;
  app.updateFeaVisual(performance.now());
  if (typeof app.scheduleUiStateSave === "function") {
    app.scheduleUiStateSave();
  }
}

export function setFeaLoadDirectionRuntime(app, directionId) {
  app.fea.loadDirection = String(directionId || "gravity");
  refreshFeaInputUiRuntime(app);
  app.fea.enabled = true;
  app.updateFeaVisual(performance.now());
  if (typeof app.scheduleUiStateSave === "function") {
    app.scheduleUiStateSave();
  }
}

export function setFeaMaterialPresetRuntime(app, presetId) {
  app.fea.materialPreset = String(presetId || "al6061");
  if (app.dom.feaMaterialPreset) {
    app.dom.feaMaterialPreset.value = app.fea.materialPreset;
  }
  refreshFeaInputUiRuntime(app);
  app.fea.enabled = true;
  app.updateFeaVisual(performance.now());
  if (typeof app.scheduleUiStateSave === "function") {
    app.scheduleUiStateSave();
  }
}

export function applyFeaLabCaseInputsRuntime(app, labCase) {
  if (!labCase) return;
  if (labCase.poseSource) {
    applyFeaPoseSourceRuntime(app, labCase.poseSource);
  } else if (Number.isFinite(labCase.lessonIndex)) {
    applyFeaPoseSourceRuntime(app, `lesson:${labCase.lessonIndex}`);
  }
  if (labCase.loadDirection) {
    setFeaLoadDirectionRuntime(app, labCase.loadDirection);
  }
  if (labCase.materialPreset) {
    setFeaMaterialPresetRuntime(app, labCase.materialPreset);
  }
  if (labCase.loadScenario) {
    applyFeaLoadScenarioRuntime(app, labCase.loadScenario);
  } else if (Number.isFinite(labCase.loadPercent)) {
    app.fea.load = Number(labCase.loadPercent);
    if (app.dom.feaLoad) app.dom.feaLoad.value = String(app.fea.load);
  }
  if (Number.isFinite(labCase.exaggeration)) {
    app.fea.exaggeration = Number(labCase.exaggeration);
    if (app.dom.feaExaggeration) app.dom.feaExaggeration.value = String(app.fea.exaggeration);
  }
  if (Number.isFinite(labCase.payloadMassKg)) {
    setFeaPayloadMassRuntime(app, labCase.payloadMassKg);
  }
  for (const field of ["loadPoint", "loadType", "sectionPreset", "constraintMode", "dynamicMode", "temperaturePreset"]) {
    if (labCase[field]) {
      app.fea[field] = String(labCase[field]);
    }
  }
  refreshFeaInputUiRuntime(app);
}

export function buildFeaInputControlsRuntime(app) {
  const presets = getFeaInputPresets(app);

  if (app.dom.feaPoseSource) {
    const poses = Array.isArray(presets.poseSources) ? presets.poseSources : [];
    app.dom.feaPoseSource.innerHTML = poses.map((p) =>
      `<option value="${safeText(p.id)}">${safeText(p.label)}</option>`
    ).join("");
    app.dom.feaPoseSource.value = app.fea.poseSource || "lesson:0";
  }

  if (app.dom.feaLoadScenarioRow) {
    const scenarios = Array.isArray(presets.loadScenarios) ? presets.loadScenarios : [];
    app.dom.feaLoadScenarioRow.innerHTML = scenarios.map((s) =>
      `<button type="button" class="btn fea-preset-btn${app.fea.loadScenario === s.id ? " is-active" : ""}" data-fea-scenario="${safeText(s.id)}" title="${safeText(s.hint || "")}">${safeText(s.label)}</button>`
    ).join("");
    app.dom.feaLoadScenarioRow.querySelectorAll("[data-fea-scenario]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyFeaLoadScenarioRuntime(app, btn.getAttribute("data-fea-scenario"));
      });
    });
  }

  if (app.dom.feaLoadDirectionRow) {
    const dirs = Array.isArray(presets.loadDirections) ? presets.loadDirections : [];
    app.dom.feaLoadDirectionRow.innerHTML = dirs.map((d) =>
      `<button type="button" class="fea-seg-btn${app.fea.loadDirection === d.id ? " is-active" : ""}" data-fea-direction="${safeText(d.id)}" aria-pressed="${app.fea.loadDirection === d.id ? "true" : "false"}">${safeText(d.label)}</button>`
    ).join("");
    app.dom.feaLoadDirectionRow.querySelectorAll("[data-fea-direction]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setFeaLoadDirectionRuntime(app, btn.getAttribute("data-fea-direction"));
      });
    });
  }

  if (app.dom.feaMaterialPreset) {
    const mats = Array.isArray(presets.materialPresets) ? presets.materialPresets : [];
    app.dom.feaMaterialPreset.innerHTML = mats.map((m) =>
      `<option value="${safeText(m.id)}">${safeText(m.label)}</option>`
    ).join("");
    app.dom.feaMaterialPreset.value = app.fea.materialPreset || "al6061";
  }

  const pm = presets.payloadMass || {};
  if (app.dom.feaPayloadMass) {
    app.dom.feaPayloadMass.min = String(pm.minKg ?? 0.1);
    app.dom.feaPayloadMass.max = String(pm.maxKg ?? 2);
    app.dom.feaPayloadMass.step = String(pm.stepKg ?? 0.1);
    app.dom.feaPayloadMass.value = String(app.fea.payloadMassKg ?? pm.defaultKg ?? 0.5);
  }

  buildSegmentRow(app, app.dom.feaLoadPointRow, presets.loadPoints, "loadPoint", "fea-load-point", app.fea.loadPoint || "tip");
  buildSegmentRow(app, app.dom.feaLoadTypeRow, presets.loadTypes, "loadType", "fea-load-type", app.fea.loadType || "steady");
  buildSegmentRow(app, app.dom.feaSectionPresetRow, presets.sectionPresets, "sectionPreset", "fea-section-preset", app.fea.sectionPreset || "standard");
  buildSegmentRow(app, app.dom.feaConstraintModeRow, presets.constraintModes, "constraintMode", "fea-constraint-mode", app.fea.constraintMode || "fixed");
  buildSegmentRow(app, app.dom.feaDynamicModeRow, presets.dynamicModes, "dynamicMode", "fea-dynamic-mode", app.fea.dynamicMode || "static");
  buildSegmentRow(app, app.dom.feaTemperatureRow, presets.temperaturePresets, "temperaturePreset", "fea-temperature", app.fea.temperaturePreset || "ambient");
}

export function refreshFeaInputUiRuntime(app) {
  app.feaTeachingState.analysisContext = buildFeaAnalysisContextRuntime(app);
  if (typeof app.resolveDemoFeaModel === "function") {
    app.demoFeaModel = app.resolveDemoFeaModel();
  }
  if (app.dom.feaLoadScenarioRow) {
    const scenarios = Array.isArray(getFeaInputPresets(app).loadScenarios)
      ? getFeaInputPresets(app).loadScenarios
      : [];
    app.dom.feaLoadScenarioRow.querySelectorAll("[data-fea-scenario]").forEach((btn) => {
      const id = btn.getAttribute("data-fea-scenario");
      const active = id === app.fea.loadScenario;
      btn.classList.toggle("is-active", active);
    });
  }
  if (app.dom.feaLoadDirectionRow) {
    app.dom.feaLoadDirectionRow.querySelectorAll("[data-fea-direction]").forEach((btn) => {
      const id = btn.getAttribute("data-fea-direction");
      const active = id === app.fea.loadDirection;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  const segMap = [
    ["feaLoadPointRow", "loadPoint", "fea-load-point"],
    ["feaLoadTypeRow", "loadType", "fea-load-type"],
    ["feaSectionPresetRow", "sectionPreset", "fea-section-preset"],
    ["feaConstraintModeRow", "constraintMode", "fea-constraint-mode"],
    ["feaDynamicModeRow", "dynamicMode", "fea-dynamic-mode"],
    ["feaTemperatureRow", "temperaturePreset", "fea-temperature"]
  ];
  for (const [domKey, field, attr] of segMap) {
    const row = app.dom[domKey];
    if (!row) continue;
    row.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
      const id = btn.getAttribute(`data-${attr}`);
      const active = id === app.fea[field];
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  if (app.dom.feaPayloadMass) {
    app.dom.feaPayloadMass.value = String(app.fea.payloadMassKg ?? 0.5);
  }
  updateFeaPoseSummaryRuntime(app);
  updateFeaInputSummaryRuntime(app);
  refreshFeaTextsRuntime(app);
}

export function refreshFeaTextsRuntime(app) {
  if (app.dom.feaLoadText) {
    app.dom.feaLoadText.textContent = `${app.fea.load}%`;
  }
  if (app.dom.feaExaggerationText) {
    app.dom.feaExaggerationText.textContent = `${app.fea.exaggeration}%`;
  }
  if (app.dom.feaPayloadMassText) {
    app.dom.feaPayloadMassText.textContent = `${formatNum(app.fea.payloadMassKg, 1)} kg`;
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
  app.feaTeachingState.analysisContext = buildFeaAnalysisContextRuntime(app);
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
  // 教学引导仅高亮步骤条，不调用 runCaseDemo（与侧栏「一键教学演示」解耦）
  const order = ["input", "reachable", "solve"];
  for (const step of order) {
    app.setKinematicsStep(step);
    app.updateKinematicsReadout({ step });
  }
  if (app.dom.kinExplainText) {
    app.dom.kinExplainText.textContent = "已依次高亮「输入 → 可达性 → 求解」；下一步将执行逆解。";
  }
}

export function runFeaTeachingSequenceRuntime(app, lessonIndex = 3) {
  // 教学引导仅载入工况与设置步，不播放 F3 完整 demoScript
  app.setTeachingStage("fea");
  app.fea.enabled = true;
  app.fea.running = true;
  const cases = Array.isArray(app.config?.feaLabCases) ? app.config.feaLabCases : [];
  const byLesson = cases.find((c) => Number(c.lessonIndex) === Number(lessonIndex));
  const labCase = byLesson || cases.find((c) => c.id === "F3") || cases[0];
  if (labCase) {
    applyFeaLabCaseInputsRuntime(app, labCase);
  } else {
    app.applyLesson(lessonIndex, true);
  }
  app.feaTeachingState.step = "setup";
  updateFeaStepperUi(app);
  setFeaNarrative(app, {
    conclusion: "已载入极限工况输入",
    reason: "姿态与载荷已写入面板，尚未自动运行分析。",
    suggestion: "按引导继续，或手动点击「运行有限元演示」。",
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

export function appendFeaChartPointRuntime(app) {
  if (!Array.isArray(app.feaHistory)) {
    app.feaHistory = [];
  }
  app.feaHistory.push({
    stress: Number(app.fea.maxStress) || 0,
    disp: Number(app.fea.maxDisp) || 0
  });
  if (app.feaHistory.length > 120) {
    app.feaHistory.shift();
  }
  const idx = app.feaHistory.length - 1;
  if (app.feaTeachingState) {
    app.feaTeachingState.selectedHistoryIndex = idx;
  }
  if (app.dom?.chart) {
    drawFeaChart(
      app.dom.chart,
      app.feaHistory,
      app.feaTeachingState?.selectedHistoryIndex ?? idx
    );
  }
  renderFeaHistoryMarks(app);
}

export function syncFeaVisualAndChartRuntime(app, { pushChart = true } = {}) {
  app.fea.enabled = true;
  app.updateFeaVisual(performance.now());
  if (pushChart) {
    appendFeaChartPointRuntime(app);
  }
}

export function describeFeaLoadChangeRuntime(app) {
  const load = Number(app.fea?.load) || 0;
  const stress = Number(app.fea?.maxStress) || 0;
  const disp = Number(app.fea?.maxDisp) || 0;
  return `当前载荷 ${load}%：应力约 ${stress.toFixed(1)} MPa，位移约 ${disp.toFixed(3)} mm。载荷增大 → 等效弯矩增大 → 趋势点上移、云图更易偏暖色。`;
}

export function feaTourOnLoadInteractRuntime(app) {
  syncFeaVisualAndChartRuntime(app, { pushChart: true });
  if (app.dom.feaExplainText) {
    app.dom.feaExplainText.textContent = describeFeaLoadChangeRuntime(app);
  }
}

export function feaTourRatedSetupRuntime(app) {
  app.setTeachingStage("fea");
  app.fea.enabled = true;
  app.fea.running = false;
  const cases = Array.isArray(app.config?.feaLabCases) ? app.config.feaLabCases : [];
  const labCase = cases.find((c) => c.id === "F2") || cases[0];
  if (labCase) {
    applyFeaLabCaseInputsRuntime(app, labCase);
  }
  app.feaTeachingState.step = "setup";
  updateFeaStepperUi(app);
  setFeaNarrative(app, {
    conclusion: "已载入额定搬运工况",
    reason: "姿态与 55% 额定载荷已写入面板；姿态来源可与 01/02 孪生联动。",
    suggestion: "继续了解载荷预设、方向与材料参数。",
    explain: "步骤 1：工况输入 — 姿态与几何。"
  });
}

export function feaTourLightScenarioRuntime(app) {
  applyFeaLoadScenarioRuntime(app, "light");
  setFeaNarrative(app, {
    conclusion: "轻载工况 20%",
    reason: "任务阶段预设会同步载荷强度与末端质量，便于课堂快速切换。",
    explain: "轻载适合观察整体刚度与低应力分布。"
  });
}

export async function feaTourSeedChartRuntime(app) {
  app.setTeachingStage("fea");
  app.fea.enabled = true;
  app.fea.running = true;
  syncFeaVisualAndChartRuntime(app, { pushChart: true });
  await tourDelay(500);
  syncFeaVisualAndChartRuntime(app, { pushChart: true });
  setFeaNarrative(app, {
    conclusion: "趋势图已建立基线",
    reason: "橙色曲线为位移 (mm)，深色为应力 (MPa)；黄/红虚线为预警与危险阈值。",
    suggestion: "下一步将自动对比轻载、额定、极限三档载荷。"
  });
}

export async function feaTourLoadContrastRuntime(app) {
  app.setTeachingStage("fea");
  app.fea.enabled = true;
  app.fea.running = true;
  const stages = [
    {
      load: 25,
      scenario: "light",
      explain: "轻载 25%：等效弯矩小，应力/位移点处于曲线低位，云图偏冷色。"
    },
    {
      load: 55,
      scenario: "rated",
      explain: "额定 55%：J2 承担主要弯矩，曲线明显抬升，对应日常搬运任务。"
    },
    {
      load: 86,
      scenario: "limit",
      explain: "极限 86%：应力逼近预警虚线，安全系数下降，云图热点偏红。"
    }
  ];
  for (const s of stages) {
    applyFeaLoadScenarioRuntime(app, s.scenario);
    app.fea.load = s.load;
    if (app.dom.feaLoad) {
      app.dom.feaLoad.value = String(s.load);
    }
    refreshFeaInputUiRuntime(app);
    syncFeaVisualAndChartRuntime(app, { pushChart: true });
    setFeaNarrative(app, {
      conclusion: `当前载荷 ${s.load}%`,
      reason: s.explain,
      suggestion: "载荷越高，趋势点与核心指标同步上移。"
    });
    await tourDelay(900);
  }
}

export function feaTourShowDirectionSideRuntime(app) {
  setFeaLoadDirectionRuntime(app, "lateral");
  syncFeaVisualAndChartRuntime(app, { pushChart: true });
  setFeaNarrative(app, {
    conclusion: "已切换为侧向载荷",
    reason: "侧向受力增大弯矩臂（momentFactor≈1.12），同等载荷%下应力略高于重力主导。",
    suggestion: "可对比「组合」方向观察弯扭组合效应。"
  });
}

export function feaTourExaggerationDemoRuntime(app) {
  const stressBefore = Number(app.fea?.maxStress) || 0;
  const historyLenBefore = app.feaHistory?.length || 0;
  if (app.dom.feaExaggeration) {
    app.fea.exaggeration = 180;
    app.dom.feaExaggeration.value = "180";
  }
  if (typeof app.refreshFeaTexts === "function") {
    app.refreshFeaTexts();
  }
  app.fea.enabled = true;
  app.updateFeaVisual(performance.now());
  const stressAfter = Number(app.fea?.maxStress) || 0;
  setFeaNarrative(app, {
    conclusion: "变形放大仅影响云图可见度",
    reason: `已将变形放大调至 180%：云图变形更明显，应力仍为 ${stressAfter.toFixed(1)} MPa（与调整前 ${stressBefore.toFixed(1)} MPa 一致）。`,
    suggestion: "趋势图点数未因该项增加，说明其不参与力学计算。"
  });
  if ((app.feaHistory?.length || 0) === historyLenBefore && app.dom.feaExplainText) {
    app.dom.feaExplainText.textContent += " 趋势曲线不因变形放大而改变。";
  }
}

export function expandFeaAdvancedRuntime(app) {
  if (!app.feaTeachingState.advancedExpanded) {
    toggleFeaAdvancedRuntime(app);
  }
}
