export function shouldRealtimeSendRaw({
  globalRealtimeSendEnabled,
  state
}) {
  return globalRealtimeSendEnabled && state?.realtimeSendEnabled !== false;
}

export function scheduleRealtimeMoveRaw({
  state,
  shouldRealtimeSend,
  sendMoveCommand,
  sliderAutoSendDelayMs
}) {
  if (!shouldRealtimeSend(state)) return;

  if (state.autoSendTimer) {
    clearTimeout(state.autoSendTimer);
  }

  state.autoSendTimer = setTimeout(() => {
    sendMoveCommand(state, { silentWhenClosed: true });
    state.autoSendTimer = null;
  }, sliderAutoSendDelayMs);
}
