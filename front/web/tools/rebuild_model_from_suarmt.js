"use strict";

const fs = require("fs");
const path = require("path");

const TARGET_ORDER = ["base", "j1", "j2", "j3", "j4", "j5", "j6", "j7"];
// SuArmT active control semantics (robot_slider_control_level.m):
// visible/manual controls are J1, J2, J3 and J5(gripper).
// J4 is derived by offset-minus-sum (q4 = q4_offset - q2 - q3).
// J6/J7 follow J5.
const ACTIVE_CONTROL_TARGETS = ["j1", "j2", "j3", "j5"];
const URDF_JOINT_SERVO_MAP = {
  "01": 1,
  "02": 2,
  "03": 3,
  "04": 4,
  "05": 5,
  "06": 5,
  "07": 5
};
const LINK_TARGET_MAP = {
  base_link: "base",
  "01": "j1",
  "02": "j2",
  "03": "j3",
  "04": "j4",
  "05": "j5",
  "06": "j6",
  "07": "j7"
};
const TARGET_PARENT_DEFAULT = {
  j1: "base",
  j2: "j1",
  j3: "j2",
  j4: "j3",
  j5: "j4",
  j6: "j4",
  j7: "j4"
};
const TARGET_COLORS = {
  base: "#7e8a97",
  j1: "#4e79a7",
  j2: "#f28e2b",
  j3: "#59a14f",
  j4: "#e15759",
  j5: "#b07aa1",
  j6: "#76b7b2",
  j7: "#edc948"
};
const TARGET_FEA_WEIGHT = {
  base: 0.04,
  j1: 0.08,
  j2: 0.78,
  j3: 0.9,
  j4: 0.66,
  j5: 0.3,
  j6: 0.3,
  j7: 0.3
};
// Source of truth for joint limits:
// SuArmT/urdf/robot_slider_control_level.m
// jointMins = [-1.3; -0.5; -0.3; -3.14; -0.85; -0.85; -0.85]
// jointMaxs = [ 2.0;  0.0;  1.0;  3.14;  0.5;   0.5;   0.5 ]
const MATLAB_LIMITS_RAD_BY_TARGET = {
  j1: [-1.3, 2.0],
  j2: [-0.5, 0.0],
  j3: [-0.3, 1.0],
  j4: [-3.14, 3.14],
  j5: [-0.85, 0.5],
  j6: [-0.85, 0.5],
  j7: [-0.85, 0.5]
};
const STAMP = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseTagAttr(tagText, attrName, fallback = "") {
  const re = new RegExp(`${attrName}="([^"]*)"`, "i");
  const m = String(tagText || "").match(re);
  return m ? m[1] : fallback;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, min, max) {
  const n = Math.round(toNumber(value, min));
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback = min) {
  const n = toNumber(value, fallback);
  return Math.max(min, Math.min(max, n));
}

function radToDeg(rad) {
  return Number(rad) * (180 / Math.PI);
}

function mapLinear(x, x0, x1, y0, y1) {
  const dx = x1 - x0;
  if (!Number.isFinite(dx) || Math.abs(dx) < 1e-9) return y0;
  const t = (x - x0) / dx;
  return y0 + (y1 - y0) * t;
}

function degToPosLinear(deg, minDeg, maxDeg, minPos = 0, maxPos = 1000) {
  const pos = mapLinear(deg, minDeg, maxDeg, minPos, maxPos);
  return clampInt(pos, minPos, maxPos);
}

function getLimitDegByTarget(target, urdfMinDeg, urdfMaxDeg, fallbackMinDeg, fallbackMaxDeg) {
  const key = String(target || "").trim().toLowerCase();
  const matlab = MATLAB_LIMITS_RAD_BY_TARGET[key];
  if (Array.isArray(matlab) && matlab.length >= 2) {
    return [radToDeg(matlab[0]), radToDeg(matlab[1])];
  }
  if (Number.isFinite(urdfMinDeg) && Number.isFinite(urdfMaxDeg)) {
    return [urdfMinDeg, urdfMaxDeg];
  }
  return [fallbackMinDeg, fallbackMaxDeg];
}

