const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toPositive(value, fallback) {
  const n = toFinite(value, fallback);
  return n > 0 ? n : fallback;
}

export const DEFAULT_DEMO_ARM_MODEL = Object.freeze({
  baseHeight: 86,
  link2: 135,
  link3: 145,
  tool: 70,
  wristPitchDeg: 0
});

export function normalizeDemoArmModel(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    baseHeight: toFinite(src.baseHeight, DEFAULT_DEMO_ARM_MODEL.baseHeight),
    link2: toPositive(src.link2, DEFAULT_DEMO_ARM_MODEL.link2),
    link3: toPositive(src.link3, DEFAULT_DEMO_ARM_MODEL.link3),
    tool: Math.max(0, toFinite(src.tool, DEFAULT_DEMO_ARM_MODEL.tool)),
    wristPitchDeg: toFinite(src.wristPitchDeg, DEFAULT_DEMO_ARM_MODEL.wristPitchDeg)
  };
}

function normalizeJointDeg(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  return {
    j1: toFinite(src.j1, 0),
    j2: toFinite(src.j2, 0),
    j3: toFinite(src.j3, 0),
    j4: toFinite(src.j4, 0)
  };
}

export function forwardKinematics(modelInput = {}, jointDegInput = {}) {
  const model = normalizeDemoArmModel(modelInput);
  const jointDeg = normalizeJointDeg(jointDegInput);

  const t1 = jointDeg.j1 * DEG2RAD;
  const t2 = jointDeg.j2 * DEG2RAD;
  const t23 = (jointDeg.j2 + jointDeg.j3) * DEG2RAD;
  const t234 = (jointDeg.j2 + jointDeg.j3 + jointDeg.j4) * DEG2RAD;

  const radial =
    model.link2 * Math.cos(t2)
    + model.link3 * Math.cos(t23)
    + model.tool * Math.cos(t234);
  const y =
    model.baseHeight
    + model.link2 * Math.sin(t2)
    + model.link3 * Math.sin(t23)
    + model.tool * Math.sin(t234);

  const x = radial * Math.cos(t1);
  const z = radial * Math.sin(t1);

  return {
    ok: true,
    model,
    jointDeg,
    tcp: { x, y, z },
    radial,
    pitchDeg: jointDeg.j2 + jointDeg.j3 + jointDeg.j4
  };
}

export function inverseKinematics(modelInput = {}, targetInput = {}, options = {}) {
  const model = normalizeDemoArmModel(modelInput);
  const target = {
    x: toFinite(targetInput.x, 0),
    y: toFinite(targetInput.y, model.baseHeight),
    z: toFinite(targetInput.z, 0)
  };

  const elbow = String(options.elbow || "down").toLowerCase() === "up" ? "up" : "down";
  const wristPitchDeg = toFinite(options.wristPitchDeg, model.wristPitchDeg);
  const wristPitch = wristPitchDeg * DEG2RAD;

  const yaw = Math.atan2(target.z, target.x);
  const radial = Math.hypot(target.x, target.z);
  const planarY = target.y - model.baseHeight;

  const wristX = radial - model.tool * Math.cos(wristPitch);
  const wristY = planarY - model.tool * Math.sin(wristPitch);

  const l2 = model.link2;
  const l3 = model.link3;
  const dist2 = wristX * wristX + wristY * wristY;
  const dist = Math.sqrt(Math.max(0, dist2));
  const minReach = Math.abs(l2 - l3);
  const maxReach = l2 + l3;
  const reachable = dist >= minReach - 1e-6 && dist <= maxReach + 1e-6;

  const c3Raw = (dist2 - l2 * l2 - l3 * l3) / (2 * l2 * l3);
  const c3 = clamp(c3Raw, -1, 1);
  const s3Mag = Math.sqrt(Math.max(0, 1 - c3 * c3));
  const s3 = elbow === "up" ? s3Mag : -s3Mag;

  const theta3 = Math.atan2(s3, c3);
  const theta2 = Math.atan2(wristY, wristX) - Math.atan2(l3 * s3, l2 + l3 * c3);
  const theta4 = wristPitch - theta2 - theta3;

  const jointDeg = {
    j1: yaw * RAD2DEG,
    j2: theta2 * RAD2DEG,
    j3: theta3 * RAD2DEG,
    j4: theta4 * RAD2DEG
  };

  const fk = forwardKinematics(model, jointDeg);
  const err = {
    x: target.x - fk.tcp.x,
    y: target.y - fk.tcp.y,
    z: target.z - fk.tcp.z
  };

  return {
    ok: true,
    reachable,
    elbow,
    model,
    target,
    jointDeg,
    wristPitchDeg,
    error: err,
    errorNorm: Math.hypot(err.x, err.y, err.z)
  };
}
