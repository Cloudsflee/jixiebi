export function createDemoController({
  demoTrendWindowSelect,
  demoTrendClearBtn,
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
  getTrendWindowMs,
  setTrendWindowMs,
  normalizeDemoTrendWindowMs,
  trimDemoTrendHistory,
  updateDemoTrendTitle,
  drawDemoTrendChart,
  demoTrendCanvas,
  commitDemoRuntimeFromInputs,
  updateDemoReadout,
  demoRuntime,
  resetDemoTrendHistory,
  clearDemoFeaVisualization,
  runDemoFeaFromCurrentPose,
  runDemoForwardFromCurrentPose,
  runDemoInverseAndApply,
  setDemoTargetInput,
  toWorldPointFromRobotLocal,
  showCoordinateProbe,
  updateCoordReadout,
  syncDemoRuntimeIntoLoadedConfig,
  log
}) {
  demoTrendWindowSelect.addEventListener("change", () => {
    const nextMs = normalizeDemoTrendWindowMs(demoTrendWindowSelect.value, getTrendWindowMs());
    setTrendWindowMs(nextMs);
    demoTrendWindowSelect.value = String(nextMs);
    trimDemoTrendHistory();
    updateDemoTrendTitle();
    drawDemoTrendChart(demoTrendCanvas);
    updateDemoReadout();
    log("Demo trend window changed", { windowSeconds: Math.round(nextMs / 1000) });
  });

  demoTrendClearBtn.addEventListener("click", () => {
    resetDemoTrendHistory();
    drawDemoTrendChart(demoTrendCanvas);
    log("Demo trend history cleared");
  });

  demoEnabledInput.addEventListener("change", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    resetDemoTrendHistory();
    updateDemoTrendTitle();
    drawDemoTrendChart(demoTrendCanvas);
    if (!demoRuntime.enabled) {
      demoRuntime.lastFea = null;
      clearDemoFeaVisualization();
    } else if (demoRuntime.autoFea) {
      runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
    }
    updateDemoReadout();
    log("Demo IK/FEA mode changed", { enabled: demoRuntime.enabled, autoFea: demoRuntime.autoFea });
  });

  demoAutoFeaInput.addEventListener("change", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    if (demoRuntime.enabled && demoRuntime.autoFea) {
      runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
    }
    updateDemoReadout();
  });

  [demoElbowSelect, demoWristPitchInput, demoPayloadInput].forEach((input) => {
    input.addEventListener("change", () => {
      commitDemoRuntimeFromInputs({ syncTarget: true });
      if (demoRuntime.enabled && demoRuntime.autoFea) {
        runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
      }
      updateDemoReadout();
    });
  });

  [demoTargetXInput, demoTargetYInput, demoTargetZInput].forEach((input) => {
    input.addEventListener("change", () => {
      commitDemoRuntimeFromInputs({ syncTarget: true });
    });
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        commitDemoRuntimeFromInputs({ syncTarget: true });
      }
    });
  });

  demoFromFkBtn.addEventListener("click", () => {
    const fk = runDemoForwardFromCurrentPose();
    demoRuntime.lastFk = fk;
    if (fk?.tcp) {
      demoRuntime.target = { x: fk.tcp.x, y: fk.tcp.y, z: fk.tcp.z };
      setDemoTargetInput(demoRuntime.target);
      const worldPoint = toWorldPointFromRobotLocal(fk.tcp);
      showCoordinateProbe(worldPoint);
      updateCoordReadout(worldPoint, "robot_local");
    }
    syncDemoRuntimeIntoLoadedConfig();
    updateDemoReadout();
    log("Demo target captured from FK", { target: demoRuntime.target });
  });

  demoSolveIkBtn.addEventListener("click", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    const ik = runDemoInverseAndApply(demoRuntime.target, {
      elbow: demoRuntime.elbow,
      wristPitchDeg: demoRuntime.wristPitchDeg
    });
    if (ik?.target) {
      const worldPoint = toWorldPointFromRobotLocal(ik.target);
      showCoordinateProbe(worldPoint);
      updateCoordReadout(worldPoint, "robot_local");
    }
    updateDemoReadout();
    log("Demo IK solved", {
      reachable: ik?.reachable === true,
      errorMm: Number(ik?.errorNorm || 0).toFixed(3)
    });
  });

  demoRunFeaBtn.addEventListener("click", () => {
    commitDemoRuntimeFromInputs({ syncTarget: true });
    const fea = runDemoFeaFromCurrentPose(demoRuntime.payloadNewton);
    updateDemoReadout();
    log("Pseudo FEA updated", {
      payloadN: Number(fea?.payloadNewton || 0).toFixed(2),
      maxRatio: Number(fea?.summary?.maxRatio || 0).toFixed(3)
    });
  });

  demoClearFeaBtn.addEventListener("click", () => {
    demoRuntime.lastFea = null;
    clearDemoFeaVisualization();
    updateDemoReadout();
    log("Pseudo FEA visualization cleared");
  });
}
