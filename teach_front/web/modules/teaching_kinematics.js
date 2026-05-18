import { DEG2RAD, RAD2DEG, clamp } from "./app_math.js";

function normAngleDeltaDeg(a, b) {
  const d = Number(a) - Number(b);
  if (!Number.isFinite(d)) return 0;
  return Math.abs(d);
}

function toCandidateLabel(index) {
  return index === 0 ? "肘上解" : "肘下解";
}

function evaluateCandidate(target, linkage, candidateAngles, jointDefs, currentAngles) {
  const clamped = {};
  const rawAngles = { ...candidateAngles };
  let clipped = false;
  let clipCount = 0;
  let clipMagnitude = 0;
  let minLimitMarginDeg = Number.POSITIVE_INFINITY;
  let smoothnessDeltaDeg = 0;

  for (const def of jointDefs.values()) {
    const name = def.name;
    const raw = Number(rawAngles[name] ?? currentAngles[name] ?? 0);
    const limited = clamp(raw, def.minDeg, def.maxDeg);
    if (Math.abs(limited - raw) > 1e-6) {
      clipped = true;
      clipCount += 1;
      clipMagnitude += Math.abs(limited - raw);
    }
    const margin = Math.min(Math.abs(limited - def.minDeg), Math.abs(def.maxDeg - limited));
    minLimitMarginDeg = Math.min(minLimitMarginDeg, margin);
    smoothnessDeltaDeg += normAngleDeltaDeg(limited, currentAngles[name] ?? 0);
    clamped[name] = limited;
  }

  if (!Number.isFinite(minLimitMarginDeg)) {
    minLimitMarginDeg = 0;
  }

  const fk = computeFk(clamped, linkage);
  const dx = fk.x - target.x;
  const dy = fk.y - target.y;
  const dz = fk.z - target.z;
  const errorMm = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Small score means better candidate.
  const score = errorMm * 4.0 + clipMagnitude * 1.2 + smoothnessDeltaDeg * 0.08 - minLimitMarginDeg * 0.12;

  return {
    rawAngles,
    angles: clamped,
    clipped,
    clipCount,
    clipMagnitude,
    minLimitMarginDeg,
    smoothnessDeltaDeg,
    fk,
    errorMm,
    score
  };
}

function projectTargetToReachable(target, linkage) {
  const l1 = Number(linkage?.activeLinkLengthMm?.J2 || 135);
  const l2 = Number(linkage?.activeLinkLengthMm?.J3 || 145);
  const baseH = Number(linkage?.baseHeightMm || 88.5);

  const x = Number(target.x) || 0;
  const y = Number(target.y) || 0;
  const z = Number(target.z) || 0;

  const r = Math.sqrt(x * x + y * y);
  const zz = z - baseH;
  const d = Math.sqrt(r * r + zz * zz);
  const minReach = Math.max(0, Math.abs(l1 - l2));
  const maxReach = Math.max(minReach + 1e-6, l1 + l2);

  const limitedD = clamp(d, minReach + 1e-6, maxReach - 1e-6);
  if (!(d > 1e-6)) {
    return { x: minReach + 1, y: 0, z: baseH };
  }

  const scale = limitedD / d;
  const rr = r * scale;
  const zProj = zz * scale + baseH;

  const dirX = r > 1e-6 ? x / r : 1;
  const dirY = r > 1e-6 ? y / r : 0;

  return {
    x: rr * dirX,
    y: rr * dirY,
    z: zProj
  };
}

export function computeFk(angles = {}, linkage = {}) {
  const l1 = Number(linkage?.activeLinkLengthMm?.J2 || 135);
  const l2 = Number(linkage?.activeLinkLengthMm?.J3 || 145);
  const baseH = Number(linkage?.baseHeightMm || 88.5);

  const t1 = (angles.J1 || 0) * DEG2RAD;
  const t2 = (angles.J2 || 0) * DEG2RAD;
  const t3 = (angles.J3 || 0) * DEG2RAD;

  const planar = l1 * Math.cos(t2) + l2 * Math.cos(t2 + t3);
  const x = planar * Math.cos(t1);
  const y = planar * Math.sin(t1);
  const z = baseH + l1 * Math.sin(t2) + l2 * Math.sin(t2 + t3);
  return { x, y, z };
}

