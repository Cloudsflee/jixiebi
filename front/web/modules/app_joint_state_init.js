export function initJointStatesRaw({
  config,
  jointStates,
  reachableServoIds,
  noPosMuteUntilById,
  lastActualIdByQueryId,
  lastVoltageById,
  lastTempById,
  setExpectedQueryId,
  normalizePivotSpace,
  toRobotLocalFromConfigPoint,
  parseOptionalVec3,
  defaultParentTargetForTarget,
  normalizeDerivedType,
  toFiniteNumber,
  clampInt,
  safeAxis,
  normalizeCommandScale,
  estimateDefaultCommandScaleByJointRange,
  normalizeBacklashConfig,
  normalizeJointLimits,
  enforceMotionAxisLockOnState,
  parseServoMapPoints,
  normalizePivotArray,
  clampByGuard,
  pivotsByTarget,
  groupsByTarget,
  meshGroupsByTarget
}) {
  jointStates.length = 0;
  reachableServoIds.clear();
  noPosMuteUntilById.clear();
  lastActualIdByQueryId.clear();
  lastVoltageById.clear();
  lastTempById.clear();
  setExpectedQueryId(null);

  const configPivotSpace = normalizePivotSpace(config?.pivotSpace, "world");
  const physicalPivotByTarget = new Map();
  const physicalRaw = config?.physicalKinematics;
  if (physicalRaw && typeof physicalRaw === "object") {
    const pointSpace = String(physicalRaw.space || "robot_local").trim().toLowerCase();
    const jointsRaw = physicalRaw.joints && typeof physicalRaw.joints === "object" ? physicalRaw.joints : {};
    Object.keys(jointsRaw).forEach((key) => {
      const jointRaw = jointsRaw[key];
      if (!jointRaw || typeof jointRaw !== "object") return;
      const target = String(jointRaw.target || key || "");
      if (!target) return;
      const pivotLocal = toRobotLocalFromConfigPoint(jointRaw.pivot, pointSpace);
      if (!pivotLocal) return;
      physicalPivotByTarget.set(target, [pivotLocal.x, pivotLocal.y, pivotLocal.z]);
    });
  }

  for (const joint of config.joints) {
    const target = String(joint.target || "");
    const legacyPivot = parseOptionalVec3(joint.pivot);
    const physicalPivot = physicalPivotByTarget.get(target) || null;
    const pivotValue = legacyPivot || physicalPivot || [0, 0, 0];
    const state = {
      name: String(joint.name || `J${jointStates.length + 1}`),
      target,
      parentTarget: String(joint.parentTarget || defaultParentTargetForTarget(target)).trim().toLowerCase(),
      uiHidden: joint.uiHidden === true,
      controlRole: String(joint.controlRole || ""),
      derivedType: normalizeDerivedType(joint.derivedType),
      derivedSourceTarget: String(joint.derivedSourceTarget || "").trim().toLowerCase(),
      derivedSourceTargets: Array.isArray(joint.derivedSourceTargets)
        ? joint.derivedSourceTargets.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean)
        : [],
      derivedGain: toFiniteNumber(joint.derivedGain, 1),
      derivedOffsetDeg: toFiniteNumber(joint.derivedOffsetDeg, 0),
      servoId: clampInt(joint.servoId ?? (jointStates.length + 1), 1, 253),
      pivotSpace: normalizePivotSpace(joint.pivotSpace, configPivotSpace),
      closureEnabled: joint.closureEnabled === true,
      closureParentTarget: String(joint.closureParentTarget || ""),
      closureGain: toFiniteNumber(joint.closureGain, 1),
      closureMaxDeg: toFiniteNumber(joint.closureMaxDeg, 0),
      closureOffsetDeg: toFiniteNumber(joint.closureOffsetDeg, 0),
      closureInvert: joint.closureInvert === true,
      axis: safeAxis(joint.axis || "z"),
      invert: Boolean(joint.invert),
      min: clampInt(joint.min ?? 0, 0, 1000),
      max: clampInt(joint.max ?? 1000, 0, 1000),
      guardMin: clampInt(joint.guardMin ?? (joint.min ?? 0), 0, 1000),
      guardMax: clampInt(joint.guardMax ?? (joint.max ?? 1000), 0, 1000),
      minDeg: Number(joint.minDeg ?? -90),
      maxDeg: Number(joint.maxDeg ?? 90),
      commandScale: normalizeCommandScale(
        joint.commandScale,
        estimateDefaultCommandScaleByJointRange(joint.minDeg ?? -90, joint.maxDeg ?? 90)
      ),
      defaultPos: clampInt(joint.defaultPos ?? 500, 0, 1000),
      defaultTime: clampInt(joint.defaultTime ?? 300, 20, 30000),
      pivot: [pivotValue[0], pivotValue[1], pivotValue[2]],
      servoMapPoints: null,
      backlash: normalizeBacklashConfig(joint.backlash),
      lastCommandBasePos: null,
      lastCommandDir: 0,
      lastCommandSentPos: null,
      pivotGroup: pivotsByTarget?.[target] || null,
      targetGroup: groupsByTarget?.[target] || null,
      meshGroup: meshGroupsByTarget?.[target] || null,
      currentPos: 500,
      autoSendTimer: null,
      realtimeSendEnabled: true,
      lastServoIdForPoll: clampInt(joint.servoId ?? (jointStates.length + 1), 1, 253),
      idInput: null,
      rangeInput: null,
      valueInput: null,
      timeInput: null,
      minInput: null,
      maxInput: null,
      guardMinInput: null,
      guardMaxInput: null,
      minDegInput: null,
      maxDegInput: null,
      commandScaleInput: null,
      axisInput: null,
      invertInput: null,
      defaultPosInput: null,
      pivotXInput: null,
      pivotYInput: null,
      pivotZInput: null,
      realtimeInput: null,
      showAxisBtn: null,
      cardEl: null,
      idChipEl: null,
      actualIdChipEl: null,
      actualIdReadoutEl: null,
      posChipEl: null,
      degChipEl: null,
      vinChipEl: null,
      tempChipEl: null
    };

    normalizeJointLimits(state);
    enforceMotionAxisLockOnState(state, { syncUi: false });
    state.servoMapPoints = parseServoMapPoints(joint.servoMapPoints ?? joint.angleMap ?? null, state);
    state.pivot = normalizePivotArray(state.pivot, [0, 0, 0]);
    state.defaultPos = clampByGuard(state, state.defaultPos);
    state.currentPos = state.defaultPos;
    jointStates.push(state);
  }
}