function parseVec3(text, fallback = [0, 0, 0]) {
  const tokens = String(text || "")
    .trim()
    .split(/\s+/)
    .map((v) => Number(v));
  if (tokens.length < 3 || tokens.some((v) => !Number.isFinite(v))) {
    return [...fallback];
  }
  return [tokens[0], tokens[1], tokens[2]];
}

function vecAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecLen(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function vecNorm(v, fallback = [0, 0, 1]) {
  const l = vecLen(v);
  if (!Number.isFinite(l) || l < 1e-12) {
    return [...fallback];
  }
  return [v[0] / l, v[1] / l, v[2] / l];
}

function roundVec(v, digits = 6) {
  const scale = 10 ** digits;
  return v.map((n) => Math.round(toNumber(n, 0) * scale) / scale);
}

function mat3Identity() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
}

function mat3Mul(a, b) {
  const out = mat3Identity();
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }
  return out;
}

function mat3MulVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

function rpyToMat3(rpy) {
  const [roll, pitch, yaw] = rpy.map((v) => toNumber(v, 0));
  const cx = Math.cos(roll);
  const sx = Math.sin(roll);
  const cy = Math.cos(pitch);
  const sy = Math.sin(pitch);
  const cz = Math.cos(yaw);
  const sz = Math.sin(yaw);

  const rx = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx]
  ];
  const ry = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy]
  ];
  const rz = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1]
  ];
  return mat3Mul(rz, mat3Mul(ry, rx));
}

function dominantAxisName(vec) {
  const v = vecNorm(vec, [0, 0, 1]);
  const abs = v.map((n) => Math.abs(n));
  let idx = 0;
  if (abs[1] > abs[idx]) idx = 1;
  if (abs[2] > abs[idx]) idx = 2;
  return idx === 0 ? "x" : idx === 1 ? "y" : "z";
}

