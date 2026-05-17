export function renderServoPanelLayout({
  frontMinimalMode,
  servoPanel,
  panelHeader,
  panelTools,
  viewTools,
  configTools,
  presetTools,
  coordTools,
  coordReadout,
  physicalTools,
  demoTools,
  demoLegend,
  demoVisualGrid,
  demoReadout,
  grid,
  createPanelSection
}) {
  if (frontMinimalMode) {
    const commonSection = createPanelSection(
      "Arm Controls",
      "Essential runtime actions for real-arm commissioning.",
      [panelTools],
      { collapsible: false }
    );
    servoPanel.append(panelHeader, commonSection, grid);
    return;
  }

  const commonSection = createPanelSection(
    "Global Controls",
    "Polling, camera presets, and config write actions.",
    [panelTools, viewTools, configTools],
    { collapsible: false }
  );
  const presetSection = createPanelSection(
    "Presets",
    "Save/load parameter snapshots for quick demos.",
    [presetTools],
    { collapsible: true, open: false }
  );
  const coordSection = createPanelSection(
    "Coordinate Probe",
    "Locate points in 3D and compare coordinate spaces.",
    [coordTools, coordReadout],
    { collapsible: true, open: true }
  );
  const physicalSection = createPanelSection(
    "Closed-Chain & Axis",
    "Edit J2/J3/J4 linkage params and axis lines.",
    [physicalTools],
    { collapsible: true, open: true }
  );
  const demoSection = createPanelSection(
    "IK + Pseudo-FEA Demo",
    "Fast visual demo mode; not a real material simulation.",
    [demoTools, demoLegend, demoVisualGrid, demoReadout],
    { collapsible: true, open: false }
  );

  servoPanel.append(
    panelHeader,
    commonSection,
    presetSection,
    coordSection,
    physicalSection,
    demoSection,
    grid
  );
}
