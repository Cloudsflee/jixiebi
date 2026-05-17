export function createAxisLineEditorStateAdapter({
  getAxisLineEditorActive,
  getAxisLineEditorTarget,
  getAxisLineEditorMode,
  getAxisLineEditorLinePinned,
  getAxisLineEditorDragging,
  setAxisLineEditorOnAxisUpdatedRaw,
  setAxisLineEditorOnStateChangedRaw
}) {
  const getAxisLineEditorState = () => ({
    active: getAxisLineEditorActive(),
    target: getAxisLineEditorTarget(),
    mode: getAxisLineEditorMode(),
    linePinned: getAxisLineEditorLinePinned(),
    dragging: getAxisLineEditorDragging()
  });

  const setAxisLineEditorOnAxisUpdated = (handler) => {
    setAxisLineEditorOnAxisUpdatedRaw(typeof handler === "function" ? handler : null);
  };

  const setAxisLineEditorOnStateChanged = (handler) => {
    setAxisLineEditorOnStateChangedRaw(typeof handler === "function" ? handler : null);
  };

  return {
    getAxisLineEditorState,
    setAxisLineEditorOnAxisUpdated,
    setAxisLineEditorOnStateChanged
  };
}
