"use strict";

const fs = require("fs");
const path = require("path");

const AXIS_ANGLE_TOLERANCE_DEG = 1.0;
const LIMIT_TOLERANCE_DEG = 1e-6;
const EXPECTED_ACTIVE_TARGETS = ["j1", "j2", "j3", "j5"];
const EXPECTED_PARENT_BY_TARGET = Object.freeze({
  j1: "base",
  j2: "j1",
  j3: "j2",
  j4: "j3",
  j5: "j4",
  j6: "j4",
  j7: "j4"
});

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

function normalizeTarget(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().toUpperCase();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function axisFromLabel(label) {
  const key = String(label || "").trim().toLowerCase();
  if (key === "x") return [1, 0, 0];
  if (key === "y") return [0, 1, 0];
  if (key === "z") return [0, 0, 1];
  return null;
}

function normalizeVec3(raw) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = toFiniteNumber(raw[0], 0);
  const y = toFiniteNumber(raw[1], 0);
  const z = toFiniteNumber(raw[2], 0);
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len < 1e-9) return null;
  return [x / len, y / len, z / len];
}

function resolveAxisVector(config, joint, target) {
  const lockAxis = normalizeVec3(config?.motionLocks?.parentAxisByTarget?.[target]);
  if (lockAxis) return lockAxis;

  const axisArray = normalizeVec3(joint?.axis);
  if (axisArray) return axisArray;

  const urdfWorld = normalizeVec3(joint?.urdfAxisWorld);
  if (urdfWorld) return urdfWorld;

  const urdfParent = normalizeVec3(joint?.urdfAxisParent);
  if (urdfParent) return urdfParent;

  return axisFromLabel(joint?.axis);
}

function normalizeParentTarget(rawParent, nameToTarget) {
  const raw = String(rawParent || "").trim();
  if (!raw) return "";
  const asTarget = normalizeTarget(raw);
  if (asTarget === "base" || /^j[1-7]$/.test(asTarget)) {
    return asTarget;
  }
  const byName = nameToTarget.get(normalizeName(raw));
  return byName || "";
}

function normalizeDerivedSources(joint, nameToTarget) {
  const targets = [];

  if (Array.isArray(joint?.derivedSourceTargets)) {
    joint.derivedSourceTargets.forEach((item) => {
      const t = normalizeTarget(item);
      if (t) targets.push(t);
    });
  }

  const singleTarget = normalizeTarget(joint?.derivedSourceTarget);
  if (singleTarget) targets.push(singleTarget);

  if (Array.isArray(joint?.derivedSourceNames)) {
    joint.derivedSourceNames.forEach((name) => {
      const t = nameToTarget.get(normalizeName(name));
      if (t) targets.push(t);
    });
  }

  const singleNameTarget = nameToTarget.get(normalizeName(joint?.derivedSourceName));
  if (singleNameTarget) targets.push(singleNameTarget);

  return unique(targets);
}

function buildNameToTargetMap(config) {
  const map = new Map();
  const joints = Array.isArray(config?.joints) ? config.joints : [];
  joints.forEach((joint) => {
    const name = normalizeName(joint?.name);
    const target = normalizeTarget(joint?.target);
    if (name && target) {
      map.set(name, target);
    }
  });
  return map;
}

function defaultParentTargetForTarget(target) {
  const key = normalizeTarget(target);
  if (!key || key === "base") return "";
  if (key === "j5" || key === "j6" || key === "j7") return "j4";
  const idx = Number(key.slice(1));
  if (!Number.isFinite(idx) || idx <= 1) return "base";
  return `j${idx - 1}`;
}

function buildJointMap(config) {
  const byTarget = new Map();
  const nameToTarget = buildNameToTargetMap(config);
  const joints = Array.isArray(config?.joints) ? config.joints : [];

  joints.forEach((joint) => {
    const target = normalizeTarget(joint?.target);
    if (!target) return;

    const parentTarget =
      normalizeParentTarget(joint?.parentTarget, nameToTarget)
      || normalizeParentTarget(joint?.parent, nameToTarget)
      || defaultParentTargetForTarget(target);

    byTarget.set(target, {
      name: String(joint?.name || ""),
      target,
      parentTarget,
      uiHidden: joint?.uiHidden === true,
      controlRole: String(joint?.controlRole || "").trim().toLowerCase(),
      derivedType: String(joint?.derivedType || "").trim().toLowerCase(),
      derivedSources: normalizeDerivedSources(joint, nameToTarget),
      minDeg: toFiniteNumber(joint?.minDeg, 0),
      maxDeg: toFiniteNumber(joint?.maxDeg, 0),
      axis: normalizeVec3(resolveAxisVector(config, joint, target))
    });
  });

  return byTarget;
}

function normalizeActiveTargets(jointMap) {
  const active = [];
  jointMap.forEach((joint, target) => {
    if (joint.controlRole === "active" && joint.uiHidden !== true) {
      active.push(target);
    }
  });
  return active.sort();
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
}

function compareLimits(a, b) {
  return (
    Math.abs(toFiniteNumber(a?.minDeg, 0) - toFiniteNumber(b?.minDeg, 0)) <= LIMIT_TOLERANCE_DEG
    && Math.abs(toFiniteNumber(a?.maxDeg, 0) - toFiniteNumber(b?.maxDeg, 0)) <= LIMIT_TOLERANCE_DEG
  );
}

function compareAxisDeg(a, b) {
  const av = normalizeVec3(a);
  const bv = normalizeVec3(b);
  if (!av || !bv) return Number.POSITIVE_INFINITY;
  const dot = clamp(av[0] * bv[0] + av[1] * bv[1] + av[2] * bv[2], -1, 1);
  return Math.acos(dot) * (180 / Math.PI);
}

