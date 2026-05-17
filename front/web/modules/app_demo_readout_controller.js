export function createDemoReadoutController({
  demoTrendTitle,
  demoTrendCanvas,
  demoReadout,
  demoReachBadge,
  demoFeaBadge,
  ikErrorMetric,
  stressJ2Metric,
  stressJ3Metric,
  stressJ4Metric,
  deformMetric,
  demoTargetXInput,
  demoTargetYInput,
  demoTargetZInput,
  demoWristPitchInput,
  demoPayloadInput,
  demoEnabledInput,
  demoAutoFeaInput,
  demoElbowSelect,
  demoRuntime,
  demoArmModel,
  assemblyLockRuntime,
  runDemoForwardFromCurrentPose,
  runDemoInverseKinematics,
  pushDemoTrendSample,
  drawDemoTrendChart,
  normalizeDemoTrendWindowMs,
  getTrendWindowMs,
  clampNumber,
  toFiniteNumber,
  syncDemoRuntimeIntoLoadedConfig,
  updateDemoOverlay
}) {
  const updateDemoTrendTitle = () => {
    const sec = Math.round(normalizeDemoTrendWindowMs(getTrendWindowMs()) / 1000);
    demoTrendTitle.textContent = `Trend (${sec}s): error / stress / deformation`;
  };

  const getDemoTargetInput = () => ({
    x: clampNumber(demoTargetXInput.value, -2000, 2000, demoRuntime.target.x),
    y: clampNumber(demoTargetYInput.value, -2000, 2000, demoRuntime.target.y),
    z: clampNumber(demoTargetZInput.value, -2000, 2000, demoRuntime.target.z)
  });

  const setDemoTargetInput = (target) => {
    if (!target) return;
    demoTargetXInput.value = String(Number(target.x || 0));
    demoTargetYInput.value = String(Number(target.y || 0));
    demoTargetZInput.value = String(Number(target.z || 0));
  };

  const formatTriplet = (obj) => {
    if (!obj) return "(n/a)";
    const x = Number(obj.x || 0).toFixed(2);
    const y = Number(obj.y || 0).toFixed(2);
    const z = Number(obj.z || 0).toFixed(2);
    return `(${x}, ${y}, ${z})`;
  };

  const metricToneColor = (ratio) => {
    const r = clampNumber(ratio, 0, 1, 0);
    if (r < 0.42) return "#35c679";
    if (r < 0.75) return "#f8a61f";
    return "#ff4a45";
  };

  const setMetricValue = (metric, ratio, valueText) => {
    if (!metric) return;
    const safeRatio = clampNumber(ratio, 0, 1, 0);
    metric.value.textContent = valueText;
    metric.fill.style.width = `${(safeRatio * 100).toFixed(1)}%`;
    metric.fill.style.background = metricToneColor(safeRatio);
  };

  const setBadgeState = (badge, text, tone = "neutral") => {
    if (!badge) return;
    badge.textContent = text;
    badge.className = `demo-badge tone-${tone}`;
  };

  const updateDemoReadout = () => {
    const fk = runDemoForwardFromCurrentPose();
    const ikPreview = runDemoInverseKinematics(demoArmModel, demoRuntime.target, {
      elbow: demoRuntime.elbow,
      wristPitchDeg: demoRuntime.wristPitchDeg
    });
    const ik = demoRuntime.lastIk;
    const fea = demoRuntime.lastFea;

    const target = {
      x: toFiniteNumber(demoRuntime.target?.x, 0),
      y: toFiniteNumber(demoRuntime.target?.y, 0),
      z: toFiniteNumber(demoRuntime.target?.z, 0)
    };
    const liveError = {
      x: target.x - toFiniteNumber(fk?.tcp?.x, 0),
      y: target.y - toFiniteNumber(fk?.tcp?.y, 0),
      z: target.z - toFiniteNumber(fk?.tcp?.z, 0)
    };
    const liveErrorNorm = Math.hypot(liveError.x, liveError.y, liveError.z);
    const feaMaxRatio = Number.isFinite(Number(fea?.summary?.maxRatio))
      ? Number(fea.summary.maxRatio)
      : NaN;
    const feaDeformationMm = Number.isFinite(Number(fea?.summary?.totalDeformationMm))
      ? Number(fea.summary.totalDeformationMm)
      : NaN;

    updateDemoOverlay({
      forceVisible: demoRuntime.enabled,
      fk,
      ikPreview
    });

    const ikErrorRatio = clampNumber(liveErrorNorm / 40, 0, 1, 0);
    setMetricValue(ikErrorMetric, ikErrorRatio, `${liveErrorNorm.toFixed(2)} mm`);

    if (ikPreview) {
      setBadgeState(
        demoReachBadge,
        ikPreview.reachable ? "IK reachable" : "IK unreachable (outside workspace)",
        ikPreview.reachable ? "ok" : "bad"
      );
    } else {
      setBadgeState(demoReachBadge, "IK not solved", "neutral");
    }

    if (fea?.summary) {
      const r2 = clampNumber(Number(fea.byTarget?.j2?.stressRatio ?? 0), 0, 1.2, 0);
      const r3 = clampNumber(Number(fea.byTarget?.j3?.stressRatio ?? 0), 0, 1.2, 0);
      const r4 = clampNumber(Number(fea.byTarget?.j4?.stressRatio ?? 0), 0, 1.2, 0);
      setMetricValue(stressJ2Metric, r2 / 1.2, `${r2.toFixed(2)} ratio`);
      setMetricValue(stressJ3Metric, r3 / 1.2, `${r3.toFixed(2)} ratio`);
      setMetricValue(stressJ4Metric, r4 / 1.2, `${r4.toFixed(2)} ratio`);

      const deformMm = Number(fea.summary.totalDeformationMm || 0);
      setMetricValue(deformMetric, clampNumber(deformMm / 18, 0, 1, 0), `${deformMm.toFixed(2)} mm`);

      const maxRatio = Number(fea.summary.maxRatio || 0);
      setBadgeState(
        demoFeaBadge,
        `Pseudo-FEA max ratio ${maxRatio.toFixed(2)}`,
        maxRatio < 0.45 ? "ok" : (maxRatio < 0.8 ? "warn" : "bad")
      );
    } else {
      setMetricValue(stressJ2Metric, 0, "--");
      setMetricValue(stressJ3Metric, 0, "--");
      setMetricValue(stressJ4Metric, 0, "--");
      setMetricValue(deformMetric, 0, "--");
      setBadgeState(demoFeaBadge, "Pseudo-FEA not run", "neutral");
    }

    pushDemoTrendSample({
      errorMm: liveErrorNorm,
      maxRatio: feaMaxRatio,
      deformationMm: feaDeformationMm
    });
    drawDemoTrendChart(demoTrendCanvas);

    const lines = [];
    lines.push(`Mode: ${demoRuntime.enabled ? "Demo ON" : "Demo OFF"} (for fast visualization, not physical truth)`);
    lines.push(
      `Assembly Lock: ${assemblyLockRuntime.enabled ? "ON" : "OFF"}, ` +
      `coupling=${assemblyLockRuntime.disableCouplings ? "disabled" : "enabled"}, ` +
      `autoPivot=${assemblyLockRuntime.autoInferPivots ? "on" : "off"}`
    );
    lines.push(`Trend Window: ${Math.round(normalizeDemoTrendWindowMs(getTrendWindowMs()) / 1000)}s`);
    lines.push(
      `Geometry (mm): H=${demoArmModel.baseHeight.toFixed(2)} ` +
      `L2=${demoArmModel.link2.toFixed(3)} L3=${demoArmModel.link3.toFixed(3)} Tool=${demoArmModel.tool.toFixed(2)}`
    );
    lines.push(`FK (robot_local): ${formatTriplet(fk?.tcp)}`);
    lines.push(`Target (robot_local): ${formatTriplet(target)}`);
    lines.push(
      `Error: dx=${liveError.x.toFixed(3)} dy=${liveError.y.toFixed(3)} dz=${liveError.z.toFixed(3)} ` +
      `|d|=${liveErrorNorm.toFixed(3)} mm`
    );

    if (ikPreview) {
      lines.push(
        `IK Preview: elbow=${ikPreview.elbow}, reachable=${ikPreview.reachable ? "yes" : "no"}, ` +
        `residual=${Number(ikPreview.errorNorm || 0).toFixed(3)} mm`
      );
    }

    if (ik?.jointDeg) {
      lines.push(
        `Solve IK: J1=${ik.jointDeg.j1.toFixed(2)} J2=${ik.jointDeg.j2.toFixed(2)} ` +
        `J3=${ik.jointDeg.j3.toFixed(2)} J4=${ik.jointDeg.j4.toFixed(2)}`
      );
    } else {
      lines.push("Solve IK: not executed");
    }

    if (fea?.summary) {
      lines.push(
        `Pseudo-FEA: payload=${Number(fea.payloadNewton || 0).toFixed(2)}N, ` +
        `maxRatio=${Number(fea.summary.maxRatio || 0).toFixed(3)}, ` +
        `maxStress=${Number(fea.summary.maxStressMpa || 0).toFixed(3)}MPa, ` +
        `deformation=${Number(fea.summary.totalDeformationMm || 0).toFixed(3)}mm`
      );
    } else {
      lines.push("Pseudo-FEA: not executed");
    }
    demoReadout.textContent = lines.join("\n");
  };

  const commitDemoRuntimeFromInputs = ({ syncTarget = true } = {}) => {
    demoRuntime.enabled = !!demoEnabledInput.checked;
    demoRuntime.autoFea = !!demoAutoFeaInput.checked;
    demoRuntime.elbow = String(demoElbowSelect.value || "down").trim().toLowerCase() === "up" ? "up" : "down";
    demoRuntime.wristPitchDeg = clampNumber(demoWristPitchInput.value, -180, 180, demoRuntime.wristPitchDeg);
    demoRuntime.payloadNewton = clampNumber(demoPayloadInput.value, 0, 1000, demoRuntime.payloadNewton);
    if (syncTarget) {
      demoRuntime.target = getDemoTargetInput();
      setDemoTargetInput(demoRuntime.target);
    }
    demoWristPitchInput.value = String(demoRuntime.wristPitchDeg);
    demoPayloadInput.value = String(demoRuntime.payloadNewton);
    syncDemoRuntimeIntoLoadedConfig();
    updateDemoReadout();
  };

  return {
    updateDemoTrendTitle,
    getDemoTargetInput,
    setDemoTargetInput,
    updateDemoReadout,
    commitDemoRuntimeFromInputs
  };
}
