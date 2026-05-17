export function setAxisLineEditorModeRaw({
  mode,
  setAxisLineEditorModeState,
  updateAxisLineEditorModeVisuals,
  getAxisLineEditorActive,
  setAxisLineEditorGeometry,
  axisLineEditorPivotWorld,
  axisLineEditorAxisWorld,
  syncAxisLineEditorControlState,
  notifyAxisLineEditorState
}) {
  const normalized = mode === "pick" || mode === "pivot_slide" ? mode : "direction";
  setAxisLineEditorModeState(normalized);
  updateAxisLineEditorModeVisuals();
  if (getAxisLineEditorActive()) {
    setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
  }
  syncAxisLineEditorControlState();
  notifyAxisLineEditorState();
}

export function setAxisLineEditorLinePinnedRaw({
  pinned,
  setAxisLineEditorLinePinnedState,
  axisLineEditorLineAnchorWorld,
  axisLineEditorPivotWorld,
  getAxisLineEditorActive,
  setAxisLineEditorGeometry,
  axisLineEditorAxisWorld,
  notifyAxisLineEditorState
}) {
  const nextPinned = pinned === true;
  setAxisLineEditorLinePinnedState(nextPinned);
  if (nextPinned) {
    axisLineEditorLineAnchorWorld.copy(axisLineEditorPivotWorld);
  }
  if (getAxisLineEditorActive()) {
    setAxisLineEditorGeometry(axisLineEditorPivotWorld, axisLineEditorAxisWorld);
  }
  notifyAxisLineEditorState();
}
