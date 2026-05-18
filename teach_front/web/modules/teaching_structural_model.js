function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSection(raw = {}, defaults = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    leverMm: Math.max(1, toFinite(src.leverMm, defaults.leverMm || 100)),
    strengthArea: Math.max(1, toFinite(src.strengthArea, defaults.strengthArea || 70)),
    compliance: Math.max(0.0001, toFinite(src.compliance, defaults.compliance || 0.01))
  };
}

function normalizePseudoFeaModel(raw = {}) {
  const defaults = {
    yieldStressMpa: 210,
    dynamicGain: 0.35,
    payloadScale: 1,
    sections: {
      j2: { leverMm: 135, strengthArea: 90, compliance: 0.011 },
      j3: { leverMm: 145, strengthArea: 78, compliance: 0.014 },
      j4: { leverMm: 70, strengthArea: 64, compliance: 0.019 }
    }
  };
  const src = raw && typeof raw === "object" ? raw : {};
  const sectionsRaw = src.sections && typeof src.sections === "object" ? src.sections : {};
  return {
    yieldStressMpa: Math.max(1, toFinite(src.yieldStressMpa, defaults.yieldStressMpa)),
    dynamicGain: clamp(toFinite(src.dynamicGain, defaults.dynamicGain), 0, 2),
    payloadScale: Math.max(0, toFinite(src.payloadScale, defaults.payloadScale)),
    sections: {
      j2: normalizeSection(sectionsRaw.j2, defaults.sections.j2),
      j3: normalizeSection(sectionsRaw.j3, defaults.sections.j3),
      j4: normalizeSection(sectionsRaw.j4, defaults.sections.j4)
    }
  };
}

function toneFromRatio(ratio) {
  if (ratio < 0.5) return "low";
  if (ratio < 0.75) return "medium";
  if (ratio < 0.95) return "high";
  return "critical";
}

function sectionModulus(section, material) {
  const area = Math.max(1, toFinite(section.strengthArea, 70));
  const scale = Math.max(0.5, toFinite(material?.sectionModulusScale, 1));
  return area * scale;
}

function calcBeamNode(model, section, material, payloadN, angleDeg, loadWeight = 1) {
  const absAngle = Math.abs(toFinite(angleDeg, 0));
  const angleFactor = 1 + 0.65 * Math.sin((absAngle * Math.PI) / 180) ** 2;
  const lever = Math.max(1, toFinite(section.leverMm, 100));
  const w = Math.max(0.05, toFinite(loadWeight, 1));
  const moment = payloadN * lever * angleFactor * w * (1 + model.dynamicGain * 0.15);
  const wSec = sectionModulus(section, material);
  const stressMpa = moment / wSec;
  const yieldMpa = Math.max(1, toFinite(material?.yieldStressMpa, model.yieldStressMpa));
  const stressRatio = stressMpa / yieldMpa;
  const eGpa = Math.max(1, toFinite(material?.youngModulusGpa, 69));
  const compliance = Math.max(0.0001, toFinite(section.compliance, 0.012));
  const deformationMm = (payloadN * lever ** 2 * compliance * angleFactor * w) / (eGpa * 8);

  return {
    stressMpa,
    stressRatio,
    deformationMm,
    heatRatio: clamp(stressRatio, 0, 1)
  };
}

function buildDiagnostics(byTarget, summary, energyWeights = {}) {
  const entries = ["j2", "j3", "j4"].map((key) => {
    const node = byTarget[key] || {};
    return {
      section: key,
      stressMpa: toFinite(node.stressMpa, 0),
      deformationMm: toFinite(node.deformationMm, 0),
      ratio: toFinite(node.stressRatio, 0)
    };
  });

  const sorted = entries.slice().sort((a, b) => b.ratio - a.ratio);
  const peak = sorted[0] || { section: "j2", ratio: 0, stressMpa: 0, deformationMm: 0 };
  const hotspotLevel = toneFromRatio(peak.ratio);
  const wJ2 = toFinite(energyWeights.j2, 0.33);

  const riskReason = peak.ratio >= 0.95
    ? `${peak.section.toUpperCase()} 杆段接近屈服，需降载或优化结构。`
    : peak.ratio >= 0.75
      ? `${peak.section.toUpperCase()} 杆段应力主导（能耗标定权重 J2≈${(wJ2 * 100).toFixed(0)}%）。`
      : "载荷分布较均匀，结构余量充足。";

  const sectionRank = sorted.map((s, idx) => ({
    rank: idx + 1,
    section: s.section,
    stressMpa: s.stressMpa,
    deformationMm: s.deformationMm,
    ratio: s.ratio,
    stressPct: summary.maxStressMpa > 1e-9 ? s.stressMpa / summary.maxStressMpa : 0,
    dispPct: summary.totalDeformationMm > 1e-9 ? s.deformationMm / summary.totalDeformationMm : 0
  }));

  return {
    peakSection: peak.section,
    sectionRank,
    riskReason,
    hotspotLevel,
    modelLabel: "简化结构力学模型（教学用）"
  };
}

export function evaluateStructuralFea(modelInput = {}, input = {}, materialInput = {}, energyWeights = {}, options = {}) {
  const model = normalizePseudoFeaModel(modelInput);
  const material = materialInput && typeof materialInput === "object" ? materialInput : {};
  const dirFactor = Math.max(0.05, toFinite(options.loadDirectionFactor, 1));
  const payloadNewton = Math.max(0, toFinite(input.payloadNewton, 0)) * model.payloadScale * dirFactor;
  const joints = input.jointDeg && typeof input.jointDeg === "object" ? input.jointDeg : {};

  const j1 = toFinite(joints.j1, 0);
  const j2 = toFinite(joints.j2, 0);
  const j3 = toFinite(joints.j3, 0);
  const j4 = toFinite(joints.j4, 0);
  const w = energyWeights && typeof energyWeights === "object" ? energyWeights : {};

  const byTarget = {
    j2: calcBeamNode(model, model.sections.j2, material, payloadNewton, j2, w.j2 ?? 0.33),
    j3: calcBeamNode(model, model.sections.j3, material, payloadNewton, j2 + j3, w.j3 ?? 0.27),
    j4: calcBeamNode(model, model.sections.j4, material, payloadNewton, j2 + j3 + j4, w.j4 ?? 0.17)
  };

  const maxStressMpa = Math.max(byTarget.j2.stressMpa, byTarget.j3.stressMpa, byTarget.j4.stressMpa);
  const maxRatio = Math.max(byTarget.j2.stressRatio, byTarget.j3.stressRatio, byTarget.j4.stressRatio);
  const totalDeformationMm = byTarget.j2.deformationMm + byTarget.j3.deformationMm + byTarget.j4.deformationMm;
  const summary = { maxStressMpa, maxRatio, totalDeformationMm };

  return {
    ok: true,
    model,
    payloadNewton,
    jointDeg: { j1, j2, j3, j4 },
    byTarget,
    summary,
    diagnostics: buildDiagnostics(byTarget, summary, w)
  };
}
