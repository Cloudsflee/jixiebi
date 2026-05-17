import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function bindAxisLineEditorPointerEventsRaw({
  rendererDom,
  setAxisLineEditorBoundDom,
  getAxisLineEditorBoundDom,
  getAxisLineEditorActive,
  getCamera,
  getAxisLineEditorMode,
  getAxisLineEditorDragging,
  pickAxisLineFromPointerEvent,
  getAxisLineEditorPivotMarker,
  getAxisLineEditorHandle,
  getAxisLineEditorNdcFromEvent,
  axisLineEditorPointer,
  axisLineEditorRaycaster,
  setAxisLineEditorDragging,
  setAxisLineEditorDragKind,
  getAxisLineEditorDragKind,
  axisLineEditorDragAxisWorld,
  axisLineEditorAxisWorld,
  getAxisLineEditorLinePinned,
  axisLineEditorLineAnchorWorld,
  axisLineEditorPivotWorld,
  axisLineEditorDragLinePointWorld,
  axisLineEditorDragPlane,
  syncAxisLineEditorControlState,
  notifyAxisLineEditorState,
  getAxisLineEditorTargetState,
  setAxisLineEditorPivotWorld,
  setAxisLineEditorGeometry,
  applyAxisLineEditorAxisWorld
}) {
  if (!rendererDom) return;
  if (getAxisLineEditorBoundDom() === rendererDom) return;

  const onPointerDown = (evt) => {
    if (!getAxisLineEditorActive() || !getCamera()) return;

    if (getAxisLineEditorMode() === "pick") {
      const picked = pickAxisLineFromPointerEvent(evt);
      if (picked) {
        evt.preventDefault();
        evt.stopPropagation();
      }
      return;
    }

    const dragObject = getAxisLineEditorMode() === "pivot_slide"
      ? getAxisLineEditorPivotMarker()
      : getAxisLineEditorHandle();
    if (!dragObject) return;

    const ndc = getAxisLineEditorNdcFromEvent(evt);
    if (!ndc) return;
    axisLineEditorPointer.set(ndc.x, ndc.y);
    axisLineEditorRaycaster.setFromCamera(axisLineEditorPointer, getCamera());
    const hit = axisLineEditorRaycaster.intersectObject(dragObject, true);
    if (!hit || hit.length === 0) return;

    setAxisLineEditorDragging(true);
    setAxisLineEditorDragKind(getAxisLineEditorMode() === "pivot_slide" ? "pivot" : "direction");
    if (getAxisLineEditorDragKind() === "pivot") {
      axisLineEditorDragAxisWorld.copy(axisLineEditorAxisWorld);
      if (axisLineEditorDragAxisWorld.lengthSq() < 1e-10) {
        axisLineEditorDragAxisWorld.set(1, 0, 0);
      }
      axisLineEditorDragAxisWorld.normalize();
      axisLineEditorDragLinePointWorld.copy(
        getAxisLineEditorLinePinned() ? axisLineEditorLineAnchorWorld : axisLineEditorPivotWorld
      );

      const cameraDir = getCamera().getWorldDirection(new THREE.Vector3()).normalize();
      const planeNormal = new THREE.Vector3().crossVectors(cameraDir, axisLineEditorDragAxisWorld);
      if (planeNormal.lengthSq() < 1e-10) {
        planeNormal.crossVectors(new THREE.Vector3(0, 1, 0), axisLineEditorDragAxisWorld);
      }
      if (planeNormal.lengthSq() < 1e-10) {
        planeNormal.crossVectors(new THREE.Vector3(1, 0, 0), axisLineEditorDragAxisWorld);
      }
      if (planeNormal.lengthSq() < 1e-10) {
        planeNormal.set(0, 0, 1);
      }
      planeNormal.normalize();
      axisLineEditorDragPlane.setFromNormalAndCoplanarPoint(planeNormal, axisLineEditorDragLinePointWorld);
    }

    syncAxisLineEditorControlState();
    notifyAxisLineEditorState();
    try { rendererDom.setPointerCapture(evt.pointerId); } catch {}
    evt.preventDefault();
    evt.stopPropagation();
  };

  const onPointerMove = (evt) => {
    if (!getAxisLineEditorActive() || !getAxisLineEditorDragging() || !getCamera()) return;
    const ndc = getAxisLineEditorNdcFromEvent(evt);
    if (!ndc) return;
    axisLineEditorPointer.set(ndc.x, ndc.y);
    axisLineEditorRaycaster.setFromCamera(axisLineEditorPointer, getCamera());

    const { target, state } = getAxisLineEditorTargetState();
    if (!state) return;

    if (getAxisLineEditorDragKind() === "pivot") {
      const hitWorld = new THREE.Vector3();
      const ok = axisLineEditorRaycaster.ray.intersectPlane(axisLineEditorDragPlane, hitWorld);
      if (!ok) return;

      const t = hitWorld.clone().sub(axisLineEditorDragLinePointWorld).dot(axisLineEditorDragAxisWorld);
      const projected = axisLineEditorDragLinePointWorld.clone().addScaledVector(axisLineEditorDragAxisWorld, t);
      if (!setAxisLineEditorPivotWorld(target, projected)) return;
      setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
      evt.preventDefault();
      return;
    }

    const planeNormal = getCamera().getWorldDirection(new THREE.Vector3()).normalize();
    const linePoint = getAxisLineEditorLinePinned() ? axisLineEditorLineAnchorWorld : axisLineEditorPivotWorld;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, linePoint);
    const hitWorld = new THREE.Vector3();
    const ok = axisLineEditorRaycaster.ray.intersectPlane(plane, hitWorld);
    if (!ok) return;

    const axisWorld = hitWorld.sub(linePoint);
    if (axisWorld.lengthSq() < 1e-10) return;
    axisWorld.normalize();
    axisLineEditorAxisWorld.copy(axisWorld);
    setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);

    applyAxisLineEditorAxisWorld(target, axisWorld);
    evt.preventDefault();
  };

  const endDrag = (evt) => {
    if (!getAxisLineEditorDragKind()) return;
    setAxisLineEditorDragging(false);
    setAxisLineEditorDragKind("");
    syncAxisLineEditorControlState();
    notifyAxisLineEditorState();
    try { rendererDom.releasePointerCapture(evt.pointerId); } catch {}
  };

  rendererDom.addEventListener("pointerdown", onPointerDown);
  rendererDom.addEventListener("pointermove", onPointerMove);
  rendererDom.addEventListener("pointerup", endDrag);
  rendererDom.addEventListener("pointercancel", endDrag);
  setAxisLineEditorBoundDom(rendererDom);
}
