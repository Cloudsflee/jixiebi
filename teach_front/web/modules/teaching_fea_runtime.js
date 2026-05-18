import { clamp } from "./app_math.js";
import { evaluatePseudoFea } from "./demo_fea.js";

function toneFromRatio(ratio) {
  if (ratio < 0.5) return "low";
  if (ratio < 0.75) return "medium";
  if (ratio < 0.95) return "high";
  return "critical";
}

export function heatColor(t) {
  const x = clamp(t, 0, 1);
  const c = { r: 0, g: 0, b: 0 };
  if (x < 0.25) {
    const k = x / 0.25;
    c.r = 0.14 + 0.2 * k;
    c.g = 0.35 + 0.45 * k;
    c.b = 0.88 - 0.18 * k;
  } else if (x < 0.5) {
    const k = (x - 0.25) / 0.25;
    c.r = 0.34 + 0.2 * k;
    c.g = 0.8 + 0.1 * k;
    c.b = 0.7 - 0.3 * k;
  } else if (x < 0.75) {
    const k = (x - 0.5) / 0.25;
    c.r = 0.54 + 0.34 * k;
    c.g = 0.9 - 0.28 * k;
    c.b = 0.4 - 0.22 * k;
  } else {
    const k = (x - 0.75) / 0.25;
    c.r = 0.88 + 0.08 * k;
    c.g = 0.62 - 0.44 * k;
    c.b = 0.18 - 0.08 * k;
  }
  return c;
}

