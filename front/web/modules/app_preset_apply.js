export function applyPresetGlobalSettingsRaw({
  preset,
  ui,
  getPositionPollIntervalMs,
  getSliderAutoSendDelayMs,
  getGlobalRealtimeSendEnabled,
  setPositionPollIntervalMs,
  setSliderAutoSendDelayMs,
  setGlobalRealtimeSendEnabled,
  clampInt,
  jointStates,
  restartPositionPolling
}) {
  if (!preset || typeof preset !== "object") return;
  const global = preset.global;
  if (!global || typeof global !== "object") return;

  const nextPoll = clampInt(global.positionPollIntervalMs ?? getPositionPollIntervalMs(), 100, 3000);
  const nextDelay = clampInt(global.sliderAutoSendDelayMs ?? getSliderAutoSendDelayMs(), 20, 1200);
  const nextRealtime = global.globalRealtimeSendEnabled !== undefined
    ? Boolean(global.globalRealtimeSendEnabled)
    : getGlobalRealtimeSendEnabled();

  setPositionPollIntervalMs(nextPoll);
  setSliderAutoSendDelayMs(nextDelay);
  setGlobalRealtimeSendEnabled(nextRealtime);

  if (ui?.pollInput) ui.pollInput.value = String(nextPoll);
  if (ui?.delayInput) ui.delayInput.value = String(nextDelay);
  if (ui?.globalRealtimeInput) ui.globalRealtimeInput.checked = !!nextRealtime;

  if (!nextRealtime) {
    jointStates.forEach((state) => {
      if (state.autoSendTimer) {
        clearTimeout(state.autoSendTimer);
        state.autoSendTimer = null;
      }
    });
  }

  restartPositionPolling();
}

