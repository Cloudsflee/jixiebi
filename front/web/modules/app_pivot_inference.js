import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function getStateMeshWorldBoxRaw(state) {
  if (!state) return null;
  const box = new THREE.Box3();
  if (state.meshGroup) {
    box.setFromObject(state.meshGroup);
    if (!box.isEmpty()) return box;
  }
  if (state.targetGroup) {
    box.setFromObject(state.targetGroup);
    if (!box.isEmpty()) return box;
  }
  return null;
}

export function getTargetMeshWorldBoxRaw({
  target,
  findJointStateByTarget,
  getStateMeshWorldBox,
  meshGroupsByTarget
}) {
  const state = findJointStateByTarget(target);
  if (state) return getStateMeshWorldBox(state);

  const mesh = meshGroupsByTarget?.[target];
  if (!mesh) return null;
  const box = new THREE.Box3().setFromObject(mesh);
  return box.isEmpty() ? null : box;
}

export function inferJointPivotWorldByBoxesRaw(parentBox, childBox) {
  if (!parentBox || !childBox || parentBox.isEmpty() || childBox.isEmpty()) return null;

  if (parentBox.intersectsBox(childBox)) {
    const inter = parentBox.clone().intersect(childBox);
    if (!inter.isEmpty()) {
      return inter.getCenter(new THREE.Vector3());
    }
  }

  const parentCenter = parentBox.getCenter(new THREE.Vector3());
  const childCenter = childBox.getCenter(new THREE.Vector3());
  const pOnParent = parentBox.clampPoint(childCenter, new THREE.Vector3());
  const pOnChild = childBox.clampPoint(parentCenter, new THREE.Vector3());
  return pOnParent.add(pOnChild).multiplyScalar(0.5);
}

export function maybeAutoInferAssemblyPivotsRaw({
  assemblyLockRuntime,
  robotRoot,
  toFiniteNumber,
  jointStates,
  defaultParentTargetForTarget,
  getTargetMeshWorldBox,
  getStateMeshWorldBox,
  inferJointPivotWorldByBoxes,
  getJointPivotWorldFromState,
  syncJointPivotInputs,
  log
}) {
  if (!assemblyLockRuntime.enabled || !assemblyLockRuntime.autoInferPivots) return;
  if (!robotRoot) return;
  robotRoot.updateWorldMatrix(true, true);

  const maxShift = Math.max(5, toFiniteNumber(assemblyLockRuntime.maxAutoShiftMm, 280));
  const results = [];

  for (const childState of jointStates) {
    if (!childState) continue;
    const childTarget = String(childState.target || "").trim().toLowerCase();
    if (!childTarget || childTarget === "base") continue;
    let parentTarget = String(
      childState.parentTarget || defaultParentTargetForTarget(childTarget)
    ).trim().toLowerCase();
    if (!parentTarget || parentTarget === childTarget) {
      parentTarget = defaultParentTargetForTarget(childTarget);
    }

    const parentBox = getTargetMeshWorldBox(parentTarget);
    const childBox = getStateMeshWorldBox(childState);
    const inferredWorld = inferJointPivotWorldByBoxes(parentBox, childBox);
    if (!inferredWorld) continue;

    const prevWorld = getJointPivotWorldFromState(childState);
    const shift = prevWorld ? prevWorld.distanceTo(inferredWorld) : 0;
    if (Number.isFinite(shift) && shift > maxShift) {
      results.push({
        joint: childState.name,
        target: childTarget,
        skipped: true,
        reason: "shift_too_large",
        shiftMm: Number(shift.toFixed(3)),
        limitMm: Number(maxShift.toFixed(3))
      });
      continue;
    }

    childState.pivotSpace = "world";
    childState.pivot = [inferredWorld.x, inferredWorld.y, inferredWorld.z];
    syncJointPivotInputs(childState);
    results.push({
      joint: childState.name,
      target: childTarget,
      skipped: false,
      shiftMm: Number(shift.toFixed(3)),
      pivotWorld: [
        Number(inferredWorld.x.toFixed(3)),
        Number(inferredWorld.y.toFixed(3)),
        Number(inferredWorld.z.toFixed(3))
      ]
    });
  }

  if (results.length > 0) {
    const applied = results.filter((item) => item.skipped !== true).length;
    const skipped = results.filter((item) => item.skipped === true).length;
    log("Assembly pivot auto-infer finished", {
      applied,
      skipped,
      maxShiftMm: Number(maxShift.toFixed(3)),
      details: results
    });
  }
}

export function applyConfiguredPivotsRaw({
  robotRoot,
  isPhysicalKinematicsEnabled,
  jointStates,
  normalizePivotSpace,
  toVec3,
  worldToRobotLocal,
  applyJointPivot
}) {
  if (!robotRoot) return;
  robotRoot.updateWorldMatrix(true, true);
  const physicalModeEnabled = isPhysicalKinematicsEnabled();

  jointStates.forEach((state) => {
    if (!state.pivotGroup || !state.targetGroup) return;
    const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");

    let pivotValue = null;
    if (Array.isArray(state.pivot) && state.pivot.length === 3 && state.pivot.some((n) => Number(n) !== 0)) {
      pivotValue = toVec3(state.pivot);
    } else if (!physicalModeEnabled) {
      const box = new THREE.Box3().setFromObject(state.meshGroup || state.targetGroup);
      if (!box.isEmpty()) {
        const centerWorld = box.getCenter(new THREE.Vector3());
        pivotValue = pivotSpace === "local" ? worldToRobotLocal(centerWorld) : centerWorld;
      }
    }

    if (!pivotValue) return;
    applyJointPivot(state, [pivotValue.x, pivotValue.y, pivotValue.z]);
  });
}
