import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function attachJointCardBehavior({
  state,
  refs,
  jointStates,
  reachableServoIds,
  lastActualIdByQueryId,
  lastVoltageById,
  lastTempById,
  funcs
}) {
  const {
    rangeInput,
    valueInput,
    timeInput,
    idInput,
    minInput,
    maxInput,
    guardMinInput,
    guardMaxInput,
    minDegInput,
    maxDegInput,
    commandScaleInput,
    axisInput,
    invertInput,
    defaultPosInput,
    pivotXInput,
    pivotYInput,
    pivotZInput,
    realtimeInput,
    showAxisBtn,
    moveBtn,
    queryBtn,
    vinBtn,
    tempBtn,
    idReadBtn,
    pivotCenterBtn
  } = refs;

  const {
    clampInt,
    clampNumber,
    normalizeCommandScale,
    estimateDefaultCommandScaleByJointRange,
    safeAxis,
    normalizePivotArray,
    normalizePivotSpace,
    normalizeJointLimits,
    clampByGuard,
    shouldRealtimeSend,
    scheduleRealtimeMove,
    enforceMotionAxisLockOnState,
    getEffectiveJointAxisDisplayName,
    applyJointPivot,
    applyJointVisual,
    sendMoveCommand,
    setSelectedJointState,
    isSelectedJointState,
    sendQueryById,
    send,
    getJointServoId,
    scheduleQueryById,
    updateJointTelemetry,
    worldToRobotLocal
  } = funcs;

  const applyRangeMapping = () => {
    state.min = clampInt(minInput.value, 0, 1000);
    state.max = clampInt(maxInput.value, 0, 1000);
    state.guardMin = clampInt(guardMinInput.value, 0, 1000);
    state.guardMax = clampInt(guardMaxInput.value, 0, 1000);
    state.defaultPos = clampInt(defaultPosInput.value, 0, 1000);

    normalizeJointLimits(state);
    state.defaultPos = clampByGuard(state, state.defaultPos);

    funcs.syncJointRangeBounds(state);
    defaultPosInput.value = String(state.defaultPos);
    applyJointVisual(state, state.currentPos, { lockClosureForSelf: true });

    if (shouldRealtimeSend(state)) {
      scheduleRealtimeMove(state);
    }
  };

  const applyKinematics = () => {
    state.minDeg = clampNumber(minDegInput.value, -360, 360, state.minDeg);
    state.maxDeg = clampNumber(maxDegInput.value, -360, 360, state.maxDeg);
    state.commandScale = normalizeCommandScale(
      commandScaleInput.value,
      estimateDefaultCommandScaleByJointRange(state.minDeg, state.maxDeg)
    );
    state.axis = safeAxis(axisInput.value);
    enforceMotionAxisLockOnState(state, { syncUi: false });
    state.invert = !!invertInput.checked;

    minDegInput.value = String(state.minDeg);
    maxDegInput.value = String(state.maxDeg);
    commandScaleInput.value = String(state.commandScale);
    axisInput.value = getEffectiveJointAxisDisplayName(state);
    applyJointVisual(state, state.currentPos, { lockClosureForSelf: true });
  };

  const applyPivotInputs = () => {
    const current = normalizePivotArray(state.pivot, [0, 0, 0]);
    const nextPivot = [
      clampNumber(pivotXInput.value, -5000, 5000, current[0]),
      clampNumber(pivotYInput.value, -5000, 5000, current[1]),
      clampNumber(pivotZInput.value, -5000, 5000, current[2])
    ];

    applyJointPivot(state, nextPivot);
    applyJointVisual(state, state.currentPos, { lockClosureForSelf: true });
  };

  rangeInput.addEventListener("input", () => {
    const v = clampByGuard(state, rangeInput.value);
    rangeInput.value = String(v);
    valueInput.value = String(v);
    applyJointVisual(state, v, { lockClosureForSelf: true });
    scheduleRealtimeMove(state);
  });

  rangeInput.addEventListener("change", () => {
    if (state.autoSendTimer) {
      clearTimeout(state.autoSendTimer);
      state.autoSendTimer = null;
    }
    if (shouldRealtimeSend(state)) {
      sendMoveCommand(state, { silentWhenClosed: true });
    }
  });

  valueInput.addEventListener("input", () => {
    const v = clampByGuard(state, valueInput.value);
    valueInput.value = String(v);
    rangeInput.value = String(v);
    applyJointVisual(state, v, { lockClosureForSelf: true });
    scheduleRealtimeMove(state);
  });

  valueInput.addEventListener("change", () => {
    if (shouldRealtimeSend(state)) {
      sendMoveCommand(state, { silentWhenClosed: true });
    }
  });

  timeInput.addEventListener("change", () => {
    timeInput.value = String(clampInt(timeInput.value, 20, 30000));
  });

  idInput.addEventListener("change", () => {
    const prevId = state.lastServoIdForPoll;
    const newId = clampInt(idInput.value, 1, 253);
    idInput.value = String(newId);
    state.lastServoIdForPoll = newId;

    if (Number.isFinite(prevId) && prevId !== newId) {
      const stillUsed = jointStates.some((s) => s !== state && getJointServoId(s) === prevId);
      if (!stillUsed) {
        reachableServoIds.delete(prevId);
      }
      lastActualIdByQueryId.delete(prevId);
      lastVoltageById.delete(prevId);
      lastTempById.delete(prevId);
    }

    updateJointTelemetry(state);
    scheduleQueryById(newId, 20);
  });

  [minInput, maxInput, guardMinInput, guardMaxInput, defaultPosInput].forEach((el) => {
    el.addEventListener("change", applyRangeMapping);
  });

  [minDegInput, maxDegInput, commandScaleInput, axisInput, invertInput].forEach((el) => {
    el.addEventListener("change", applyKinematics);
  });

  [pivotXInput, pivotYInput, pivotZInput].forEach((el) => {
    el.addEventListener("change", applyPivotInputs);
  });

  pivotCenterBtn.addEventListener("click", () => {
    const box = new THREE.Box3().setFromObject(state.meshGroup || state.targetGroup);
    if (box.isEmpty()) return;

    const centerWorld = box.getCenter(new THREE.Vector3());
    const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");
    const centerValue = pivotSpace === "local" ? worldToRobotLocal(centerWorld) : centerWorld;
    applyJointPivot(state, [centerValue.x, centerValue.y, centerValue.z]);
    applyJointVisual(state, state.currentPos, { lockClosureForSelf: true });
  });

  moveBtn.addEventListener("click", () => {
    sendMoveCommand(state, { silentWhenClosed: false });
  });

  showAxisBtn.addEventListener("click", () => {
    if (isSelectedJointState(state)) {
      setSelectedJointState(null);
      return;
    }
    setSelectedJointState(state);
  });

  queryBtn.addEventListener("click", () => {
    sendQueryById(getJointServoId(state), false);
  });

  vinBtn.addEventListener("click", () => {
    send({ type: "vin", id: getJointServoId(state) }, false);
  });

  tempBtn.addEventListener("click", () => {
    send({ type: "temp", id: getJointServoId(state) }, false);
  });

  idReadBtn.addEventListener("click", () => {
    send({ type: "id_read", id: getJointServoId(state) }, false);
  });

  realtimeInput.addEventListener("change", () => {
    state.realtimeSendEnabled = !!realtimeInput.checked;
    if (!state.realtimeSendEnabled && state.autoSendTimer) {
      clearTimeout(state.autoSendTimer);
      state.autoSendTimer = null;
    }
  });

  updateJointTelemetry(state);
}
