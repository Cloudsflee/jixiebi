import { createControlField, setControlFieldLabels } from "./app_panel_ui.js?v=20260518-035000";
import { createNumberInput, createSelectInput } from "./app_panel_ui.js?v=20260518-035000";

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

export function buildCoordTools() {
  const coordTools = document.createElement("div");
  coordTools.className = "coord-tools";

  const coordSpaceSelect = createSelectInput(
    [
      { value: "world", label: "world" },
      { value: "display_local", label: "display_local" },
      { value: "robot_local", label: "robot_local" },
      { value: "selected_parent_local", label: "selected_parent_local" }
    ],
    "world"
  );
  const coordXInput = createNumberInput(0, -99999, 99999, 0.1);
  const coordYInput = createNumberInput(0, -99999, 99999, 0.1);
  const coordZInput = createNumberInput(0, -99999, 99999, 0.1);

  const locateCoordBtn = document.createElement("button");
  locateCoordBtn.textContent = "Locate Coord";
  locateCoordBtn.title = "Locate point in 3D by input coords and show conversions.";
  const usePivotBtn = document.createElement("button");
  usePivotBtn.textContent = "Use Current Pivot";
  usePivotBtn.title = "Fill coord input from selected joint pivot.";
  const hideCoordBtn = document.createElement("button");
  hideCoordBtn.className = "ghost-btn";
  hideCoordBtn.textContent = "Hide Probe";
  hideCoordBtn.title = "Hide coordinate probe marker and helper line.";
  const alignFrameBtn = document.createElement("button");
  alignFrameBtn.textContent = "Align Frame";
  alignFrameBtn.title = "Align world frame to current arm reference.";

  coordTools.append(
    createControlField("Coord Space", coordSpaceSelect),
    createControlField("X", coordXInput),
    createControlField("Y", coordYInput),
    createControlField("Z", coordZInput),
    locateCoordBtn,
    usePivotBtn,
    hideCoordBtn,
    alignFrameBtn
  );
  setControlFieldLabels(coordTools, ["Coord Space", "X", "Y", "Z"]);

  return {
    coordTools,
    coordSpaceSelect,
    coordXInput,
    coordYInput,
    coordZInput,
    locateCoordBtn,
    usePivotBtn,
    hideCoordBtn,
    alignFrameBtn
  };
}

