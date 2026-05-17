export function bindServoPanelEvents({
  pollInput,
  delayInput,
  globalRealtimeInput,
  frontViewBtn,
  sideViewBtn,
  topViewBtn,
  bindJointConfigBtn,
  writeSelectedJointBtn,
  writeAllJointsBtn,
  downloadJointConfigBtn,
  presetSelect,
  presetNameInput,
  savePresetBtn,
  loadPresetBtn,
  loadSendPresetBtn,
  deletePresetBtn,
  queryAllBtn,
  defaultBtn,
  hardResetBtn,
  setPositionPollIntervalMs,
  getPositionPollIntervalMs,
  clampInt,
  restartPositionPolling,
  setSliderAutoSendDelayMs,
  getSliderAutoSendDelayMs,
  setGlobalRealtimeSendEnabled,
  clearAutoSendTimers,
  setPlaneView,
  bindJointConfigFileHandle,
  writeJointConfig,
  collectWriteTargetStates,
  buildRuntimeJointConfig,
  serializeConfig,
  downloadConfigFile,
  cloneConfig,
  applyMotionLocksFromConfig,
  setLoadedJointConfig,
  normalizePresetName,
  saveCurrentPreset,
  applyPresetByName,
  deletePresetByName,
  queryAllPositionsStaggered,
  buildPollIdList,
  send,
  states,
  applyJointVisual,
  shouldRealtimeSend,
  sendMoveCommand,
  resetArmToDefaults,
  getJointStatesLength,
  log
}) {
  pollInput.addEventListener("change", () => {
    const next = clampInt(pollInput.value, 100, 3000);
    setPositionPollIntervalMs(next);
    pollInput.value = String(getPositionPollIntervalMs());
    restartPositionPolling();
  });

  delayInput.addEventListener("change", () => {
    const next = clampInt(delayInput.value, 20, 1200);
    setSliderAutoSendDelayMs(next);
    delayInput.value = String(getSliderAutoSendDelayMs());
  });

  globalRealtimeInput.addEventListener("change", () => {
    const enabled = !!globalRealtimeInput.checked;
    setGlobalRealtimeSendEnabled(enabled);
    if (!enabled) {
      clearAutoSendTimers();
    }
  });

  frontViewBtn.addEventListener("click", () => {
    setPlaneView("xy");
  });

  sideViewBtn.addEventListener("click", () => {
    setPlaneView("yz");
  });

  topViewBtn.addEventListener("click", () => {
    setPlaneView("xz");
  });

  bindJointConfigBtn.addEventListener("click", async () => {
    try {
      const handle = await bindJointConfigFileHandle();
      if (handle) {
        log("Bound joints.json file. You can now one-click write.");
      } else {
        log("Bind canceled.");
      }
    } catch (error) {
      log("Bind joints.json failed", { error: String(error) });
    }
  });

  writeSelectedJointBtn.addEventListener("click", async () => {
    await writeJointConfig({ selectedOnly: true });
  });

  writeAllJointsBtn.addEventListener("click", async () => {
    await writeJointConfig({ selectedOnly: false });
  });

  downloadJointConfigBtn.addEventListener("click", () => {
    const targetStates = collectWriteTargetStates({ selectedOnly: false });
    const config = buildRuntimeJointConfig({ selectedOnly: false, targetStates });
    const text = serializeConfig(config);
    downloadConfigFile(text, "joints.json");
    const nextLoaded = cloneConfig(config);
    setLoadedJointConfig(nextLoaded);
    applyMotionLocksFromConfig(nextLoaded);
    log("joints.json downloaded from current runtime parameters.");
  });

  presetSelect.addEventListener("change", () => {
    const hasSelection = Boolean(presetSelect.value);
    loadPresetBtn.disabled = !hasSelection;
    loadSendPresetBtn.disabled = !hasSelection;
    deletePresetBtn.disabled = !hasSelection;
    if (hasSelection) {
      presetNameInput.value = presetSelect.value;
    }
  });

  presetNameInput.addEventListener("change", () => {
    presetNameInput.value = normalizePresetName(presetNameInput.value);
  });

  savePresetBtn.addEventListener("click", () => {
    saveCurrentPreset();
  });

  loadPresetBtn.addEventListener("click", () => {
    const name = presetSelect.value;
    if (!name) return;
    applyPresetByName(name, false);
  });

  loadSendPresetBtn.addEventListener("click", () => {
    const name = presetSelect.value;
    if (!name) return;
    applyPresetByName(name, true);
  });

  deletePresetBtn.addEventListener("click", () => {
    const name = presetSelect.value;
    if (!name) return;
    deletePresetByName(name);
  });

  queryAllBtn.addEventListener("click", () => {
    queryAllPositionsStaggered();
    const ids = buildPollIdList();
    ids.forEach((id, idx) => {
      setTimeout(() => send({ type: "vin", id }, true), idx * 70);
      setTimeout(() => send({ type: "temp", id }, true), idx * 70 + 30);
      setTimeout(() => send({ type: "id_read", id }, true), idx * 70 + 45);
    });
  });

  defaultBtn.addEventListener("click", () => {
    states.forEach((state, idx) => {
      applyJointVisual(state, state.defaultPos);
      if (shouldRealtimeSend(state)) {
        setTimeout(() => sendMoveCommand(state, { silentWhenClosed: true }), idx * 90);
      }
    });
  });

  hardResetBtn.addEventListener("click", () => {
    resetArmToDefaults({ silentWhenClosed: false });
    log("Hard reset triggered", { jointCount: getJointStatesLength() });
  });
}
