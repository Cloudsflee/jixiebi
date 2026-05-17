export function createMotionCommandController({
  getExpectedQueryId,
  setExpectedQueryId,
  send,
  buildPollIdList,
  getAutoPinConstraintReady,
  getAutomaticPinConstraint,
  findJointStateByTarget,
  shouldRealtimeSend,
  getJointServoId,
  getJointPos,
  getJointTime,
  mapDesiredPosToCommandPos,
  compensateCommandPosByBacklash,
  jointStates,
  normalizeDerivedType,
  applyJointVisual
}) {
  const sendQueryById = (id, silentWhenClosed = true) => {
    setExpectedQueryId(id);
    return send({ type: "query", id }, silentWhenClosed);
  };

  const scheduleQueryById = (id, delayMs = 0) => {
    setTimeout(() => {
      sendQueryById(id, true);
    }, Math.max(0, delayMs));
  };

  const queryAllPositionsStaggered = () => {
    const ids = buildPollIdList();
    ids.forEach((id, idx) => {
      scheduleQueryById(id, idx * 80);
    });
  };

  const sendPhysicalDependentMoves = (sourceState, time, silentWhenClosed = true) => {
    const automaticPinConstraint = getAutomaticPinConstraint();
    if (!getAutoPinConstraintReady() || automaticPinConstraint?.mode !== "physical_four_bar") return;
    const sourceTarget = String(sourceState?.target || "");
    const driverTarget = String(automaticPinConstraint.driverTarget || "");
    if (!sourceTarget || sourceTarget !== driverTarget) return;

    const delay = Math.max(80, Math.min(2000, time + 80));
    const deps = Array.isArray(automaticPinConstraint.dependentTargets)
      ? automaticPinConstraint.dependentTargets
      : [];

    deps.forEach((target, idx) => {
      const depState = findJointStateByTarget(target);
      if (!depState || depState === sourceState) return;
      if (!shouldRealtimeSend(depState) && silentWhenClosed) return;

      const depId = getJointServoId(depState);
      const depDesiredPos = getJointPos(depState);
      const depScaledPos = mapDesiredPosToCommandPos(depState, depDesiredPos);
      const depPos = compensateCommandPosByBacklash(depState, depScaledPos);
      const ok = send({ type: "move", id: depId, pos: depPos, time }, silentWhenClosed);
      if (ok) {
        scheduleQueryById(depId, delay + (idx + 1) * 35);
      }
    });
  };

  const sendMoveCommand = (state, { silentWhenClosed = true } = {}) => {
    const id = getJointServoId(state);
    const desiredPos = getJointPos(state);
    const scaledPos = mapDesiredPosToCommandPos(state, desiredPos);
    const pos = compensateCommandPosByBacklash(state, scaledPos);
    const time = getJointTime(state);

    const ok = send({ type: "move", id, pos, time }, silentWhenClosed);
    if (ok) {
      const delay = Math.max(80, Math.min(2000, time + 80));
      scheduleQueryById(id, delay);
      sendPhysicalDependentMoves(state, time, silentWhenClosed);
    }
  };

  const resetArmToDefaults = ({ silentWhenClosed = false } = {}) => {
    const resetTargets = jointStates.filter((state) => {
      if (!state || state.uiHidden === true) return false;
      if (normalizeDerivedType(state.derivedType) === "offset_minus_sum") return false;
      return true;
    });

    resetTargets.forEach((state, idx) => {
      if (state.autoSendTimer) {
        clearTimeout(state.autoSendTimer);
        state.autoSendTimer = null;
      }
      applyJointVisual(state, state.defaultPos);
      const delay = idx * 95;
      setTimeout(() => sendMoveCommand(state, { silentWhenClosed }), delay);
    });

    const probeIds = buildPollIdList();
    probeIds.forEach((id, idx) => {
      const delay = resetTargets.length * 95 + idx * 70 + 200;
      setTimeout(() => send({ type: "query", id }, true), delay);
      setTimeout(() => send({ type: "vin", id }, true), delay + 20);
      setTimeout(() => send({ type: "temp", id }, true), delay + 40);
      setTimeout(() => send({ type: "id_read", id }, true), delay + 55);
    });
  };

  return {
    sendQueryById,
    scheduleQueryById,
    queryAllPositionsStaggered,
    sendPhysicalDependentMoves,
    sendMoveCommand,
    resetArmToDefaults
  };
}
