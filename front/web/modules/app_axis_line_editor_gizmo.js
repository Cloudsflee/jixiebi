import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function ensureAxisLineEditorGizmoRaw({
  getAxisLineEditorGroup,
  getScene,
  setAxisLineEditorGroup,
  setAxisLineEditorLine,
  setAxisLineEditorHandle,
  setAxisLineEditorPivotMarker,
  updateAxisLineEditorModeVisuals
}) {
  if (getAxisLineEditorGroup() || !getScene()) return;
  const axisLineEditorGroup = new THREE.Group();
  axisLineEditorGroup.visible = false;

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff6ad5,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  const axisLineEditorLine = new THREE.Line(lineGeometry, lineMaterial);
  axisLineEditorLine.renderOrder = 1300;

  const handleGeometry = new THREE.SphereGeometry(6, 20, 20);
  const handleMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3f9f,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  const axisLineEditorHandle = new THREE.Mesh(handleGeometry, handleMaterial);
  axisLineEditorHandle.renderOrder = 1301;

  const pivotGeometry = new THREE.SphereGeometry(4, 16, 16);
  const pivotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthTest: false
  });
  const axisLineEditorPivotMarker = new THREE.Mesh(pivotGeometry, pivotMaterial);
  axisLineEditorPivotMarker.renderOrder = 1302;

  axisLineEditorGroup.add(axisLineEditorLine);
  axisLineEditorGroup.add(axisLineEditorHandle);
  axisLineEditorGroup.add(axisLineEditorPivotMarker);
  getScene().add(axisLineEditorGroup);

  setAxisLineEditorGroup(axisLineEditorGroup);
  setAxisLineEditorLine(axisLineEditorLine);
  setAxisLineEditorHandle(axisLineEditorHandle);
  setAxisLineEditorPivotMarker(axisLineEditorPivotMarker);
  updateAxisLineEditorModeVisuals();
}