function parseUrdf(urdfText) {
  const links = [];
  const joints = [];

  const linkRe = /<link\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/link>/gi;
  let linkMatch = null;
  while ((linkMatch = linkRe.exec(urdfText))) {
    const name = linkMatch[1];
    const body = linkMatch[2] || "";
    const meshTag = body.match(/<mesh\b[^>]*filename="([^"]+)"[^>]*\/?>/i);
    const colorTag = body.match(/<color\b[^>]*rgba="([^"]+)"[^>]*\/?>/i);
    links.push({
      name,
      meshFilename: meshTag ? meshTag[1] : "",
      colorRgba: colorTag ? colorTag[1] : ""
    });
  }

  const jointRe = /<joint\b[^>]*name="([^"]+)"[^>]*type="([^"]+)"[^>]*>([\s\S]*?)<\/joint>/gi;
  let jointMatch = null;
  while ((jointMatch = jointRe.exec(urdfText))) {
    const name = jointMatch[1];
    const type = jointMatch[2];
    const body = jointMatch[3] || "";
    const originTag = body.match(/<origin\b[^>]*\/?>/i)?.[0] || "";
    const axisTag = body.match(/<axis\b[^>]*\/?>/i)?.[0] || "";
    const limitTag = body.match(/<limit\b[^>]*\/?>/i)?.[0] || "";
    const parentTag = body.match(/<parent\b[^>]*\/?>/i)?.[0] || "";
    const childTag = body.match(/<child\b[^>]*\/?>/i)?.[0] || "";
    joints.push({
      name,
      type,
      parent: parseTagAttr(parentTag, "link", ""),
      child: parseTagAttr(childTag, "link", ""),
      originXyz: parseVec3(parseTagAttr(originTag, "xyz", "0 0 0"), [0, 0, 0]),
      originRpy: parseVec3(parseTagAttr(originTag, "rpy", "0 0 0"), [0, 0, 0]),
      axis: parseVec3(parseTagAttr(axisTag, "xyz", "0 0 1"), [0, 0, 1]),
      limitLower: toNumber(parseTagAttr(limitTag, "lower", "0"), 0),
      limitUpper: toNumber(parseTagAttr(limitTag, "upper", "0"), 0)
    });
  }

  const childLinks = new Set(joints.map((j) => j.child));
  const root = links.find((link) => !childLinks.has(link.name))?.name || links[0]?.name || "base_link";

  return { links, joints, root };
}

function solveWorldKinematics(model) {
  const linkWorld = new Map();
  const jointWorld = new Map();
  const childJointsByParent = new Map();

  for (const joint of model.joints) {
    if (!childJointsByParent.has(joint.parent)) {
      childJointsByParent.set(joint.parent, []);
    }
    childJointsByParent.get(joint.parent).push(joint);
  }

  linkWorld.set(model.root, {
    R: mat3Identity(),
    t: [0, 0, 0]
  });

  const queue = [model.root];
  while (queue.length > 0) {
    const parentLink = queue.shift();
    const parentTf = linkWorld.get(parentLink);
    if (!parentTf) continue;

    const outgoing = childJointsByParent.get(parentLink) || [];
    for (const joint of outgoing) {
      const Rorigin = rpyToMat3(joint.originRpy);
      const axisLocal = vecNorm(joint.axis, [0, 0, 1]);
      const axisParent = vecNorm(mat3MulVec(Rorigin, axisLocal), [0, 0, 1]);
      const pivotWorld = vecAdd(parentTf.t, mat3MulVec(parentTf.R, joint.originXyz));
      const axisWorld = vecNorm(mat3MulVec(parentTf.R, axisParent), [0, 0, 1]);
      const childR = mat3Mul(parentTf.R, Rorigin);
      const childT = [...pivotWorld];

      if (!linkWorld.has(joint.child)) {
        linkWorld.set(joint.child, { R: childR, t: childT });
        queue.push(joint.child);
      }

      jointWorld.set(joint.name, {
        pivotWorld,
        axisParent,
        axisWorld,
        childR,
        childT
      });
    }
  }

  return { linkWorld, jointWorld };
}

function parsePackageMeshPath(filename) {
  const text = String(filename || "");
  const pkg = text.match(/^package:\/\/[^/]+\/(.+)$/i);
  if (pkg) return pkg[1];
  return text.replace(/^\.\/+/, "");
}

function readVec3FromBuffer(buffer, offset) {
  return [
    buffer.readFloatLE(offset + 0),
    buffer.readFloatLE(offset + 4),
    buffer.readFloatLE(offset + 8)
  ];
}

function writeVec3ToBuffer(buffer, offset, vec) {
  buffer.writeFloatLE(vec[0], offset + 0);
  buffer.writeFloatLE(vec[1], offset + 4);
  buffer.writeFloatLE(vec[2], offset + 8);
}

function transformBinaryStl(inputPath, outputPath, R, t, outputScale = 1) {
  const src = fs.readFileSync(inputPath);
  if (src.length < 84) {
    throw new Error(`Invalid STL (too small): ${inputPath}`);
  }
  const triCount = src.readUInt32LE(80);
  const expected = 84 + triCount * 50;
  if (expected !== src.length) {
    throw new Error(`Unsupported STL format (expected binary facets): ${inputPath}`);
  }

  const out = Buffer.from(src);
  const headerText = Buffer.from(`suarmt globalized from ${path.basename(inputPath)}`, "ascii");
  out.fill(0, 0, 80);
  headerText.copy(out, 0, 0, Math.min(80, headerText.length));

  let off = 84;
  for (let i = 0; i < triCount; i += 1) {
    const normal = readVec3FromBuffer(src, off);
    const normalOut = vecNorm(mat3MulVec(R, normal), [0, 0, 1]);
    writeVec3ToBuffer(out, off, normalOut);
    off += 12;

    for (let v = 0; v < 3; v += 1) {
      const p = readVec3FromBuffer(src, off);
      const q = vecAdd(mat3MulVec(R, p), t);
      writeVec3ToBuffer(out, off, [q[0] * outputScale, q[1] * outputScale, q[2] * outputScale]);
      off += 12;
    }
    off += 2;
  }
  fs.writeFileSync(outputPath, out);
}

function linkByNameMap(links) {
  const map = new Map();
  links.forEach((item) => map.set(item.name, item));
  return map;
}

function mapByTarget(items, key = "target") {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const target = String(item?.[key] || "").trim().toLowerCase();
    if (!target) return;
    map.set(target, item);
  });
  return map;
}

