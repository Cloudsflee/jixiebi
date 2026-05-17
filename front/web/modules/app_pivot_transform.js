export function setPivotKeepingWorldRaw(state, worldPivot) {
  if (!state?.pivotGroup || !state?.targetGroup || !state.pivotGroup.parent) return;

  state.targetGroup.updateWorldMatrix(true, true);
  const targetWorldMatrix = state.targetGroup.matrixWorld.clone();

  const pivotParent = state.pivotGroup.parent;
  const pivotLocal = pivotParent.worldToLocal(worldPivot.clone());
  state.pivotGroup.position.copy(pivotLocal);
  state.pivotGroup.updateWorldMatrix(true, true);

  const localMatrix = state.pivotGroup.matrixWorld.clone().invert().multiply(targetWorldMatrix);
  localMatrix.decompose(state.targetGroup.position, state.targetGroup.quaternion, state.targetGroup.scale);
  state.targetGroup.updateWorldMatrix(true, true);
}
