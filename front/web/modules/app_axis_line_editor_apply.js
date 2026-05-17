import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function applyAxisLineEditorAxisWorldRaw({
  target,
  axisWorld,
  findJointStateByTarget,
  axisLineEditorAxisWorld,
  axisLineEditorOnAxisUpdated
}) {
  const state = findJointStateByTarget(target);
  if (!state) return false;

  const safeAxis = axisWorld.clone();
  if (safeAxis.lengthSq() < 1e-10) return false;
  safeAxis.normalize();
  axisLineEditorAxisWorld.copy(safeAxis);

  const axisParent = safeAxis.clone();
  if (state.pivotGroup?.parent) {
    state.pivotGroup.parent.updateWorldMatrix(true, false);
    const parentQ = new THREE.Quaternion();
    state.pivotGroup.parent.getWorldQuaternion(parentQ);
    axisParent.applyQuaternion(parentQ.invert());
  }
  if (axisParent.lengthSq() < 1e-10) return false;
  axisParent.normalize();

  if (typeof axisLineEditorOnAxisUpdated === "function") {
    axisLineEditorOnAxisUpdated([axisParent.x, axisParent.y, axisParent.z], target);
  }
  return true;
}

export function setAxisLineEditorPivotWorldRaw({
  target,
  pivotWorld,
  findJointStateByTarget,
  normalizePivotSpace,
  worldToRobotLocal,
  applyJointPivot,
  axisLineEditorPivotWorld,
  getAxisLineEditorLinePinned,
  axisLineEditorLineAnchorWorld
}) {
  const state = findJointStateByTarget(target);
  if (!state) return false;

  const worldPoint = pivotWorld.clone();
  const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");
  const storedPoint = pivotSpace === "local" ? worldToRobotLocal(worldPoint) : worldPoint;
  applyJointPivot(state, [storedPoint.x, storedPoint.y, storedPoint.z]);

  if (state.pivotGroup) {
    axisLineEditorPivotWorld.copy(state.pivotGroup.getWorldPosition(new THREE.Vector3()));
  } else {
    axisLineEditorPivotWorld.copy(worldPoint);
  }

  if (!getAxisLineEditorLinePinned()) {
    axisLineEditorLineAnchorWorld.copy(axisLineEditorPivotWorld);
  }
  return true;
}