function targetFromLink(linkName) {
  return LINK_TARGET_MAP[String(linkName || "").trim()] || "";
}

function defaultParentTarget(target) {
  return TARGET_PARENT_DEFAULT[String(target || "").trim().toLowerCase()] || "base";
}

function servoIdFromUrdfJointName(jointName, fallback = 1) {
  const key = String(jointName || "").trim();
  const mapped = URDF_JOINT_SERVO_MAP[key];
  if (Number.isFinite(mapped)) return mapped;
  return fallback;
}

function buildFrontConfig({ oldFront, model, jointInfoByTarget, transformedMeshesByTarget }) {
  const oldJointByTarget = mapByTarget(oldFront.joints || []);
  const oldPartByTarget = mapByTarget(oldFront.parts || []);

  const joints = [];
  for (const target of TARGET_ORDER) {
    if (target === "base") continue;
    const old = oldJointByTarget.get(target) || {};
    const info = jointInfoByTarget[target];
    const pivotMm = info ? roundVec(info.pivotWorld.map((n) => n * 1000), 4) : [0, 0, 0];
    const axisParent = info ? vecNorm(info.axisParent, [0, 0, 1]) : [0, 0, 1];
    const axisWorld = info ? vecNorm(info.axisWorld, [0, 0, 1]) : axisParent;
    const dominant = dominantAxisName(axisWorld);
    const name = String(old.name || target.toUpperCase());
    const parentTarget = String(info?.parentTarget || old.parentTarget || defaultParentTarget(target)).toLowerCase();
    const isActiveControl = ACTIVE_CONTROL_TARGETS.includes(target);
    const servoFallback = target === "j5"
      ? 5
      : servoIdFromUrdfJointName(info?.jointName, 1);
    const isGripperBranch = target === "j5" || target === "j6" || target === "j7";
    const isLinkageOffsetJoint = target === "j4";
    const minDegDefault = isGripperBranch ? -48 : (isLinkageOffsetJoint ? -180 : -120);
    const maxDegDefault = isGripperBranch ? 48 : (isLinkageOffsetJoint ? 180 : 120);
    const guardMinDefault = 0;
    const guardMaxDefault = 1000;
    const derivedType = target === "j4"
      ? "offset_minus_sum"
      : ((target === "j6" || target === "j7") ? "follow" : "");
    const derivedSourceTarget = (target === "j6" || target === "j7") ? "j5" : "";
    const derivedSourceTargets = target === "j4" ? ["j2", "j3"] : [];
    const derivedGainDefault = (target === "j6" || target === "j7") ? 1 : 0;
    const derivedOffsetDefault = 0;
    const urdfMinDeg = info ? radToDeg(info.limitLower) : null;
    const urdfMaxDeg = info ? radToDeg(info.limitUpper) : null;
    const [rawMinDeg, rawMaxDeg] = getLimitDegByTarget(
      target,
      urdfMinDeg,
      urdfMaxDeg,
      minDegDefault,
      maxDegDefault
    );
    const minDegFinal = Math.min(rawMinDeg, rawMaxDeg);
    const maxDegFinal = Math.max(rawMinDeg, rawMaxDeg);
    const servoMapPoints = [
      { deg: minDegFinal, pos: 0 },
      { deg: maxDegFinal, pos: 1000 }
    ];
    const defaultPosHome = degToPosLinear(0, minDegFinal, maxDegFinal, 0, 1000);

    joints.push({
      ...old,
      name,
      target,
      parentTarget,
      uiHidden: !isActiveControl,
      controlRole: isActiveControl ? "active" : "derived",
      derivedType,
      derivedSourceTarget,
      derivedSourceTargets,
      derivedSourceName: (target === "j6" || target === "j7")
        ? "J5"
        : (target === "j4" ? "J4_OFFSET" : ""),
      derivedSourceNames: target === "j4" ? ["J2", "J3"] : [],
      derivedGain: derivedGainDefault,
      derivedOffsetDeg: derivedOffsetDefault,
      pivotSpace: "local",
      servoId: clampInt(
        old.servoId ?? servoFallback,
        1,
        253
      ),
      axis: dominant,
      pivot: pivotMm,
      pivotAdjust: Array.isArray(old.pivotAdjust) ? old.pivotAdjust : [0, 0, 0],
      closureEnabled: false,
      closureParentTarget: "",
      urdfJointName: String(info?.jointName || ""),
      urdfParentLink: String(info?.parentLink || ""),
      urdfChildLink: String(info?.childLink || ""),
      urdfAxisParent: roundVec(axisParent, 6),
      urdfAxisWorld: roundVec(axisWorld, 6),
      min: Number.isFinite(Number(old.min)) ? Number(old.min) : 0,
      max: Number.isFinite(Number(old.max)) ? Number(old.max) : 1000,
      guardMin: guardMinDefault,
      guardMax: guardMaxDefault,
      minDeg: minDegFinal,
      maxDeg: maxDegFinal,
      defaultPos: defaultPosHome,
      defaultTime: Number.isFinite(Number(old.defaultTime)) ? Number(old.defaultTime) : 300,
      servoMapPoints
    });
  }

  const parts = TARGET_ORDER.map((target) => {
    const oldPart = oldPartByTarget.get(target) || {};
    const files = transformedMeshesByTarget[target] || [];
    return {
      target,
      color: String(oldPart.color || TARGET_COLORS[target] || "#8aa0b3"),
      files
    };
  });

  const parentAxisByTarget = {};
  const axisByTarget = {};
  joints.forEach((joint) => {
    const info = jointInfoByTarget[joint.target];
    // Important: meshes are already transformed into zero-pose world coordinates.
    // Use zero-pose world axis as baseline, then runtime parent quaternion
    // carries dynamic rotation around that baseline.
    const axis = vecNorm(info?.axisWorld || [0, 0, 1], [0, 0, 1]);
    parentAxisByTarget[joint.target] = roundVec(axis, 6);
    axisByTarget[joint.target] = dominantAxisName(axis);
  });

  const next = {
    ...oldFront,
    note: `refactored from SuArmT URDF @ ${new Date().toISOString()}`,
    pivotSpace: "local",
    frameCalibration: {
      ...(oldFront.frameCalibration || {}),
      enabled: true,
      mode: "fixed_j1_front",
      upTarget: "j1",
      frontTarget: "j4",
      frontAxis: "x",
      yawOffsetDeg: 0,
      minFrontBaselineMm: 20,
      useDynamicFallback: false,
      note: "Lock J1-up and J4-front at boot to keep stable zero orientation."
    },
    parts,
    joints,
    assemblyLock: {
      ...(oldFront.assemblyLock || {}),
      enabled: true,
      disableCouplings: true,
      autoInferPivots: false,
      source: "SuArmT/urdf/SuArmT.urdf + SuArmT/urdf/SuArmT.csv",
      note: "URDF-based model hierarchy. parentTarget and axis are bound to SuArmT export."
    },
    motionLocks: {
      axisByTarget,
      parentAxisByTarget
    },
    urdfModel: {
      source: "SuArmT/urdf/SuArmT.urdf",
      csv: "SuArmT/urdf/SuArmT.csv",
      rootLink: model.root,
      generatedAt: new Date().toISOString()
    }
  };

  next.modelBasePathCandidates = ["./raw/"];

  if (next.physicalKinematics && typeof next.physicalKinematics === "object" && next.physicalKinematics.joints) {
    Object.keys(next.physicalKinematics.joints).forEach((key) => {
      const entry = next.physicalKinematics.joints[key];
      if (!entry || typeof entry !== "object") return;
      const target = String(entry.target || key || "").trim().toLowerCase();
      const hit = joints.find((j) => j.target === target);
      if (hit) {
        entry.pivot = [...hit.pivot];
      }
    });
  }

  return next;
}