export function buildPhysicalTools() {
  const physicalTools = document.createElement("div");
  physicalTools.className = "physical-tools";

  const physicalEnabledInput = document.createElement("input");
  physicalEnabledInput.type = "checkbox";

  const physicalSpaceSelect = createSelectInput(
    [
      { value: "robot_local", label: "robot_local" },
      { value: "world", label: "world" }
    ],
    "robot_local"
  );
  const physicalTargetSelect = createSelectInput(
    [
      { value: "j2", label: "J2" },
      { value: "j3", label: "J3" },
      { value: "j4", label: "J4" }
    ],
    "j2"
  );
  const physicalPivotXInput = createNumberInput(0, -99999, 99999, 0.1);
  const physicalPivotYInput = createNumberInput(0, -99999, 99999, 0.1);
  const physicalPivotZInput = createNumberInput(0, -99999, 99999, 0.1);
  const physicalJ2LengthInput = createNumberInput(0, 0, 99999, 0.001);
  const physicalJ3LengthInput = createNumberInput(0, 0, 99999, 0.001);

  const physicalReloadBtn = document.createElement("button");
  physicalReloadBtn.className = "ghost-btn";
  physicalReloadBtn.textContent = "Reload Config";
  physicalReloadBtn.title = "Reload physical values from joints.json.";
  const physicalUseSelectedPivotBtn = document.createElement("button");
  physicalUseSelectedPivotBtn.className = "ghost-btn";
  physicalUseSelectedPivotBtn.textContent = "Use Selected Pivot";
  physicalUseSelectedPivotBtn.title = "Copy selected joint pivot into physical draft.";
  const physicalApplyBtn = document.createElement("button");
  physicalApplyBtn.textContent = "Apply Physical";
  physicalApplyBtn.title = "Apply and rebuild closed-chain solver (frontend runtime).";

  const axisTargetSelect = createSelectInput(
    [
      { value: "j1", label: "J1" },
      { value: "j2", label: "J2" },
      { value: "j3", label: "J3" },
      { value: "j4", label: "J4" }
    ],
    "j2"
  );
  const axisDirXInput = createNumberInput(1, -99999, 99999, 0.001);
  const axisDirYInput = createNumberInput(0, -99999, 99999, 0.001);
  const axisDirZInput = createNumberInput(0, -99999, 99999, 0.001);

  const axisReloadBtn = document.createElement("button");
  axisReloadBtn.className = "ghost-btn";
  axisReloadBtn.textContent = "Read Axis";
  axisReloadBtn.title = "Read current parent-space axis for selected target.";
  const axisApplyBtn = document.createElement("button");
  axisApplyBtn.textContent = "Apply Axis";
  axisApplyBtn.title = "Apply axis vector to selected target.";
  const axisShowBtn = document.createElement("button");
  axisShowBtn.className = "ghost-btn";
  axisShowBtn.textContent = "Show Axis";
  axisShowBtn.title = "Focus target joint and show axis.";
  const axisDragBtn = document.createElement("button");
  axisDragBtn.className = "ghost-btn";
  axisDragBtn.textContent = "Drag Axis Dir";
  axisDragBtn.title = "Drag axis direction in 3D.";
  const axisPickBtn = document.createElement("button");
  axisPickBtn.className = "ghost-btn";
  axisPickBtn.textContent = "Pick Axis (Out->In)";
  axisPickBtn.title = "Pick a surface point and generate axis from outward normal reversed.";
  const axisPinBtn = document.createElement("button");
  axisPinBtn.className = "ghost-btn";
  axisPinBtn.textContent = "Pin Line Pos";
  axisPinBtn.title = "Keep line position fixed while moving pivot.";
  const axisSlideBtn = document.createElement("button");
  axisSlideBtn.className = "ghost-btn";
  axisSlideBtn.textContent = "Slide Pivot On Axis";
  axisSlideBtn.title = "Move pivot only along current axis line.";

  physicalTools.append(
    createControlField("Enable Physical", physicalEnabledInput),
    createControlField("Physical Space", physicalSpaceSelect),
    createControlField("Driver Target", physicalTargetSelect),
    createControlField("Pivot X", physicalPivotXInput),
    createControlField("Pivot Y", physicalPivotYInput),
    createControlField("Pivot Z", physicalPivotZInput),
    createControlField("J2 Link (mm)", physicalJ2LengthInput),
    createControlField("J3 Link (mm)", physicalJ3LengthInput),
    createControlField("Axis Target", axisTargetSelect),
    createControlField("Axis Dir X", axisDirXInput),
    createControlField("Axis Dir Y", axisDirYInput),
    createControlField("Axis Dir Z", axisDirZInput),
    physicalReloadBtn,
    physicalUseSelectedPivotBtn,
    physicalApplyBtn,
    axisReloadBtn,
    axisApplyBtn,
    axisShowBtn,
    axisDragBtn,
    axisPickBtn,
    axisPinBtn,
    axisSlideBtn
  );
  setControlFieldLabels(
    physicalTools,
    [
      "Enable Closed-Chain",
      "Physical Space",
      "Driver Target",
      "Pivot X",
      "Pivot Y",
      "Pivot Z",
      "J2 Link Length (mm)",
      "J3 Link Length (mm)",
      "Axis Target",
      "Axis Dir X (parent)",
      "Axis Dir Y (parent)",
      "Axis Dir Z (parent)"
    ]
  );

  return {
    physicalTools,
    physicalEnabledInput,
    physicalSpaceSelect,
    physicalTargetSelect,
    physicalPivotXInput,
    physicalPivotYInput,
    physicalPivotZInput,
    physicalJ2LengthInput,
    physicalJ3LengthInput,
    physicalReloadBtn,
    physicalUseSelectedPivotBtn,
    physicalApplyBtn,
    axisTargetSelect,
    axisDirXInput,
    axisDirYInput,
    axisDirZInput,
    axisReloadBtn,
    axisApplyBtn,
    axisShowBtn,
    axisDragBtn,
    axisPickBtn,
    axisPinBtn,
    axisSlideBtn
  };
}