export function applyPresetJointToStateRaw({
  state,
  presetJoint,
  defaultParentTargetForTarget,
  clampInt,
  clampNumber,
  normalizeCommandScale,
  estimateDefaultCommandScaleByJointRange,
  safeAxis,
  enforceMotionAxisLockOnState,
  cloneServoMapPoints,
  normalizeBacklashConfig,
  normalizePivotSpace,
  toFiniteNumber,
  normalizePivotArray,
  normalizeJointLimits,
  clampByGuard,
  getEffectiveJointAxisDisplayName,
  syncJointPivotInputs,
  syncJointRangeBounds,
  applyJointPivot,
  applyJointVisual,
  jointStates,
  getJointServoId,
  reachableServoIds,
  lastActualIdByQueryId,
  lastVoltageById,
  lastTempById
}) {
  if (!state || !presetJoint || typeof presetJoint !== "object") return;

  const oldId = state.lastServoIdForPoll;

  state.parentTarget = String(
    presetJoint.parentTarget ?? state.parentTarget ?? defaultParentTargetForTarget(state.target)
  ).trim().toLowerCase();
  state.servoId = clampInt(presetJoint.servoId ?? state.servoId, 1, 253);
  state.lastServoIdForPoll = state.servoId;
  state.min = clampInt(presetJoint.min ?? state.min, 0, 1000);
  state.max = clampInt(presetJoint.max ?? state.max, 0, 1000);
  state.guardMin = clampInt(presetJoint.guardMin ?? state.guardMin, 0, 1000);
  state.guardMax = clampInt(presetJoint.guardMax ?? state.guardMax, 0, 1000);
  state.minDeg = clampNumber(presetJoint.minDeg ?? state.minDeg, -360, 360, state.minDeg);
  state.maxDeg = clampNumber(presetJoint.maxDeg ?? state.maxDeg, -360, 360, state.maxDeg);
  state.commandScale = normalizeCommandScale(
    presetJoint.commandScale ?? state.commandScale,
    estimateDefaultCommandScaleByJointRange(
      presetJoint.minDeg ?? state.minDeg,
      presetJoint.maxDeg ?? state.maxDeg
    )
  );
  state.axis = safeAxis(presetJoint.axis ?? state.axis);
  enforceMotionAxisLockOnState(state, { syncUi: false });
  state.invert = Boolean(presetJoint.invert ?? state.invert);
  state.servoMapPoints = cloneServoMapPoints(
    presetJoint.servoMapPoints ?? presetJoint.angleMap ?? state.servoMapPoints,
    state
  );
  state.backlash = normalizeBacklashConfig(presetJoint.backlash ?? state.backlash);
  state.pivotSpace = normalizePivotSpace(presetJoint.pivotSpace, state.pivotSpace || "world");
  state.closureEnabled = presetJoint.closureEnabled !== undefined
    ? Boolean(presetJoint.closureEnabled)
    : state.closureEnabled === true;
  state.closureParentTarget = presetJoint.closureParentTarget !== undefined
    ? String(presetJoint.closureParentTarget || "")
    : String(state.closureParentTarget || "");
  state.closureGain = toFiniteNumber(
    presetJoint.closureGain ?? state.closureGain,
    toFiniteNumber(state.closureGain, 1)
  );
  state.closureMaxDeg = toFiniteNumber(
    presetJoint.closureMaxDeg ?? state.closureMaxDeg,
    toFiniteNumber(state.closureMaxDeg, 0)
  );
  state.closureOffsetDeg = toFiniteNumber(
    presetJoint.closureOffsetDeg ?? state.closureOffsetDeg,
    toFiniteNumber(state.closureOffsetDeg, 0)
  );
  state.closureInvert = presetJoint.closureInvert !== undefined
    ? Boolean(presetJoint.closureInvert)
    : state.closureInvert === true;
  state.defaultPos = clampInt(presetJoint.defaultPos ?? state.defaultPos, 0, 1000);
  state.defaultTime = clampInt(presetJoint.moveTime ?? presetJoint.defaultTime ?? state.defaultTime, 20, 30000);
  state.realtimeSendEnabled = presetJoint.realtimeSendEnabled !== undefined
    ? Boolean(presetJoint.realtimeSendEnabled)
    : state.realtimeSendEnabled;
  state.pivot = normalizePivotArray(presetJoint.pivot, state.pivot);
  state.lastCommandBasePos = null;
  state.lastCommandDir = 0;
  state.lastCommandSentPos = null;

  normalizeJointLimits(state);
  state.defaultPos = clampByGuard(state, state.defaultPos);
  const pos = clampByGuard(state, presetJoint.currentPos ?? presetJoint.pos ?? state.currentPos);

  if (state.idInput) state.idInput.value = String(state.servoId);
  if (state.timeInput) state.timeInput.value = String(state.defaultTime);
  if (state.minInput) state.minInput.value = String(state.min);
  if (state.maxInput) state.maxInput.value = String(state.max);
  if (state.guardMinInput) state.guardMinInput.value = String(state.guardMin);
  if (state.guardMaxInput) state.guardMaxInput.value = String(state.guardMax);
  if (state.minDegInput) state.minDegInput.value = String(state.minDeg);
  if (state.maxDegInput) state.maxDegInput.value = String(state.maxDeg);
  if (state.commandScaleInput) state.commandScaleInput.value = String(state.commandScale);
  if (state.axisInput) state.axisInput.value = getEffectiveJointAxisDisplayName(state);
  if (state.invertInput) state.invertInput.checked = !!state.invert;
  if (state.defaultPosInput) state.defaultPosInput.value = String(state.defaultPos);
  if (state.realtimeInput) state.realtimeInput.checked = !!state.realtimeSendEnabled;
  syncJointPivotInputs(state);

  syncJointRangeBounds(state);
  applyJointPivot(state, state.pivot);
  applyJointVisual(state, pos);

  if (Number.isFinite(oldId) && oldId !== state.servoId) {
    const oldStillUsed = jointStates.some((s) => s !== state && getJointServoId(s) === oldId);
    if (!oldStillUsed) {
      reachableServoIds.delete(oldId);
      lastActualIdByQueryId.delete(oldId);
      lastVoltageById.delete(oldId);
      lastTempById.delete(oldId);
    }
  }
}
