export function createPresetController({
  initialPresetList = [],
  presetSelect,
  presetNameInput,
  loadPresetBtn,
  loadSendPresetBtn,
  deletePresetBtn,
  readPresetList,
  writePresetList,
  normalizePresetName,
  buildAutoPresetName,
  buildPresetRecord,
  applyPresetGlobalSettings,
  applyPresetJointToState,
  states,
  pollInput,
  delayInput,
  globalRealtimeInput,
  sendMoveCommand,
  maxCount = 40,
  log
}) {
  let presetList = Array.isArray(initialPresetList) ? initialPresetList.slice() : [];

  const sortPresetList = () => {
    presetList.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  };

  const refreshPresetOptions = (selectedName = "") => {
    sortPresetList();
    presetSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = presetList.length > 0 ? "Select a preset..." : "No presets";
    presetSelect.appendChild(placeholder);

    presetList.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.name;
      option.textContent = preset.name;
      presetSelect.appendChild(option);
    });

    const targetSelect = selectedName || presetSelect.value;
    if (targetSelect && presetList.some((preset) => preset.name === targetSelect)) {
      presetSelect.value = targetSelect;
    } else {
      presetSelect.value = "";
    }

    const hasSelection = Boolean(presetSelect.value);
    loadPresetBtn.disabled = !hasSelection;
    loadSendPresetBtn.disabled = !hasSelection;
    deletePresetBtn.disabled = !hasSelection;
  };

  const saveCurrentPreset = () => {
    let name = normalizePresetName(presetNameInput.value);
    if (!name) {
      name = buildAutoPresetName();
      presetNameInput.value = name;
    }

    const record = buildPresetRecord(name);
    const idx = presetList.findIndex((item) => item.name === name);
    if (idx >= 0) {
      presetList[idx] = record;
    } else {
      presetList.push(record);
    }

    sortPresetList();
    if (presetList.length > maxCount) {
      presetList = presetList.slice(0, maxCount);
    }

    if (!writePresetList(presetList)) {
      return;
    }

    refreshPresetOptions(name);
    log("Preset saved", { name });
  };

  const applyPresetByName = (name, sendMoves = false) => {
    const preset = presetList.find((item) => item.name === name);
    if (!preset) {
      log("Preset not found", { name });
      return;
    }

    applyPresetGlobalSettings(preset, { pollInput, delayInput, globalRealtimeInput });

    const byTarget = new Map();
    const byName = new Map();
    const joints = Array.isArray(preset.joints) ? preset.joints : [];
    joints.forEach((joint) => {
      if (!joint || typeof joint !== "object") return;
      if (joint.target) byTarget.set(String(joint.target), joint);
      if (joint.name) byName.set(String(joint.name), joint);
    });

    states.forEach((state, idx) => {
      const presetJoint = byTarget.get(state.target) || byName.get(state.name) || joints[idx] || null;
      if (presetJoint) {
        applyPresetJointToState(state, presetJoint);
      }

      if (sendMoves) {
        setTimeout(() => {
          sendMoveCommand(state, { silentWhenClosed: true });
        }, idx * 90);
      }
    });

    log(sendMoves ? "Preset loaded and sent" : "Preset loaded", { name });
  };

  const deletePresetByName = (name) => {
    const oldLen = presetList.length;
    presetList = presetList.filter((item) => item.name !== name);
    if (presetList.length === oldLen) return;

    if (!writePresetList(presetList)) {
      return;
    }

    refreshPresetOptions("");
    log("Preset deleted", { name });
  };

  return {
    refreshPresetOptions,
    saveCurrentPreset,
    applyPresetByName,
    deletePresetByName,
    getPresetList: () => presetList.slice(),
    setPresetList: (nextList) => {
      presetList = Array.isArray(nextList) ? nextList.slice() : [];
    }
  };
}
