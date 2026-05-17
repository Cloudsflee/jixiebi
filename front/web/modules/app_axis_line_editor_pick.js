import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function pickAxisLineFromPointerEventRaw({
  getAxisLineEditorActive,
  getCamera,
  getAxisLineEditorTargetState,
  getAxisLineEditorNdcFromEvent,
  axisLineEditorPointer,
  axisLineEditorRaycaster,
  collectAxisLineEditorPickMeshes,
  log,
  getAxisLineEditorWorldNormalFromHit,
  axisLineEditorLineAnchorWorld,
  setAxisLineEditorPivotWorld,
  applyAxisLineEditorAxisWorld,
  setAxisLineEditorGeometry,
  axisLineEditorPivotWorld,
  axisLineEditorAxisWorld,
  showCoordinateProbe,
  updateCoordReadout
}, evt) {
  if (!getAxisLineEditorActive() || !getCamera()) return false;
  const { target, state } = getAxisLineEditorTargetState();
  if (!state) return false;

  const ndc = getAxisLineEditorNdcFromEvent(evt);
  if (!ndc) return false;
  axisLineEditorPointer.set(ndc.x, ndc.y);
  axisLineEditorRaycaster.setFromCamera(axisLineEditorPointer, getCamera());

  const candidates = collectAxisLineEditorPickMeshes(target);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    log("Axis pick failed: no mesh candidate", { target });
    return false;
  }

  const hit = axisLineEditorRaycaster.intersectObjects(candidates, true)?.[0] || null;
  if (!hit?.point) {
    return false;
  }

  const outward = getAxisLineEditorWorldNormalFromHit(hit);
  const inward = outward
    ? outward.multiplyScalar(-1)
    : getCamera().getWorldDirection(new THREE.Vector3()).multiplyScalar(-1);
  if (inward.lengthSq() < 1e-10) {
    inward.set(1, 0, 0);
  }
  inward.normalize();

  axisLineEditorLineAnchorWorld.copy(hit.point);
  if (!setAxisLineEditorPivotWorld(target, hit.point)) {
    return false;
  }
  applyAxisLineEditorAxisWorld(target, inward);
  setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);

  showCoordinateProbe(axisLineEditorPivotWorld);
  if (typeof updateCoordReadout === "function") {
    updateCoordReadout(axisLineEditorPivotWorld, "world");
  }
  log("Axis generated from point pick (outside->inside)", {
    target,
    pivotWorld: [
      Number(axisLineEditorPivotWorld.x.toFixed(3)),
      Number(axisLineEditorPivotWorld.y.toFixed(3)),
      Number(axisLineEditorPivotWorld.z.toFixed(3))
    ],
    axisWorld: [
      Number(axisLineEditorAxisWorld.x.toFixed(4)),
      Number(axisLineEditorAxisWorld.y.toFixed(4)),
      Number(axisLineEditorAxisWorld.z.toFixed(4))
    ]
  });
  return true;
}