function buildTeachConfig({ oldTeach, model, jointInfoByTarget, transformedMeshesByTarget }) {
  const oldPartByTarget = mapByTarget(oldTeach.parts || []);
  const oldJointByTarget = mapByTarget(oldTeach.joints || []);

  const targetToJointName = {
    j1: "J1",
    j2: "J2",
    j3: "J3",
    j4: "J4",
    j5: "J5",
    j6: "J6",
    j7: "J7"
  };

  const joints = [];
  for (const target of TARGET_ORDER) {
    if (target === "base") continue;
    const old = oldJointByTarget.get(target) || {};
    const info = jointInfoByTarget[target];
    // teach_front uses the same transformed global mesh set as front.
    // Keep axis baseline consistent with zero-pose world axis.
    const axis = vecNorm(info?.axisWorld || old.axis || [0, 0, 1], [0, 0, 1]);
    const pivot = info ? roundVec(info.pivotWorld.map((n) => n * 1000), 4) : [0, 0, 0];
    const parentTarget = String(info?.parentTarget || defaultParentTarget(target)).toLowerCase();
    const isActiveControl = ACTIVE_CONTROL_TARGETS.includes(target);
    const isGripperBranch = target === "j5" || target === "j6" || target === "j7";
    const isLinkageOffsetJoint = target === "j4";
    const minDegDefault = isGripperBranch ? -48 : (isLinkageOffsetJoint ? -180 : -120);
    const maxDegDefault = isGripperBranch ? 48 : (isLinkageOffsetJoint ? 180 : 120);
    const derivedType = target === "j4"
      ? "offset_minus_sum"
      : ((target === "j6" || target === "j7") ? "follow" : "");
    const derivedSourceTarget = (target === "j6" || target === "j7") ? "j5" : "";
    const derivedSourceTargets = target === "j4" ? ["j2", "j3"] : [];
    const derivedGainDefault = (target === "j6" || target === "j7") ? 1 : 0;
    const derivedOffsetDefault = 0;
    const urdfMinDeg = info ? radToDeg(info.limitLower) : null;
    const urdfMaxDeg = info ? radToDeg(info.limitUpper) : null;
    const [rawMinDeg, rawMaxDeg] = getLimitDegByTarget(
      target,
      urdfMinDeg,
      urdfMaxDeg,
      minDegDefault,
      maxDegDefault
    );
    const minDegFinal = Math.min(rawMinDeg, rawMaxDeg);
    const maxDegFinal = Math.max(rawMinDeg, rawMaxDeg);
    const defaultDegFinal = clampNumber(0, minDegFinal, maxDegFinal, 0);
    joints.push({
      name: String(old.name || targetToJointName[target] || target.toUpperCase()),
      target,
      parent: parentTarget === "base" ? null : String(targetToJointName[parentTarget] || parentTarget.toUpperCase()),
      uiHidden: !isActiveControl,
      controlRole: isActiveControl ? "active" : "derived",
      derivedType,
      derivedSourceTarget,
      derivedSourceTargets,
      derivedSourceName: (target === "j6" || target === "j7")
        ? "J5"
        : (target === "j4" ? "J4_OFFSET" : ""),
      derivedSourceNames: target === "j4" ? ["J2", "J3"] : [],
      derivedGain: derivedGainDefault,
      derivedOffsetDeg: derivedOffsetDefault,
      axis: roundVec(axis, 6),
      pivot,
      minDeg: minDegFinal,
      maxDeg: maxDegFinal,
      defaultDeg: defaultDegFinal
    });
  }

  const parts = TARGET_ORDER.map((target) => {
    const oldPart = oldPartByTarget.get(target) || {};
    return {
      name: String(oldPart.name || target.toUpperCase()),
      target,
      color: String(oldPart.color || TARGET_COLORS[target] || "#8aa0b3"),
      feaWeight: Number.isFinite(Number(oldPart.feaWeight))
        ? Number(oldPart.feaWeight)
        : Number(TARGET_FEA_WEIGHT[target] || 0.5),
      files: transformedMeshesByTarget[target] || []
    };
  });

  return {
    ...oldTeach,
    meta: {
      ...(oldTeach.meta || {}),
      name: "Robot Teaching Assistant Demo (SuArmT Refactored)",
      version: "2.1.0",
      buildDate: new Date().toISOString().slice(0, 10),
      sourceUrdf: "SuArmT/urdf/SuArmT.urdf"
    },
    assetVersion: `suarmt-${STAMP}`,
    modelBasePath: "./models/raw/",
    frameCalibration: {
      ...(oldTeach.frameCalibration || {}),
      enabled: true,
      mode: "fixed_j1_front",
      upTarget: "j1",
      frontTarget: "j4",
      frontAxis: "x",
      yawOffsetDeg: 0,
      minFrontBaselineMm: 20,
      useDynamicFallback: false,
      note: "Lock J1-up and J4-front at boot to keep stable zero orientation."
    },
    originJoint: "J1",
    originMode: "j1_ground",
    parts,
    joints,
    urdfModel: {
      source: "SuArmT/urdf/SuArmT.urdf",
      csv: "SuArmT/urdf/SuArmT.csv",
      rootLink: model.root,
      generatedAt: new Date().toISOString()
    }
  };
}

