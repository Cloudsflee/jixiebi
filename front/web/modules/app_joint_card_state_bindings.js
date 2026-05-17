export function initializeJointCardState({
  state,
  card,
  refs,
  onHeaderClick,
  enforceMotionAxisLockOnState,
  syncJointRangeBounds,
  syncJointPivotInputs,
  applyJointVisual
}) {
  const {
    header,
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
    idChip,
    posChip,
    degChip,
    actualIdChip,
    actualIdReadout,
    vinChip,
    tempChip
  } = refs;

  header.addEventListener("click", () => {
    onHeaderClick(state);
  });

  state.idInput = idInput;
  state.rangeInput = rangeInput;
  state.valueInput = valueInput;
  state.timeInput = timeInput;
  state.minInput = minInput;
  state.maxInput = maxInput;
  state.guardMinInput = guardMinInput;
  state.guardMaxInput = guardMaxInput;
  state.minDegInput = minDegInput;
  state.maxDegInput = maxDegInput;
  state.commandScaleInput = commandScaleInput;
  state.axisInput = axisInput;
  state.invertInput = invertInput;
  state.defaultPosInput = defaultPosInput;
  state.pivotXInput = pivotXInput;
  state.pivotYInput = pivotYInput;
  state.pivotZInput = pivotZInput;
  state.realtimeInput = realtimeInput;
  state.showAxisBtn = showAxisBtn;
  state.cardEl = card;
  state.posChipEl = posChip;
  state.degChipEl = degChip;
  state.idChipEl = idChip;
  state.actualIdChipEl = actualIdChip;
  state.actualIdReadoutEl = actualIdReadout;
  state.vinChipEl = vinChip;
  state.tempChipEl = tempChip;
  state.realtimeSendEnabled = true;

  enforceMotionAxisLockOnState(state);
  syncJointRangeBounds(state);
  syncJointPivotInputs(state);
  applyJointVisual(state, state.currentPos);
}
