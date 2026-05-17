export function syncAxisLineEditorControlStateRaw({
  controls,
  axisLineEditorActive,
  axisLineEditorMode,
  axisLineEditorDragging
}) {
  if (!controls) return;
  const lockOrbitForPick = axisLineEditorActive && axisLineEditorMode === "pick";
  controls.enabled = !(axisLineEditorDragging || lockOrbitForPick);
}

export function startAxisLineEditorRaw({
  ensureAxisLineEditorGizmo,
  bindAxisLineEditorPointerEvents,
  target,
  setAxisLineEditorTarget,
  setAxisLineEditorActive,
  setAxisLineEditorDragging,
  setAxisLineEditorDragKind,
  syncAxisLineEditorControlState,
  refreshAxisLineEditorFromRuntime,
  updateAxisLineEditorModeVisuals,
  getAxisLineEditorGroup,
  notifyAxisLineEditorState
}) {
  ensureAxisLineEditorGizmo();
  bindAxisLineEditorPointerEvents();
  const nextTarget = String(target || "");
  setAxisLineEditorTarget(nextTarget);
  setAxisLineEditorActive(!!nextTarget);
  setAxisLineEditorDragging(false);
  setAxisLineEditorDragKind("");
  syncAxisLineEditorControlState();
  refreshAxisLineEditorFromRuntime();
  updateAxisLineEditorModeVisuals();
  const group = getAxisLineEditorGroup();
  if (group) group.visible = !!nextTarget;
  notifyAxisLineEditorState();
}

export function stopAxisLineEditorRaw({
  setAxisLineEditorActive,
  setAxisLineEditorDragging,
  setAxisLineEditorDragKind,
  setAxisLineEditorTarget,
  setAxisLineEditorModeState,
  setAxisLineEditorLinePinnedState,
  syncAxisLineEditorControlState,
  getAxisLineEditorGroup,
  notifyAxisLineEditorState
}) {
  setAxisLineEditorActive(false);
  setAxisLineEditorDragging(false);
  setAxisLineEditorDragKind("");
  setAxisLineEditorTarget("");
  setAxisLineEditorModeState("direction");
  setAxisLineEditorLinePinnedState(false);
  syncAxisLineEditorControlState();
  const group = getAxisLineEditorGroup();
  if (group) group.visible = false;
  notifyAxisLineEditorState();
}
