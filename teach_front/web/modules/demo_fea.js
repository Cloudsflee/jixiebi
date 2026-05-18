import { evaluateStructuralFea } from "./teaching_structural_model.js";

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

function toneFromRatio(ratio) {
  if (ratio < 0.5) return "low";
  if (ratio < 0.75) return "medium";
  if (ratio < 0.95) return "high";
  return "critical";
}

export const DEFAULT_PSEUDO_FEA_MODEL = Object.freeze({
  yieldStressMpa: 210,
  dynamicGain: 0.35,
  payloadScale: 1,
  sections: {
    j2: { leverMm: 135, strengthArea: 90, compliance: 0.011 },
    j3: { leverMm: 145, strengthArea: 78, compliance: 0.014 },
    j4: { leverMm: 70, strengthArea: 64, compliance: 0.019 }
  }
});

export function normalizePseudoFeaModel(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const defaults = DEFAULT_PSEUDO_FEA_MODEL;
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

function calcNodeStress(model, section, payloadN, angleDeg, couplingDeg = 0) {
  const absAngle = Math.abs(toFinite(angleDeg, 0));
  const absCoupling = Math.abs(toFinite(couplingDeg, 0));
  const angleFactor = 1 + 0.75 * Math.sin((absAngle * Math.PI) / 180) ** 2;
  const dynamicFactor = 1 + model.dynamicGain * (absCoupling / 120);

  const pseudoMoment = payloadN * section.leverMm * angleFactor * dynamicFactor;
  const stressMpa = pseudoMoment / section.strengthArea;
  const stressRatio = stressMpa / model.yieldStressMpa;

  const deformationMm =
    payloadN
    * section.leverMm
    * section.compliance
    * angleFactor
    / 100;

  return {
    stressMpa,
    stressRatio,
    deformationMm,
    heatRatio: clamp(stressRatio, 0, 1)
  };
}

function buildDiagnostics(byTarget, summary) {
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

  const riskReason = peak.ratio >= 0.95
    ? `${peak.section.toUpperCase()} segment is close to yield.`
    : peak.ratio >= 0.75
      ? `${peak.section.toUpperCase()} segment is carrying dominant stress.`
      : "Load is distributed and remains in controllable range.";

  const sectionRank = sorted.map((s, idx) => ({
    rank: idx + 1,
    section: s.section,
    stressMpa: s.stressMpa,
    deformationMm: s.deformationMm,
    ratio: s.ratio,
    stressPct: summary.maxStressMpa > 1e-9 ? (s.stressMpa / summary.maxStressMpa) : 0,
    dispPct: summary.totalDeformationMm > 1e-9 ? (s.deformationMm / summary.totalDeformationMm) : 0
  }));

  return {
    peakSection: peak.section,
    sectionRank,
    riskReason,
    hotspotLevel
  };
}

export function evaluatePseudoFea(modelInput = {}, input = {}, ctx = {}) {
  const material = ctx.material || modelInput._feaMaterial || {};
  const energyWeights = ctx.energyWeights || modelInput._energyWeights || {};
  const options = {
    loadDirectionFactor: ctx.loadDirectionFactor ?? modelInput._loadDirectionFactor ?? 1,
    impactFactor: ctx.impactFactor ?? 1,
    momentLeverFactor: ctx.momentLeverFactor ?? 1,
    constraintFactor: ctx.constraintFactor ?? 1,
    sectionScales: ctx.sectionScales ?? {},
    dynamicGain: ctx.dynamicGain
  };
  if (ctx.legacy !== true) {
    return evaluateStructuralFea(modelInput, input, material, energyWeights, options);
  }
  const model = normalizePseudoFeaModel(modelInput);
  const payloadNewton = Math.max(0, toFinite(input.payloadNewton, 0)) * model.payloadScale;
  const joints = input.jointDeg && typeof input.jointDeg === "object" ? input.jointDeg : {};

  const j1 = toFinite(joints.j1, 0);
  const j2 = toFinite(joints.j2, 0);
  const j3 = toFinite(joints.j3, 0);
  const j4 = toFinite(joints.j4, 0);

  const byTarget = {
    j2: calcNodeStress(model, model.sections.j2, payloadNewton, j2, j3),
    j3: calcNodeStress(model, model.sections.j3, payloadNewton, j2 + j3, j4),
    j4: calcNodeStress(model, model.sections.j4, payloadNewton, j2 + j3 + j4, j1)
  };

  const maxStressMpa = Math.max(byTarget.j2.stressMpa, byTarget.j3.stressMpa, byTarget.j4.stressMpa);
  const maxRatio = Math.max(byTarget.j2.stressRatio, byTarget.j3.stressRatio, byTarget.j4.stressRatio);
  const totalDeformationMm = byTarget.j2.deformationMm + byTarget.j3.deformationMm + byTarget.j4.deformationMm;

  const summary = {
    maxStressMpa,
    maxRatio,
    totalDeformationMm
  };

  return {
    ok: true,
    model,
    payloadNewton,
    jointDeg: { j1, j2, j3, j4 },
    byTarget,
    summary,
    diagnostics: buildDiagnostics(byTarget, summary)
  };
}
