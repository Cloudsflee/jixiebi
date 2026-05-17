import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function createCoordProbeController({
  coordReadout,
  coordSpaceSelect,
  coordXInput,
  coordYInput,
  coordZInput,
  locateCoordBtn,
  usePivotBtn,
  hideCoordBtn,
  alignFrameBtn,
  getCoordProbeLastWorldPoint,
  setCoordProbeReadoutUpdater,
  buildCoordinateSpaceGuideText,
  buildCoordinateProbeReport,
  convertPointFromSpaceToWorld,
  convertPointFromWorldToSpace,
  showCoordinateProbe,
  hideCoordinateProbe,
  normalizePivotSpace,
  toVec3,
  robotLocalToWorld,
  getSelectedJointState,
  alignRobotFrameByJ1AndFront,
  clampNumber,
  log
}) {
  const getProbeInputPoint = () => new THREE.Vector3(
    clampNumber(coordXInput.value, -99999, 99999, 0),
    clampNumber(coordYInput.value, -99999, 99999, 0),
    clampNumber(coordZInput.value, -99999, 99999, 0)
  );

  const setProbeInputPoint = (vec) => {
    if (!vec) return;
    coordXInput.value = String(Number(vec.x || 0));
    coordYInput.value = String(Number(vec.y || 0));
    coordZInput.value = String(Number(vec.z || 0));
  };

  const updateCoordReadout = (
    worldPoint = getCoordProbeLastWorldPoint(),
    sourceSpace = coordSpaceSelect.value
  ) => {
    if (!worldPoint) {
      coordReadout.textContent = buildCoordinateSpaceGuideText();
      return;
    }
    coordReadout.textContent = `${buildCoordinateProbeReport(worldPoint, sourceSpace)}\n\n${buildCoordinateSpaceGuideText()}`;
  };

  const locateCoordinateProbeFromInputs = () => {
    const inputPoint = getProbeInputPoint();
    const fromSpace = coordSpaceSelect.value;
    const converted = convertPointFromSpaceToWorld(inputPoint, fromSpace);
    if (!converted.point) {
      log("Coordinate locate failed", { space: fromSpace, error: converted.error });
      coordReadout.textContent = `${buildCoordinateSpaceGuideText()}\n\nError: ${String(converted.error || "unknown error")}`;
      return;
    }

    setProbeInputPoint(inputPoint);
    showCoordinateProbe(converted.point);
    updateCoordReadout(converted.point, fromSpace);
    log("Coordinate located", { space: fromSpace, point: [inputPoint.x, inputPoint.y, inputPoint.z] });
  };

  const useSelectedPivotAsProbePoint = () => {
    const selectedJointState = getSelectedJointState();
    if (!selectedJointState) {
      log("No selected joint parent object");
      coordReadout.textContent = `${buildCoordinateSpaceGuideText()}\n\nError: no selected joint`;
      return;
    }

    const pivotSpace = normalizePivotSpace(selectedJointState.pivotSpace, "world");
    const pivotValue = toVec3(selectedJointState.pivot);
    const worldPoint = pivotSpace === "local" ? robotLocalToWorld(pivotValue) : pivotValue;
    const toSpace = coordSpaceSelect.value;
    const converted = convertPointFromWorldToSpace(worldPoint, toSpace);
    if (!converted.point) {
      log("Pivot coordinate convert failed", { space: toSpace, error: converted.error });
      coordReadout.textContent = `${buildCoordinateSpaceGuideText()}\n\nError: ${String(converted.error || "unknown error")}`;
      return;
    }

    setProbeInputPoint(converted.point);
    showCoordinateProbe(worldPoint);
    updateCoordReadout(worldPoint, toSpace);
    log("Pivot coordinate converted", {
      joint: selectedJointState.name,
      pivotSpace,
      toSpace
    });
  };

  locateCoordBtn.addEventListener("click", () => {
    locateCoordinateProbeFromInputs();
  });

  usePivotBtn.addEventListener("click", () => {
    useSelectedPivotAsProbePoint();
  });

  hideCoordBtn.addEventListener("click", () => {
    hideCoordinateProbe();
    updateCoordReadout(null, coordSpaceSelect.value);
    log("Hide coordinate probe");
  });

  alignFrameBtn.addEventListener("click", () => {
    const result = alignRobotFrameByJ1AndFront();
    if (!result?.ok) {
      log("Axis line edit apply failed", { error: String(result?.error || "unknown") });
      return;
    }
    log("Axis line updated from pick", {
      originWorld: result.originWorld,
      j1AxisWorld: result.j1AxisWorld,
      frameCalibration: result.frameCalibration,
      frontTargetUsed: result.frontTargetUsed,
      frontHorizontalLen: result.frontHorizontalLen,
      yawMethod: result.yawMethod
    });
  });

  coordSpaceSelect.addEventListener("change", () => {
    const coordProbeLastWorldPoint = getCoordProbeLastWorldPoint();
    if (coordProbeLastWorldPoint) {
      const converted = convertPointFromWorldToSpace(coordProbeLastWorldPoint, coordSpaceSelect.value);
      if (converted.point) {
        setProbeInputPoint(converted.point);
      }
    }
    updateCoordReadout(coordProbeLastWorldPoint, coordSpaceSelect.value);
  });

  [coordXInput, coordYInput, coordZInput].forEach((input) => {
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        locateCoordinateProbeFromInputs();
      }
    });
  });

  const updater = () => {
    const coordProbeLastWorldPoint = getCoordProbeLastWorldPoint();
    if (coordProbeLastWorldPoint && coordSpaceSelect.value === "selected_parent_local") {
      const converted = convertPointFromWorldToSpace(coordProbeLastWorldPoint, "selected_parent_local");
      if (converted.point) {
        setProbeInputPoint(converted.point);
      }
    }
    updateCoordReadout(coordProbeLastWorldPoint, coordSpaceSelect.value);
  };
  setCoordProbeReadoutUpdater(updater);
  updater();

  return {
    updateCoordReadout,
    setProbeInputPoint
  };
}
