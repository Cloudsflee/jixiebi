import {
  createNumberInput,
  createSelectInput,
  createControlField,
  setControlFieldLabels,
  replaceMojibakeInDom,
  createChip
} from "./app_panel_ui.js?v=20260518-035000";

export function buildJointCardLayout(state, { posToDeg, normalizePivotSpace }) {
  const card = document.createElement("article");
  card.className = "joint-card";

  const header = document.createElement("header");
  header.className = "joint-card-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "joint-title";

  const title = document.createElement("h3");
  title.textContent = state.name;
  const subtitle = document.createElement("p");
  subtitle.textContent = `target: ${state.target}`;
  titleWrap.append(title, subtitle);

  const chipWrap = document.createElement("div");
  chipWrap.className = "chip-row";
  const idChip = createChip(`ID ${state.servoId}`);
  const posChip = createChip(`POS ${state.defaultPos}`);
  const degChip = createChip(`DEG ${posToDeg(state, state.defaultPos).toFixed(1)}`);
  const actualIdChip = createChip("ACTID --", "chip-muted");
  const vinChip = createChip("VIN --", "chip-muted");
  const tempChip = createChip("TEMP --", "chip-muted");
  chipWrap.append(idChip, posChip, degChip, actualIdChip, vinChip, tempChip);
  header.append(titleWrap, chipWrap);

  const motionSection = document.createElement("section");
  motionSection.className = "joint-motion";
  const sliderLabel = document.createElement("div");
  sliderLabel.className = "slider-label";
  sliderLabel.textContent = "Position Slider";
  const rangeInput = document.createElement("input");
  rangeInput.type = "range";
  rangeInput.value = String(state.defaultPos);

  const primaryGrid = document.createElement("div");
  primaryGrid.className = "joint-inline-grid";
  const valueInput = createNumberInput(state.defaultPos, 0, 1000, 1);
  const timeInput = createNumberInput(state.defaultTime, 20, 30000, 10);
  const idInput = createNumberInput(state.servoId, 1, 253, 1);
  primaryGrid.append(
    createControlField("Position", valueInput),
    createControlField("Move Time (ms)", timeInput),
    createControlField("Servo ID", idInput)
  );
  setControlFieldLabels(primaryGrid, ["Position", "Move Time (ms)", "Servo ID"]);

  const actionRow = document.createElement("div");
  actionRow.className = "joint-action-row";
  const showAxisBtn = document.createElement("button");
  showAxisBtn.type = "button";
  showAxisBtn.className = "ghost-btn";
  showAxisBtn.textContent = "Show Axis";
  showAxisBtn.title = "Highlight selected joint axis and pivot in 3D.";
  const moveBtn = document.createElement("button");
  moveBtn.textContent = "Send MOVE";
  moveBtn.title = "Send move command with current position/time.";
  const queryBtn = document.createElement("button");
  queryBtn.textContent = "Read POS";
  queryBtn.title = "Send query command to read servo position.";
  const vinBtn = document.createElement("button");
  vinBtn.textContent = "Read VIN";
  vinBtn.title = "Send vin command to read supply voltage.";
  const tempBtn = document.createElement("button");
  tempBtn.textContent = "Read TEMP";
  tempBtn.title = "Send temp command to read servo temperature.";
  const idReadBtn = document.createElement("button");
  idReadBtn.textContent = "Read Actual ID";
  idReadBtn.title = "Query servo-reported ID from current bus ID.";
  const realtimeInput = document.createElement("input");
  realtimeInput.type = "checkbox";
  realtimeInput.checked = true;
  const realtimeLabel = document.createElement("label");
  realtimeLabel.className = "inline-toggle";
  realtimeLabel.append(realtimeInput, document.createTextNode("Realtime Auto Send"));
  actionRow.append(showAxisBtn, moveBtn, queryBtn, vinBtn, tempBtn, idReadBtn, realtimeLabel);

  const actualIdReadout = document.createElement("div");
  actualIdReadout.className = "joint-actual-id-readout";
  actualIdReadout.textContent = "Actual Servo ID: --";
  motionSection.append(sliderLabel, rangeInput, primaryGrid, actionRow, actualIdReadout);

  const advanced = document.createElement("details");
  advanced.className = "joint-advanced";
  const advancedSummary = document.createElement("summary");
  advancedSummary.textContent = "Advanced (limits / mapping / pivot)";
  const advancedGrid = document.createElement("div");
  advancedGrid.className = "advanced-grid";

  const minInput = createNumberInput(state.min, 0, 1000, 1);
  const maxInput = createNumberInput(state.max, 0, 1000, 1);
  const guardMinInput = createNumberInput(state.guardMin, 0, 1000, 1);
  const guardMaxInput = createNumberInput(state.guardMax, 0, 1000, 1);
  const minDegInput = createNumberInput(state.minDeg, -360, 360, 0.1);
  const maxDegInput = createNumberInput(state.maxDeg, -360, 360, 0.1);
  const commandScaleInput = createNumberInput(state.commandScale, 0.05, 1, 0.01);
  const defaultPosInput = createNumberInput(state.defaultPos, 0, 1000, 1);
  const pivotXInput = createNumberInput(state.pivot[0], -5000, 5000, 0.1);
  const pivotYInput = createNumberInput(state.pivot[1], -5000, 5000, 0.1);
  const pivotZInput = createNumberInput(state.pivot[2], -5000, 5000, 0.1);
  const axisInput = createSelectInput(
    [
      { value: "x", label: "X" },
      { value: "y", label: "Y" },
      { value: "z", label: "Z" }
    ],
    state.axis
  );
  const invertInput = document.createElement("input");
  invertInput.type = "checkbox";
  invertInput.checked = !!state.invert;
  const pivotCenterBtn = document.createElement("button");
  pivotCenterBtn.type = "button";
  pivotCenterBtn.textContent = "Pivot = Mesh Center";
  pivotCenterBtn.title = "Set pivot to geometric center of current joint mesh.";
  const pivotSpace = normalizePivotSpace(state.pivotSpace, "world");
  advancedGrid.append(
    createControlField("Min Pos", minInput),
    createControlField("Max Pos", maxInput),
    createControlField("Guard Min", guardMinInput),
    createControlField("Guard Max", guardMaxInput),
    createControlField("Min Deg", minDegInput),
    createControlField("Max Deg", maxDegInput),
    createControlField("Cmd Gain", commandScaleInput),
    createControlField(`Pivot X (${pivotSpace})`, pivotXInput),
    createControlField(`Pivot Y (${pivotSpace})`, pivotYInput),
    createControlField(`Pivot Z (${pivotSpace})`, pivotZInput),
    createControlField("Axis", axisInput),
    createControlField("Invert", invertInput),
    createControlField("Default Pos", defaultPosInput)
  );
  setControlFieldLabels(advancedGrid, [
    "Min Pos", "Max Pos", "Guard Min", "Guard Max",
    "Min Deg", "Max Deg", "Cmd Gain",
    `Pivot X (${pivotSpace})`, `Pivot Y (${pivotSpace})`, `Pivot Z (${pivotSpace})`,
    "Axis", "Invert", "Default Pos"
  ]);

  const advancedActionRow = document.createElement("div");
  advancedActionRow.className = "advanced-action-row";
  advancedActionRow.append(pivotCenterBtn);

  advanced.append(advancedSummary, advancedGrid, advancedActionRow);
  card.append(header, motionSection, advanced);
  replaceMojibakeInDom(card);

  return {
    card,
    refs: {
      header,
      rangeInput,
      valueInput,
      timeInput,
      idInput,
      minInput,
      maxInput,
      guardMinInput,
      guardMaxInput,
      minDegInput,
      maxDegInput,
      commandScaleInput,
      axisInput,
      invertInput,
      defaultPosInput,
      pivotXInput,
      pivotYInput,
      pivotZInput,
      realtimeInput,
      showAxisBtn,
      moveBtn,
      queryBtn,
      vinBtn,
      tempBtn,
      idReadBtn,
      pivotCenterBtn,
      idChip,
      posChip,
      degChip,
      actualIdChip,
      actualIdReadout,
      vinChip,
      tempChip
    }
  };
}