function run() {
  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const packageDir = path.join(projectRoot, "SuArmT");
  const urdfPath = path.join(packageDir, "urdf", "SuArmT.urdf");
  const csvPath = path.join(packageDir, "urdf", "SuArmT.csv");
  const meshRoot = packageDir;

  const frontWebRoot = path.resolve(__dirname, "..");
  const frontRawDir = path.join(frontWebRoot, "raw");
  const frontUrdfDir = path.join(frontWebRoot, "urdf");
  const frontJointsPath = path.join(frontWebRoot, "joints.json");

  const teachWebRoot = path.join(projectRoot, "teach_front", "web");
  const teachRawDir = path.join(teachWebRoot, "models", "raw");
  const teachJointsPath = path.join(teachWebRoot, "joints.json");

  ensureDir(frontRawDir);
  ensureDir(frontUrdfDir);
  ensureDir(teachRawDir);

  const model = parseUrdf(readText(urdfPath));
  const axisWarnings = model.joints
    .filter((joint) => vecLen(joint.axis) < 1e-10)
    .map((joint) => ({
      joint: joint.name,
      parent: joint.parent,
      child: joint.child,
      axisRaw: joint.axis
    }));
  const solved = solveWorldKinematics(model);
  const linkByName = linkByNameMap(model.links);

  const transformedMeshesByTarget = {};
  const transformedMeshByLink = {};
  Object.keys(LINK_TARGET_MAP).forEach((linkName) => {
    const target = LINK_TARGET_MAP[linkName];
    const link = linkByName.get(linkName);
    const tf = solved.linkWorld.get(linkName);
    if (!link || !tf || !link.meshFilename) return;
    const relative = parsePackageMeshPath(link.meshFilename);
    const inputPath = path.join(meshRoot, relative);
    const safeLinkName = linkName.replace(/[^a-zA-Z0-9_]/g, "_");
    const outputName = `suarmt_global_${safeLinkName}.STL`;
    const frontOut = path.join(frontRawDir, outputName);
    const teachOut = path.join(teachRawDir, outputName);
    // Front runtime uses mm-scale pivots from joints.json, so keep STL vertices in mm too.
    transformBinaryStl(inputPath, frontOut, tf.R, tf.t, 1000);
    fs.copyFileSync(frontOut, teachOut);
    if (!Array.isArray(transformedMeshesByTarget[target])) {
      transformedMeshesByTarget[target] = [];
    }
    transformedMeshesByTarget[target].push(outputName);
    transformedMeshByLink[linkName] = outputName;
  });

  const jointInfoByTarget = {};
  for (const joint of model.joints) {
    const target = targetFromLink(joint.child);
    if (!target) continue;
    if (jointInfoByTarget[target]) continue;
    const kin = solved.jointWorld.get(joint.name);
    if (!kin) continue;
    const parentTarget = targetFromLink(joint.parent) || "base";
    jointInfoByTarget[target] = {
      jointName: joint.name,
      parentLink: joint.parent,
      childLink: joint.child,
      parentTarget,
      pivotWorld: kin.pivotWorld,
      axisParent: kin.axisParent,
      axisWorld: kin.axisWorld,
      limitLower: joint.limitLower,
      limitUpper: joint.limitUpper
    };
  }

  const oldFront = readJson(frontJointsPath);
  const oldTeach = readJson(teachJointsPath);
  const nextFront = buildFrontConfig({
    oldFront,
    model,
    jointInfoByTarget,
    transformedMeshesByTarget
  });
  const nextTeach = buildTeachConfig({
    oldTeach,
    model,
    jointInfoByTarget,
    transformedMeshesByTarget
  });

  writeJson(frontJointsPath, nextFront);
  writeJson(teachJointsPath, nextTeach);

  fs.copyFileSync(urdfPath, path.join(frontUrdfDir, "SuArmT.urdf"));
  fs.copyFileSync(csvPath, path.join(frontUrdfDir, "SuArmT.csv"));

  const modelJson = {
    generatedAt: new Date().toISOString(),
    source: {
      urdf: "SuArmT/urdf/SuArmT.urdf",
      csv: "SuArmT/urdf/SuArmT.csv"
    },
    warnings: axisWarnings.map((item) => ({
      type: "invalid_axis_fallback",
      ...item,
      fallback: [0, 0, 1]
    })),
    rootLink: model.root,
    links: model.links.map((link) => {
      const tf = solved.linkWorld.get(link.name);
      return {
        name: link.name,
        target: targetFromLink(link.name),
        meshFilename: link.meshFilename,
        transformedMesh: transformedMeshByLink[link.name] || "",
        colorRgba: link.colorRgba,
        worldOriginM: tf ? roundVec(tf.t, 6) : [0, 0, 0]
      };
    }),
    joints: model.joints.map((joint) => {
      const kin = solved.jointWorld.get(joint.name);
      return {
        name: joint.name,
        type: joint.type,
        parent: joint.parent,
        child: joint.child,
        target: targetFromLink(joint.child),
        parentTarget: targetFromLink(joint.parent) || "base",
        originXyzM: roundVec(joint.originXyz, 6),
        originRpyRad: roundVec(joint.originRpy, 6),
        axisLocal: roundVec(vecNorm(joint.axis, [0, 0, 1]), 6),
        axisParent: roundVec(kin ? kin.axisParent : [0, 0, 1], 6),
        axisWorld: roundVec(kin ? kin.axisWorld : [0, 0, 1], 6),
        pivotWorldM: roundVec(kin ? kin.pivotWorld : [0, 0, 0], 6),
        limitLower: toNumber(joint.limitLower, 0),
        limitUpper: toNumber(joint.limitUpper, 0)
      };
    })
  };
  writeJson(path.join(frontUrdfDir, "suarmt_model.json"), modelJson);

  if (axisWarnings.length > 0) {
    console.warn("Axis warning: some URDF joints have zero axis and were replaced by fallback [0,0,1].");
    axisWarnings.forEach((item) => {
      console.warn(`- ${item.joint} (${item.parent} -> ${item.child}) axis=${JSON.stringify(item.axisRaw)}`);
    });
  }
  console.log("SuArmT model rebuild finished.");
  console.log(`- front joints: ${frontJointsPath}`);
  console.log(`- teach joints: ${teachJointsPath}`);
  console.log("- transformed STL prefix: suarmt_global_*.STL");
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`rebuild_model_from_suarmt failed: ${String(error?.stack || error)}`);
    process.exit(1);
  }
}