export function solveIk(target = {}, linkage = {}, jointDefs = new Map(), currentAngles = {}) {
  const l1 = Number(linkage?.activeLinkLengthMm?.J2 || 135);
  const l2 = Number(linkage?.activeLinkLengthMm?.J3 || 145);
  const baseH = Number(linkage?.baseHeightMm || 88.5);
  const x = Number(target.x);
  const y = Number(target.y);
  const z = Number(target.z);

  const t1 = Math.atan2(y, x);
  const r = Math.sqrt(x * x + y * y);
  const zz = z - baseH;
  const dist = Math.sqrt(r * r + zz * zz);

  const minReach = Math.abs(l1 - l2);
  const maxReach = l1 + l2;
  const outside = dist < minReach - 2 || dist > maxReach + 2;

  const marginMm = Math.min(maxReach - dist, dist - minReach);
  const reachability = outside ? "unreachable" : (marginMm < 10 ? "boundary" : "reachable");

  if (outside) {
    const reason = dist > maxReach
      ? "目标超出最大工作半径"
      : "目标落入机械臂内不可达区";
    return {
      ok: false,
      message: `${reason}，建议减小半径或调整高度`,
      clipped: false,
      angles: {},
      candidates: [],
      chosenIndex: -1,
      diagnostics: {
        reachability,
        marginMm,
        nearSingularity: marginMm < 8,
        reason,
        planarRadiusMm: r,
        verticalOffsetMm: zz,
        projectedTarget: projectTargetToReachable(target, linkage)
      }
    };
  }

  const c3Raw = (r * r + zz * zz - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  const c3 = clamp(c3Raw, -1, 1);
  const s3Abs = Math.sqrt(Math.max(0, 1 - c3 * c3));

  const branchT3 = [Math.atan2(s3Abs, c3), -Math.atan2(s3Abs, c3)];
  const candidates = [];

  branchT3.forEach((t3, index) => {
    const t2 = Math.atan2(zz, r) - Math.atan2(l2 * Math.sin(t3), l1 + l2 * Math.cos(t3));
    const t4 = -0.65 * (t2 + t3);

    const rawAngles = {
      J1: t1 * RAD2DEG,
      J2: t2 * RAD2DEG,
      J3: t3 * RAD2DEG,
      J4: t4 * RAD2DEG
    };

    const scored = evaluateCandidate(target, linkage, rawAngles, jointDefs, currentAngles);
    candidates.push({
      index,
      label: toCandidateLabel(index),
      rawAngles: scored.rawAngles,
      angles: scored.angles,
      clipped: scored.clipped,
      clipCount: scored.clipCount,
      errorMm: scored.errorMm,
      minLimitMarginDeg: scored.minLimitMarginDeg,
      smoothnessDeltaDeg: scored.smoothnessDeltaDeg,
      score: scored.score,
      fk: scored.fk
    });
  });

  candidates.sort((a, b) => a.score - b.score);
  const chosen = candidates[0] || null;
  const nearSingularity = Math.abs(s3Abs) < 0.08 || marginMm < 8;

  return {
    ok: Boolean(chosen),
    clipped: Boolean(chosen?.clipped),
    angles: chosen?.angles || {},
    candidates,
    chosenIndex: chosen ? chosen.index : -1,
    diagnostics: {
      reachability,
      marginMm,
      nearSingularity,
      reason: nearSingularity ? "接近边界或奇异区域，建议缓慢调整" : "解算稳定",
      planarRadiusMm: r,
      verticalOffsetMm: zz,
      projectedTarget: null
    }
  };
}
