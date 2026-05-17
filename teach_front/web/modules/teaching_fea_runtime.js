import { clamp } from "./app_math.js";
import { evaluatePseudoFea } from "./demo_fea.js";

export function heatColor(t) {
  const x = clamp(t, 0, 1);
  const c = { r: 0, g: 0, b: 0 };
  if (x < 0.33) {
    const k = x / 0.33;
    c.r = 0.18 + 0.24 * k;
    c.g = 0.45 + 0.4 * k;
    c.b = 0.85 - 0.25 * k;
  } else if (x < 0.66) {
    const k = (x - 0.33) / 0.33;
    c.r = 0.42 + 0.5 * k;
    c.g = 0.86 - 0.18 * k;
    c.b = 0.62 - 0.38 * k;
  } else {
    const k = (x - 0.66) / 0.34;
    c.r = 0.92;
    c.g = 0.68 - 0.5 * k;
    c.b = 0.24 - 0.12 * k;
  }
  return c;
}

export function drawFeaChart(canvas, history = []) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#f7fbff";
  ctx.fillRect(0, 0, width, height);

  const pad = { l: 34, r: 12, t: 14, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  ctx.strokeStyle = "#d3dfec";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.l, pad.t, w, h);

  for (let i = 1; i <= 3; i += 1) {
    const y = pad.t + (h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
  }

  const stressMax = 480;
  const dispMax = 1.2;
  ctx.fillStyle = "#587797";
  ctx.font = "11px Segoe UI";
  ctx.fillText("Stress MPa", 4, 12);
  ctx.fillText("Disp mm", width - 56, 12);

  if (!history.length) {
    return;
  }

  const n = history.length;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#d9480f";
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const x = pad.l + (i / Math.max(1, n - 1)) * w;
    const y = pad.t + h * (1 - clamp(history[i].stress / stressMax, 0, 1));
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "#1c7ed6";
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const x = pad.l + (i / Math.max(1, n - 1)) * w;
    const y = pad.t + h * (1 - clamp(history[i].disp / dispMax, 0, 1));
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

export function updateFeaVisualRuntime({
  nowMs,
  fea,
  lastFeaUpdate,
  lastHistoryPush,
  feaRecords,
  demoFeaModel,
  jointAngles,
  metricElements
}) {
  if (!fea || !fea.enabled) {
    return { lastFeaUpdate, lastHistoryPush, historyPushed: false };
  }
  if (nowMs - lastFeaUpdate < 45) {
    return { lastFeaUpdate, lastHistoryPush, historyPushed: false };
  }

  const nextLastFeaUpdate = nowMs;
  const t = nowMs * 0.001;
  const loadFactor = fea.load / 100;
  const ex = fea.exaggeration / 100;
  const payloadNewton = Math.max(0, loadFactor) * 12;
  const feaResult = evaluatePseudoFea(demoFeaModel, {
    payloadNewton,
    jointDeg: {
      j1: Number(jointAngles?.J1 || 0),
      j2: Number(jointAngles?.J2 || 0),
      j3: Number(jointAngles?.J3 || 0),
      j4: Number(jointAngles?.J4 || 0)
    }
  });

  const jFactor =
    0.4 +
    Math.abs(jointAngles?.J2 || 0) / 140 +
    Math.abs(jointAngles?.J3 || 0) / 160 +
    Math.abs(jointAngles?.J4 || 0) / 180;
  const pulse = fea.running ? 0.66 + 0.34 * Math.sin(t * 2.6) : 1;

  for (const record of feaRecords || []) {
    const { mesh, stressBasis, normals, originalPos, feaWeight } = record;
    const targetKey = String(record?.part?.target || "").trim().toLowerCase();
    const targetFea = feaResult?.byTarget?.[targetKey] || null;
    const targetHeat = clamp(
      Number(targetFea?.heatRatio ?? (0.25 + loadFactor * 0.6)),
      0,
      1
    );
    const targetDeformationMm = Math.max(0, Number(targetFea?.deformationMm || 0));
    const stressBias = (0.3 + 0.7 * targetHeat) * (0.45 + 0.55 * loadFactor);
    const dispGain = clamp(targetDeformationMm / 8, 0.25, 3.2);
    const posAttr = mesh.geometry.getAttribute("position");
    const colorAttr = mesh.geometry.getAttribute("color");
    const pos = posAttr.array;
    const col = colorAttr.array;

    for (let i = 0; i < stressBasis.length; i += 1) {
      const base = stressBasis[i] * stressBias * feaWeight * jFactor;
      const dynamic = fea.running ? 0.08 * Math.sin(t * 4 + i * 0.031) : 0;
      const stress = clamp(base + dynamic, 0, 1);
      const color = heatColor(stress);
      const k = i * 3;
      col[k] = color.r;
      col[k + 1] = color.g;
      col[k + 2] = color.b;

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
    if (metricStress) metricStress.textContent = `${fea.maxStress.toFixed(1)} MPa`;
    if (metricDisp) metricDisp.textContent = `${fea.maxDisp.toFixed(3)} mm`;
    if (metricSf) metricSf.textContent = fea.safetyFactor.toFixed(2);
    if (metricRisk) {
      metricRisk.textContent = fea.risk;
      metricRisk.style.color =
        fea.risk === "LOW"
          ? "#3a8f46"
          : fea.risk === "MEDIUM"
            ? "#d9841f"
            : fea.risk === "HIGH"
              ? "#cf5f0b"
              : "#c92a2a";
    }
  }

  let nextLastHistoryPush = lastHistoryPush;
  let historyPushed = false;
  if (nowMs - lastHistoryPush > 420) {
    nextLastHistoryPush = nowMs;
    historyPushed = true;
  }

  return {
    lastFeaUpdate: nextLastFeaUpdate,
    lastHistoryPush: nextLastHistoryPush,
    historyPushed
  };
}