function createDemoMetric(labelText) {
  const row = document.createElement("div");
  row.className = "demo-metric-row";

  const label = document.createElement("span");
  label.className = "demo-metric-label";
  label.textContent = labelText;

  const value = document.createElement("span");
  value.className = "demo-metric-value";
  value.textContent = "--";

  const track = document.createElement("div");
  track.className = "demo-metric-track";
  const fill = document.createElement("div");
  fill.className = "demo-metric-fill";
  track.appendChild(fill);

  row.append(label, value, track);
  return { row, value, fill };
}

export function buildDemoPanelBlock({ demoRuntime, demoTrendWindowMs, demoTrendWindowOptions }) {
  const demoTools = document.createElement("div");
  demoTools.className = "demo-tools";

  const demoEnabledInput = document.createElement("input");
  demoEnabledInput.type = "checkbox";
  demoEnabledInput.checked = demoRuntime.enabled === true;

  const demoAutoFeaInput = document.createElement("input");
  demoAutoFeaInput.type = "checkbox";
  demoAutoFeaInput.checked = demoRuntime.autoFea !== false;

  const demoElbowSelect = createSelectInput(
    [
      { value: "down", label: "down" },
      { value: "up", label: "up" }
    ],
    demoRuntime.elbow
  );

  const demoWristPitchInput = createNumberInput(demoRuntime.wristPitchDeg, -180, 180, 0.1);
  const demoPayloadInput = createNumberInput(demoRuntime.payloadNewton, 0, 1000, 0.1);
  const demoTargetXInput = createNumberInput(demoRuntime.target.x, -2000, 2000, 0.1);
  const demoTargetYInput = createNumberInput(demoRuntime.target.y, -2000, 2000, 0.1);
  const demoTargetZInput = createNumberInput(demoRuntime.target.z, -2000, 2000, 0.1);

  const demoFromFkBtn = document.createElement("button");
  demoFromFkBtn.className = "ghost-btn";
  demoFromFkBtn.textContent = "Target <- FK";
  demoFromFkBtn.title = "Use current FK TCP as target.";
  const demoSolveIkBtn = document.createElement("button");
  demoSolveIkBtn.textContent = "Solve IK + Apply";
  demoSolveIkBtn.title = "Solve IK from target and drive J1~J4 (demo mode).";
  const demoRunFeaBtn = document.createElement("button");
  demoRunFeaBtn.className = "ghost-btn";
  demoRunFeaBtn.textContent = "Refresh Pseudo-FEA";
  demoRunFeaBtn.title = "Recompute pseudo stress/deformation from current pose.";
  const demoClearFeaBtn = document.createElement("button");
  demoClearFeaBtn.className = "ghost-btn";
  demoClearFeaBtn.textContent = "Clear Pseudo-FEA";
  demoClearFeaBtn.title = "Clear stress color/deformation overlay.";

  demoTools.append(
    createControlField("Enable Demo IK/FEA", demoEnabledInput),
    createControlField("Auto FEA", demoAutoFeaInput),
    createControlField("Elbow Branch", demoElbowSelect),
    createControlField("Wrist Pitch (deg)", demoWristPitchInput),
    createControlField("Payload (N)", demoPayloadInput),
    createControlField("Target X (robot_local)", demoTargetXInput),
    createControlField("Target Y (robot_local)", demoTargetYInput),
    createControlField("Target Z (robot_local)", demoTargetZInput),
    demoFromFkBtn,
    demoSolveIkBtn,
    demoRunFeaBtn,
    demoClearFeaBtn
  );
  setControlFieldLabels(
    demoTools,
    [
      "Enable Demo IK+PseudoFEA",
      "Auto Refresh PseudoFEA",
      "Elbow Branch",
      "Wrist Pitch (deg)",
      "Payload (N)",
      "Target X (robot_local)",
      "Target Y (robot_local)",
      "Target Z (robot_local)"
    ]
  );

  const demoLegend = document.createElement("p");
  demoLegend.className = "demo-legend";
  demoLegend.textContent = "Legend: Purple=IK target, Blue=current FK, line color=error level.";

  const demoVisualGrid = document.createElement("div");
  demoVisualGrid.className = "demo-visual-grid";

  const demoStatusRow = document.createElement("div");
  demoStatusRow.className = "demo-status-row";
  const demoReachBadge = document.createElement("span");
  demoReachBadge.className = "demo-badge";
  const demoFeaBadge = document.createElement("span");
  demoFeaBadge.className = "demo-badge";
  demoStatusRow.append(demoReachBadge, demoFeaBadge);

  const ikErrorMetric = createDemoMetric("IK Position Error");
  const stressJ2Metric = createDemoMetric("J2 Stress Ratio");
  const stressJ3Metric = createDemoMetric("J3 Stress Ratio");
  const stressJ4Metric = createDemoMetric("J4 Stress Ratio");
  const deformMetric = createDemoMetric("Total Deformation");

  const demoTrendWrap = document.createElement("div");
  demoTrendWrap.className = "demo-trend";
  const demoTrendTitle = document.createElement("div");
  demoTrendTitle.className = "demo-trend-title";
  const demoTrendWindowSelect = createSelectInput(
    demoTrendWindowOptions.map((ms) => ({
      value: String(ms),
      label: `${Math.round(ms / 1000)}s`
    })),
    String(demoTrendWindowMs)
  );
  demoTrendWindowSelect.className = "demo-trend-window-select";
  const demoTrendWindowField = createControlField("Trend Window", demoTrendWindowSelect);
  demoTrendWindowField.classList.add("demo-trend-window-field");
  const demoTrendClearBtn = document.createElement("button");
  demoTrendClearBtn.type = "button";
  demoTrendClearBtn.className = "ghost-btn demo-trend-clear-btn";
  demoTrendClearBtn.textContent = "Clear Trend";
  demoTrendClearBtn.title = "Clear trend chart history.";
  const demoTrendToolbar = document.createElement("div");
  demoTrendToolbar.className = "demo-trend-toolbar";
  demoTrendToolbar.append(demoTrendWindowField, demoTrendClearBtn);
  const demoTrendCanvas = document.createElement("canvas");
  demoTrendCanvas.className = "demo-trend-canvas";
  demoTrendWrap.append(demoTrendTitle, demoTrendToolbar, demoTrendCanvas);

  demoVisualGrid.append(
    demoStatusRow,
    demoTrendWrap,
    ikErrorMetric.row,
    stressJ2Metric.row,
    stressJ3Metric.row,
    stressJ4Metric.row,
    deformMetric.row
  );

  const demoReadout = document.createElement("pre");
  demoReadout.className = "demo-readout";

  return {
    demoTools,
    demoLegend,
    demoVisualGrid,
    demoReadout,
    refs: {
      demoEnabledInput,
      demoAutoFeaInput,
      demoElbowSelect,
      demoWristPitchInput,
      demoPayloadInput,
      demoTargetXInput,
      demoTargetYInput,
      demoTargetZInput,
      demoFromFkBtn,
      demoSolveIkBtn,
      demoRunFeaBtn,
      demoClearFeaBtn,
      demoReachBadge,
      demoFeaBadge,
      ikErrorMetric,
      stressJ2Metric,
      stressJ3Metric,
      stressJ4Metric,
      deformMetric,
      demoTrendTitle,
      demoTrendWindowSelect,
      demoTrendClearBtn,
      demoTrendCanvas
    }
  };
}
