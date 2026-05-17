import { DEG2RAD, RAD2DEG, clamp } from "./app_math.js";

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

  let c3 = (r * r + zz * zz - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  if (c3 < -1.02 || c3 > 1.02) {
    return { ok: false, message: "目标超出工作空间，建议减小半径或高度" };
  }

  c3 = clamp(c3, -1, 1);
  const s3 = Math.sqrt(Math.max(0, 1 - c3 * c3));
  const t3 = -Math.atan2(s3, c3);
  const t2 = Math.atan2(zz, r) - Math.atan2(l2 * Math.sin(t3), l1 + l2 * Math.cos(t3));
  const t4 = -0.65 * (t2 + t3);

  const solved = {
    J1: t1 * RAD2DEG,
    J2: t2 * RAD2DEG,
    J3: t3 * RAD2DEG,
    J4: t4 * RAD2DEG
  };

  const clamped = {};
  let clipped = false;
  for (const def of jointDefs.values()) {
    const raw = solved[def.name] ?? currentAngles[def.name] ?? 0;
    const limited = clamp(raw, def.minDeg, def.maxDeg);
    if (Math.abs(limited - raw) > 1e-6) {
      clipped = true;
    }
    clamped[def.name] = limited;
  }

  return {
    ok: true,
    clipped,
    angles: clamped
  };
}
