import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function setAxisLineEditorGeometryRaw({
  getAxisLineEditorLine,
  getAxisLineEditorHandle,
  getAxisLineEditorPivotMarker,
  axisLineEditorLineAnchorWorld,
  getAxisLineEditorLinePinned,
  getAxisLineEditorLength,
  toFiniteNumber
}, pivotWorld, axisWorld) {
  const axisLineEditorLine = getAxisLineEditorLine();
  const axisLineEditorHandle = getAxisLineEditorHandle();
  const axisLineEditorPivotMarker = getAxisLineEditorPivotMarker();
  if (!axisLineEditorLine || !axisLineEditorHandle || !axisLineEditorPivotMarker) return;
  const normalizedAxis = axisWorld.clone();
  if (normalizedAxis.lengthSq() < 1e-10) {
    normalizedAxis.set(1, 0, 0);
  }
  normalizedAxis.normalize();
  const lineCenter = getAxisLineEditorLinePinned()
    ? axisLineEditorLineAnchorWorld
    : pivotWorld;
  const halfLen = Math.max(40, toFiniteNumber(getAxisLineEditorLength(), 150));
  const p1 = lineCenter.clone().addScaledVector(normalizedAxis, halfLen);
  const p2 = lineCenter.clone().addScaledVector(normalizedAxis, -halfLen);

  const posAttr = axisLineEditorLine.geometry.getAttribute("position");
  posAttr.setXYZ(0, p1.x, p1.y, p1.z);
  posAttr.setXYZ(1, p2.x, p2.y, p2.z);
  posAttr.needsUpdate = true;
  axisLineEditorLine.geometry.computeBoundingSphere();

  axisLineEditorHandle.position.copy(p1);
  axisLineEditorPivotMarker.position.copy(pivotWorld);
}

export function refreshAxisLineEditorFromRuntimeRaw({
  getAxisLineEditorActive,
  getAxisLineEditorGroup,
  getAxisLineEditorTarget,
  findJointStateByTarget,
  getParentAxisVectorForTarget,
  setAxisLineEditorLength,
  axisLineEditorPivotWorld,
  getAxisLineEditorLinePinned,
  axisLineEditorLineAnchorWorld,
  axisLineEditorAxisWorld,
  updateAxisLineEditorModeVisuals,
  setAxisLineEditorGeometry,
  getJointAxisDisplayLength
}) {
  const axisLineEditorGroup = getAxisLineEditorGroup();
  if (!getAxisLineEditorActive() || !axisLineEditorGroup) return;
  const target = String(getAxisLineEditorTarget() || "");
  const state = findJointStateByTarget(target);
  if (!state?.pivotGroup) {
    axisLineEditorGroup.visible = false;
    return;
  }
  const pivotWorld = state.pivotGroup.getWorldPosition(new THREE.Vector3());
  const axisParent = getParentAxisVectorForTarget(target);
  const axisWorld = new THREE.Vector3(axisParent[0], axisParent[1], axisParent[2]);
  if (state.pivotGroup.parent) {
    state.pivotGroup.parent.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion();
    state.pivotGroup.parent.getWorldQuaternion(q);
    axisWorld.applyQuaternion(q);
  }
  if (axisWorld.lengthSq() < 1e-10) {
    axisWorld.set(1, 0, 0);
  }
  axisWorld.normalize();
  setAxisLineEditorLength(getJointAxisDisplayLength(state));

  axisLineEditorPivotWorld.copy(pivotWorld);
  if (!getAxisLineEditorLinePinned()) {
    axisLineEditorLineAnchorWorld.copy(pivotWorld);
  }
  axisLineEditorAxisWorld.copy(axisWorld);
  updateAxisLineEditorModeVisuals();
  setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
  axisLineEditorGroup.visible = true;
}
