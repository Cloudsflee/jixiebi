import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function alignRobotFrameByJ1AndFrontRaw({
  displayRoot,
  robotRoot,
  resolveFrameCalibrationConfig,
  findJointStateByTarget,
  getJointAxisWorld,
  normalizePivotSpace,
  syncJointPivotInputs,
  loadedJointConfig,
  jointStates,
  findConfigJointIndex,
  normalizePivotArray,
  updateAxisHelperFromSelectedJoint,
  fitCameraToObject
}, options = {}) {
  if (!displayRoot || !robotRoot) {
    return { ok: false, error: "displayRoot/robotRoot not ready" };
  }
  const calibration = resolveFrameCalibrationConfig(options);
  if (!calibration.enabled) {
    return { ok: false, error: "frame calibration disabled" };
  }

  const j1State = findJointStateByTarget(calibration.upTarget);
  if (!j1State?.pivotGroup) {
    return { ok: false, error: `up target pivot group not ready: ${calibration.upTarget}` };
  }

  const worldUp = new THREE.Vector3(0, 1, 0);
  const applyWorldRotationOnDisplayRoot = (quat) => {
    if (!quat) return;
    displayRoot.quaternion.premultiply(quat);
    displayRoot.position.applyQuaternion(quat);
  };

  robotRoot.updateWorldMatrix(true, true);
  let j1AxisWorld = getJointAxisWorld(j1State);
  if (!j1AxisWorld || j1AxisWorld.lengthSq() < 1e-10) {
    return { ok: false, error: "J1 axis invalid" };
  }
  j1AxisWorld.normalize();

  const qAlignUp = new THREE.Quaternion().setFromUnitVectors(j1AxisWorld, worldUp);
  applyWorldRotationOnDisplayRoot(qAlignUp);

  robotRoot.updateWorldMatrix(true, true);
  const j1PivotAfterUp = j1State.pivotGroup.getWorldPosition(new THREE.Vector3());
  const frontTargetCandidates = calibration.useDynamicFallback
    ? [calibration.frontTarget, "j4", "j3", "j2"]
    : [calibration.frontTarget];
  let usedFrontTarget = "";
  let usedFrontHorizontalLen = 0;
  let usedFrontYawDeg = 0;
  let usedYawMethod = "";
  const minHorizontalLenForYaw = calibration.minFrontBaselineMm;

  for (const candidate of frontTargetCandidates) {
    const target = String(candidate || "").trim().toLowerCase();
    if (!target) continue;
    const state = findJointStateByTarget(target);
    const pivot = state?.pivotGroup
      ? state.pivotGroup.getWorldPosition(new THREE.Vector3())
      : null;
    if (!pivot) continue;

    const frontDir = pivot.clone().sub(j1PivotAfterUp);
    frontDir.y = 0;
    const horizontalLen = frontDir.length();
    if (!Number.isFinite(horizontalLen) || horizontalLen < minHorizontalLenForYaw) {
      continue;
    }

    frontDir.normalize();
    const targetFront = calibration.frontAxisWorld.clone().setY(0).normalize();
    if (targetFront.lengthSq() < 1e-8) continue;
    const qYaw = new THREE.Quaternion().setFromUnitVectors(frontDir, targetFront);
    applyWorldRotationOnDisplayRoot(qYaw);
    if (Math.abs(calibration.yawOffsetDeg) > 1e-9) {
      const qOffset = new THREE.Quaternion().setFromAxisAngle(
        worldUp,
        THREE.MathUtils.degToRad(calibration.yawOffsetDeg)
      );
      applyWorldRotationOnDisplayRoot(qOffset);
    }

    usedFrontTarget = target;
    usedFrontHorizontalLen = horizontalLen;
    usedFrontYawDeg = THREE.MathUtils.radToDeg(Math.atan2(frontDir.x, frontDir.z));
    usedYawMethod = "fixed_front_axis";
    break;
  }

  robotRoot.updateWorldMatrix(true, true);
  const j1Pivot = j1State.pivotGroup.getWorldPosition(new THREE.Vector3());
  j1AxisWorld = getJointAxisWorld(j1State);
  if (!j1AxisWorld || j1AxisWorld.lengthSq() < 1e-10) {
    return { ok: false, error: "J1 axis invalid after align" };
  }
  j1AxisWorld.normalize();
  let originWorld;
  if (Math.abs(j1AxisWorld.y) > 1e-8) {
    const t = -j1Pivot.y / j1AxisWorld.y;
    originWorld = j1Pivot.clone().addScaledVector(j1AxisWorld, t);
  } else {
    originWorld = j1Pivot.clone();
    originWorld.y = 0;
  }
  displayRoot.position.sub(originWorld);

  robotRoot.updateWorldMatrix(true, true);
  jointStates.forEach((state) => {
    if (!state?.pivotGroup) return;
    if (normalizePivotSpace(state.pivotSpace, "world") !== "world") return;
    const p = state.pivotGroup.getWorldPosition(new THREE.Vector3());
    state.pivot = [p.x, p.y, p.z];
    syncJointPivotInputs(state);
  });

  if (Array.isArray(loadedJointConfig?.joints)) {
    jointStates.forEach((state) => {
      if (normalizePivotSpace(state.pivotSpace, "world") !== "world") return;
      const idx = findConfigJointIndex(loadedJointConfig.joints, state);
      if (idx < 0) return;
      loadedJointConfig.joints[idx].pivotSpace = "world";
      loadedJointConfig.joints[idx].pivot = normalizePivotArray(state.pivot, [0, 0, 0]);
    });
  }

  updateAxisHelperFromSelectedJoint();
  fitCameraToObject(displayRoot);
  return {
    ok: true,
    originWorld: [0, 0, 0],
    j1AxisWorld: [j1AxisWorld.x, j1AxisWorld.y, j1AxisWorld.z],
    frameCalibration: calibration,
    frontTargetUsed: usedFrontTarget || "",
    frontHorizontalLen: Number(usedFrontHorizontalLen.toFixed(3)),
    frontYawDeg: Number(usedFrontYawDeg.toFixed(3)),
    yawMethod: usedYawMethod || "none"
  };
}