function run(frontFile, teachFile) {
  const frontConfig = readJson(frontFile);
  const teachConfig = readJson(teachFile);

  const frontMap = buildJointMap(frontConfig);
  const teachMap = buildJointMap(teachConfig);
  const errors = [];
  const notes = [];

  const targetsToCheck = ["j1", "j2", "j3", "j4", "j5", "j6", "j7"];
  targetsToCheck.forEach((target) => {
    if (!frontMap.has(target)) errors.push(`front missing target '${target}'`);
    if (!teachMap.has(target)) errors.push(`teach_front missing target '${target}'`);
  });

  const frontActive = normalizeActiveTargets(frontMap);
  const teachActive = normalizeActiveTargets(teachMap);
  const expectedActive = EXPECTED_ACTIVE_TARGETS.slice().sort();
  if (!sameSet(frontActive, expectedActive)) {
    errors.push(`front active controls mismatch: got [${frontActive.join(", ")}], expected [${expectedActive.join(", ")}]`);
  }
  if (!sameSet(teachActive, expectedActive)) {
    errors.push(`teach_front active controls mismatch: got [${teachActive.join(", ")}], expected [${expectedActive.join(", ")}]`);
  }

  Object.entries(EXPECTED_PARENT_BY_TARGET).forEach(([target, expectedParent]) => {
    const front = frontMap.get(target);
    const teach = teachMap.get(target);
    if (front && front.parentTarget !== expectedParent) {
      errors.push(`front parent mismatch for ${target}: got '${front.parentTarget}', expected '${expectedParent}'`);
    }
    if (teach && teach.parentTarget !== expectedParent) {
      errors.push(`teach_front parent mismatch for ${target}: got '${teach.parentTarget}', expected '${expectedParent}'`);
    }
  });

  const j4Front = frontMap.get("j4");
  const j4Teach = teachMap.get("j4");
  const expectedJ4Sources = ["j2", "j3"];
  if (j4Front) {
    if (j4Front.derivedType !== "offset_minus_sum") {
      errors.push(`front j4 derivedType mismatch: got '${j4Front.derivedType}', expected 'offset_minus_sum'`);
    }
    if (!sameSet(j4Front.derivedSources.sort(), expectedJ4Sources)) {
      errors.push(`front j4 derived sources mismatch: got [${j4Front.derivedSources.join(", ")}], expected [${expectedJ4Sources.join(", ")}]`);
    }
  }
  if (j4Teach) {
    if (j4Teach.derivedType !== "offset_minus_sum") {
      errors.push(`teach_front j4 derivedType mismatch: got '${j4Teach.derivedType}', expected 'offset_minus_sum'`);
    }
    if (!sameSet(j4Teach.derivedSources.sort(), expectedJ4Sources)) {
      errors.push(`teach_front j4 derived sources mismatch: got [${j4Teach.derivedSources.join(", ")}], expected [${expectedJ4Sources.join(", ")}]`);
    }
  }

  ["j6", "j7"].forEach((target) => {
    const front = frontMap.get(target);
    const teach = teachMap.get(target);
    if (front) {
      if (front.derivedType !== "follow") {
        errors.push(`front ${target} derivedType mismatch: got '${front.derivedType}', expected 'follow'`);
      }
      if (!front.derivedSources.includes("j5")) {
        errors.push(`front ${target} derived source mismatch: expected to include 'j5'`);
      }
    }
    if (teach) {
      if (teach.derivedType !== "follow") {
        errors.push(`teach_front ${target} derivedType mismatch: got '${teach.derivedType}', expected 'follow'`);
      }
      if (!teach.derivedSources.includes("j5")) {
        errors.push(`teach_front ${target} derived source mismatch: expected to include 'j5'`);
      }
    }
  });

  targetsToCheck.forEach((target) => {
    const front = frontMap.get(target);
    const teach = teachMap.get(target);
    if (!front || !teach) return;

    if (!compareLimits(front, teach)) {
      errors.push(
        `limit mismatch ${target}: front[min=${front.minDeg}, max=${front.maxDeg}] vs teach[min=${teach.minDeg}, max=${teach.maxDeg}]`
      );
    }

    const axisAngleDiff = compareAxisDeg(front.axis, teach.axis);
    if (!Number.isFinite(axisAngleDiff)) {
      errors.push(`axis unavailable for ${target}: front=${JSON.stringify(front.axis)} teach=${JSON.stringify(teach.axis)}`);
      return;
    }
    if (axisAngleDiff > AXIS_ANGLE_TOLERANCE_DEG) {
      errors.push(`axis mismatch ${target}: angle diff=${axisAngleDiff.toFixed(4)}deg (tol=${AXIS_ANGLE_TOLERANCE_DEG}deg)`);
    } else if (axisAngleDiff > 0.05) {
      notes.push(`axis tiny drift ${target}: diff=${axisAngleDiff.toFixed(4)}deg`);
    }
  });

  if (errors.length > 0) {
    console.error("Structure sync check FAILED:");
    errors.forEach((line) => console.error(`- ${line}`));
    process.exit(1);
  }

  console.log("Structure sync check PASSED.");
  console.log(`- active controls: [${frontActive.join(", ")}]`);
  console.log(`- checked targets: ${targetsToCheck.join(", ")}`);
  if (notes.length > 0) {
    console.log("- notes:");
    notes.forEach((line) => console.log(`  * ${line}`));
  }
}

function main() {
  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const frontFile = process.argv[2] || path.join(projectRoot, "front", "web", "joints.json");
  const teachFile = process.argv[3] || path.join(projectRoot, "teach_front", "web", "joints.json");
  run(frontFile, teachFile);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`check_structure_sync failed: ${String(error?.stack || error)}`);
    process.exit(1);
  }
}

