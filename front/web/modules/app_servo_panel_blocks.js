import { createControlField, setControlFieldLabels } from "./app_panel_ui.js?v=20260518-035000";

export function buildPanelHeader(frontMinimalMode) {
  const panelHeader = document.createElement("div");
  panelHeader.className = "panel-header";

  const title = document.createElement("h2");
  title.textContent = "Joint Control Panel";
  const desc = document.createElement("p");
  desc.textContent = frontMinimalMode
    ? "Minimal runtime panel: reset, query, and direct per-joint control."
    : "Top-down workflow: global controls, coordinate tools, linkage settings, IK/FEA demo, then per-joint cards.";
  panelHeader.append(title, desc);
  return panelHeader;
}

export function buildPanelTools({
  frontMinimalMode,
  pollInput,
  delayInput,
  globalRealtimeInput
}) {
  const panelTools = document.createElement("div");
  panelTools.className = "panel-tools";

  const queryAllBtn = document.createElement("button");
  queryAllBtn.textContent = "Query All";
  queryAllBtn.title = "Poll all servo positions and voltages.";
  const defaultBtn = document.createElement("button");
  defaultBtn.textContent = "Go Default";
  defaultBtn.title = "Move all joints to default positions; send behavior follows realtime setting.";
  const hardResetBtn = document.createElement("button");
  hardResetBtn.textContent = "Hard Reset";
  hardResetBtn.title = "Force reset model and real arm to default pose.";

  if (frontMinimalMode) {
    panelTools.append(queryAllBtn, defaultBtn, hardResetBtn);
  } else {
    panelTools.append(
      createControlField("Poll Interval (ms)", pollInput),
      createControlField("Auto Send Delay (ms)", delayInput),
      createControlField("Global Realtime Send", globalRealtimeInput),
      queryAllBtn,
      defaultBtn,
      hardResetBtn
    );
    setControlFieldLabels(panelTools, ["Poll Interval (ms)", "Auto Send Delay (ms)", "Global Realtime Send"]);
  }

  return { panelTools, queryAllBtn, defaultBtn, hardResetBtn };
}

export function buildViewTools() {
  const viewTools = document.createElement("div");
  viewTools.className = "view-tools";

  const frontViewBtn = document.createElement("button");
  frontViewBtn.textContent = "Front (XY)";
  frontViewBtn.title = "Front camera view.";
  const sideViewBtn = document.createElement("button");
  sideViewBtn.textContent = "Side (YZ)";
  sideViewBtn.title = "Side camera view.";
  const topViewBtn = document.createElement("button");
  topViewBtn.textContent = "Top (XZ)";
  topViewBtn.title = "Top camera view.";
  viewTools.append(frontViewBtn, sideViewBtn, topViewBtn);

  return { viewTools, frontViewBtn, sideViewBtn, topViewBtn };
}

export function buildPresetTools() {
  const presetTools = document.createElement("div");
  presetTools.className = "preset-tools";

  const presetSelect = document.createElement("select");
  const presetNameInput = document.createElement("input");
  presetNameInput.type = "text";
  presetNameInput.placeholder = "Preset name";
  const savePresetBtn = document.createElement("button");
  savePresetBtn.textContent = "Save Preset";
  savePresetBtn.title = "Save current panel state as a preset.";
  const loadPresetBtn = document.createElement("button");
  loadPresetBtn.textContent = "Load Preset";
  loadPresetBtn.title = "Load to UI only; no command send.";
  const loadSendPresetBtn = document.createElement("button");
  loadSendPresetBtn.textContent = "Load + Send";
  loadSendPresetBtn.title = "Load preset and send commands.";
  const deletePresetBtn = document.createElement("button");
  deletePresetBtn.textContent = "Delete Preset";
  deletePresetBtn.title = "Delete selected preset.";
  presetTools.append(
    createControlField("Preset List", presetSelect),
    createControlField("Preset Name", presetNameInput),
    savePresetBtn,
    loadPresetBtn,
    loadSendPresetBtn,
    deletePresetBtn
  );
  setControlFieldLabels(presetTools, ["Preset List", "Preset Name"]);

  return {
    presetTools,
    presetSelect,
    presetNameInput,
    savePresetBtn,
    loadPresetBtn,
    loadSendPresetBtn,
    deletePresetBtn
  };
}

export function buildConfigTools() {
  const configTools = document.createElement("div");
  configTools.className = "config-tools";

  const bindJointConfigBtn = document.createElement("button");
  bindJointConfigBtn.textContent = "Bind joints.json";
  bindJointConfigBtn.title = "Bind a config file handle for one-click writes.";
  const writeSelectedJointBtn = document.createElement("button");
  writeSelectedJointBtn.textContent = "Write Selected J";
  writeSelectedJointBtn.title = "Write selected joint params to joints.json.";
  const writeAllJointsBtn = document.createElement("button");
  writeAllJointsBtn.textContent = "Write All Joints";
  writeAllJointsBtn.title = "Write all runtime params to joints.json.";
  const downloadJointConfigBtn = document.createElement("button");
  downloadJointConfigBtn.textContent = "Download joints.json";
  downloadJointConfigBtn.title = "Export current runtime params as joints.json.";
  configTools.append(writeSelectedJointBtn);

  return {
    configTools,
    bindJointConfigBtn,
    writeSelectedJointBtn,
    writeAllJointsBtn,
    downloadJointConfigBtn
  };
}