export function drawFeaChart(canvas, history = [], selectedIndex = -1) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
  const cssWidth = Math.max(240, Math.round(canvas.clientWidth || canvas.width || 420));
  const cssHeight = Math.max(140, Math.round(canvas.clientHeight || canvas.height || 210));
  const targetWidth = Math.round(cssWidth * dpr);
  const targetHeight = Math.round(cssHeight * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  // Draw in CSS pixel coordinates while keeping a high-resolution backing store.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const width = cssWidth;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#f7fbff");
  bg.addColorStop(1, "#ffffff");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const pad = { l: 42, r: 18, t: 16, b: 26 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const stressMax = 480;
  const dispMax = 1.2;

  ctx.strokeStyle = "#dbe6f2";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, w, h);

  for (let i = 1; i <= 3; i += 1) {
    const y = pad.t + (h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y + 0.5);
    ctx.lineTo(pad.l + w, y + 0.5);
    ctx.strokeStyle = "#e5edf6";
    ctx.stroke();
  }

  // Safety threshold lines
  const ratioWarn = 0.75;
  const ratioCrit = 0.95;
  const yWarn = pad.t + h * (1 - clamp((ratioWarn * 210) / stressMax, 0, 1));
  const yCrit = pad.t + h * (1 - clamp((ratioCrit * 210) / stressMax, 0, 1));

  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#d9841f";
  ctx.beginPath();
  ctx.moveTo(pad.l, yWarn);
  ctx.lineTo(pad.l + w, yWarn);
  ctx.stroke();
  ctx.strokeStyle = "#c92a2a";
  ctx.beginPath();
  ctx.moveTo(pad.l, yCrit);
  ctx.lineTo(pad.l + w, yCrit);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!history.length) {
    return;
  }

  const n = history.length;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#db5f15";
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const x = pad.l + (i / Math.max(1, n - 1)) * w;
    const y = pad.t + h * (1 - clamp(history[i].stress / stressMax, 0, 1));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.lineWidth = 2.3;
  ctx.strokeStyle = "#1f79cc";
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const x = pad.l + (i / Math.max(1, n - 1)) * w;
    const y = pad.t + h * (1 - clamp(history[i].disp / dispMax, 0, 1));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const peaks = [];
  for (let i = 1; i < n - 1; i += 1) {
    if (history[i].stress >= history[i - 1].stress && history[i].stress >= history[i + 1].stress) {
      peaks.push(i);
    }
  }
  const peakIdx = peaks.length ? peaks[peaks.length - 1] : n - 1;
  const stressY = pad.t + h * (1 - clamp(history[peakIdx].stress / stressMax, 0, 1));
  const peakX = pad.l + (peakIdx / Math.max(1, n - 1)) * w;

  ctx.fillStyle = "#db5f15";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(peakX, stressY, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < n) {
    const sx = pad.l + (selectedIndex / Math.max(1, n - 1)) * w;
    const selStressY = pad.t + h * (1 - clamp(history[selectedIndex].stress / stressMax, 0, 1));
    const selDispY = pad.t + h * (1 - clamp(history[selectedIndex].disp / dispMax, 0, 1));
    ctx.strokeStyle = "#0b4f85";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(sx, pad.t);
    ctx.lineTo(sx, pad.t + h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#db5f15";
    ctx.beginPath();
    ctx.arc(sx, selStressY, 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1f79cc";
    ctx.beginPath();
    ctx.arc(sx, selDispY, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function updateFeaVisualRuntime({
  nowMs,
  fea,
  lastFeaUpdate,
  lastHistoryPush,
  feaRecords,
  demoFeaModel,
  jointAngles,
  metricElements,
  feaTeachingState
}) {
  if (!fea || !fea.enabled) {
    return { lastFeaUpdate, lastHistoryPush, historyPushed: false, feaResult: null, snapshot: null };
  }
  if (nowMs - lastFeaUpdate < 45) {
    return { lastFeaUpdate, lastHistoryPush, historyPushed: false, feaResult: null, snapshot: null };
  }

  const nextLastFeaUpdate = nowMs;
  const t = nowMs * 0.001;
  const loadFactor = fea.load / 100;
  const exaggerationBase = fea.exaggeration / 100;
  const deformStyle = (feaTeachingState?.deformStyle === "real") ? "real" : "exaggerated";
  const exScale = deformStyle === "real" ? 0.42 : 1.0;
  const ex = exaggerationBase * exScale;
  const feaCtx = feaTeachingState?.analysisContext || {};
  const payloadNewton = Number.isFinite(feaCtx.payloadNewton)
    ? feaCtx.payloadNewton
    : Math.max(0, loadFactor) * 12;

  const feaResult = evaluatePseudoFea(demoFeaModel, {
    payloadNewton,
    jointDeg: {
      j1: Number(jointAngles?.J1 || 0),
      j2: Number(jointAngles?.J2 || 0),
      j3: Number(jointAngles?.J3 || 0),
      j4: Number(jointAngles?.J4 || 0)
    }
  }, {
    material: feaCtx.material || demoFeaModel?._feaMaterial || {},
    energyWeights: feaCtx.energyWeights || demoFeaModel?._energyWeights || {},
    loadDirectionFactor: feaCtx.loadDirectionFactor ?? demoFeaModel?._loadDirectionFactor ?? 1,
    impactFactor: feaCtx.impactFactor ?? 1,
    momentLeverFactor: feaCtx.momentLeverFactor ?? 1,
    constraintFactor: feaCtx.constraintFactor ?? 1,
    sectionScales: feaCtx.sectionScales || {},
    dynamicGain: feaCtx.dynamicGain
  });

  const peakSection = String(feaResult?.diagnostics?.peakSection || "j2");
  const showHotspot = feaTeachingState?.showHotspot !== false;

  const jFactor =
    0.4 +
    Math.abs(jointAngles?.J2 || 0) / 140 +
    Math.abs(jointAngles?.J3 || 0) / 160 +
    Math.abs(jointAngles?.J4 || 0) / 180;

  const pulseAmp = (feaTeachingState?.pulseEnabled === false || !fea.running) ? 0 : 0.34;
  const pulse = 0.66 + pulseAmp * Math.sin(t * 2.6);

  for (const record of feaRecords || []) {
    const { mesh, stressBasis, normals, originalPos, feaWeight } = record;
    const targetKey = String(record?.part?.target || "").trim().toLowerCase();
    const targetFea = feaResult?.byTarget?.[targetKey] || null;
    const targetHeat = clamp(Number(targetFea?.heatRatio ?? (0.25 + loadFactor * 0.6)), 0, 1);
    const targetDeformationMm = Math.max(0, Number(targetFea?.deformationMm || 0));
    const stressBias = (0.3 + 0.7 * targetHeat) * (0.45 + 0.55 * loadFactor);
    const dispGain = clamp(targetDeformationMm / 8, 0.25, 3.2);

    const posAttr = mesh.geometry.getAttribute("position");
    const colorAttr = mesh.geometry.getAttribute("color");
    const pos = posAttr.array;
    const col = colorAttr.array;

    const isPeakSection = targetKey === peakSection;

    for (let i = 0; i < stressBasis.length; i += 1) {
      const base = stressBasis[i] * stressBias * feaWeight * jFactor;
      const dynamic = fea.running ? 0.08 * Math.sin(t * 4 + i * 0.031) : 0;
      let stress = clamp(base + dynamic, 0, 1);
      const k = i * 3;

      if (showHotspot && isPeakSection && stress > 0.86) {
        stress = clamp(stress * 1.08 + 0.04, 0, 1);
      }

      const color = heatColor(stress);
      col[k] = color.r;
      col[k + 1] = color.g;
      col[k + 2] = color.b;

      if (showHotspot && isPeakSection && stress > 0.88) {
        col[k] = clamp(col[k] + 0.08, 0, 1);
        col[k + 1] = clamp(col[k + 1] - 0.06, 0, 1);
        col[k + 2] = clamp(col[k + 2] - 0.06, 0, 1);
      }

      const disp = stress * ex * pulse * dispGain;
      pos[k] = originalPos[k] + normals[k] * disp;
      pos[k + 1] = originalPos[k + 1] + normals[k + 1] * disp;
      pos[k + 2] = originalPos[k + 2] + normals[k + 2] * disp;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  const summary = feaResult?.summary || {};
  const maxRatio = Math.max(0, Number(summary.maxRatio || 0));
  fea.maxStress = Number(summary.maxStressMpa || 0);
  fea.maxDisp = Number(summary.totalDeformationMm || 0);
  fea.safetyFactor = clamp(maxRatio > 1e-9 ? 1 / maxRatio : 9.99, 0.55, 9.99);
  fea.risk =
    fea.safetyFactor > 2.2
      ? "LOW"
      : fea.safetyFactor > 1.4
        ? "MEDIUM"
        : fea.safetyFactor > 0.9
          ? "HIGH"
          : "CRITICAL";

  if (metricElements) {
    const { metricStress, metricDisp, metricSf, metricRisk } = metricElements;
    if (metricStress) metricStress.textContent = fea.maxStress.toFixed(1);
    if (metricDisp) metricDisp.textContent = fea.maxDisp.toFixed(3);
    if (metricSf) metricSf.textContent = fea.safetyFactor.toFixed(2);
    if (metricRisk) {
      metricRisk.textContent = fea.risk;
      metricRisk.classList.remove("risk-low", "risk-medium", "risk-high", "risk-critical");
      if (fea.risk === "LOW") metricRisk.classList.add("risk-low");
      else if (fea.risk === "MEDIUM") metricRisk.classList.add("risk-medium");
      else if (fea.risk === "HIGH") metricRisk.classList.add("risk-high");
      else metricRisk.classList.add("risk-critical");
    }
  }

  const snapshot = {
    ts: nowMs,
    stress: fea.maxStress,
    disp: fea.maxDisp,
    safetyFactor: fea.safetyFactor,
    risk: fea.risk,
    load: Number(fea.load),
    exaggeration: Number(fea.exaggeration),
    diagnostics: feaResult?.diagnostics || null,
    hotspotLevel: toneFromRatio(maxRatio)
  };

  let nextLastHistoryPush = lastHistoryPush;
  let historyPushed = false;
  if (nowMs - lastHistoryPush > 420) {
    nextLastHistoryPush = nowMs;
    historyPushed = true;
  }

  return {
    lastFeaUpdate: nextLastFeaUpdate,
    lastHistoryPush: nextLastHistoryPush,
    historyPushed,
    feaResult,
    snapshot
  };
}
