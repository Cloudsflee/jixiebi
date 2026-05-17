export function notifyAxisLineEditorStateRaw({
  axisLineEditorOnStateChanged,
  axisLineEditorActive,
  axisLineEditorTarget,
  axisLineEditorMode,
  axisLineEditorLinePinned,
  axisLineEditorDragging
}) {
  if (typeof axisLineEditorOnStateChanged === "function") {
    axisLineEditorOnStateChanged({
      active: axisLineEditorActive,
      target: axisLineEditorTarget,
      mode: axisLineEditorMode,
      linePinned: axisLineEditorLinePinned,
      dragging: axisLineEditorDragging
    });
  }
}

export function updateAxisLineEditorModeVisualsRaw({
  axisLineEditorLine,
  axisLineEditorHandle,
  axisLineEditorPivotMarker,
  axisLineEditorMode
}) {
  if (!axisLineEditorLine || !axisLineEditorHandle || !axisLineEditorPivotMarker) return;

  const lineMat = axisLineEditorLine.material;
  const handleMat = axisLineEditorHandle.material;
  const pivotMat = axisLineEditorPivotMarker.material;

  if (axisLineEditorMode === "pick") {
    if (lineMat?.color?.setHex) lineMat.color.setHex(0xffc857);
    if (handleMat?.color?.setHex) handleMat.color.setHex(0xffc857);
    if (pivotMat?.color?.setHex) pivotMat.color.setHex(0xfff0a8);
    axisLineEditorHandle.visible = false;
    return;
  }

  if (axisLineEditorMode === "pivot_slide") {
    if (lineMat?.color?.setHex) lineMat.color.setHex(0x68d7ff);
    if (handleMat?.color?.setHex) handleMat.color.setHex(0xff3f9f);
    if (pivotMat?.color?.setHex) pivotMat.color.setHex(0x40ffd0);
    axisLineEditorHandle.visible = false;
    return;
  }

  if (lineMat?.color?.setHex) lineMat.color.setHex(0xff6ad5);
  if (handleMat?.color?.setHex) handleMat.color.setHex(0xff3f9f);
  if (pivotMat?.color?.setHex) pivotMat.color.setHex(0xffffff);
  axisLineEditorHandle.visible = true;
}
