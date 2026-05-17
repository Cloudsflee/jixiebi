export function createPhysicalAxisController({
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
  axisSlideBtn,
  getLoadedJointConfig,
  setLoadedJointConfig,
  fallbackConfig,
  normalizePhysicalPointSpace,
  normalizeAxisVectorArray,
  safeAxis,
  normalizePivotArray,
  parseOptionalVec3,
  toFiniteNumber,
  clampNumber,
  toVec3,
  cloneConfig,
  findJointStateByTarget,
  getJointPivotWorldFromState,
  convertWorldPointToPhysicalSpace,
  robotLocalToWorld,
  worldToRobotLocal,
  getParentAxisVectorForTarget,
  setParentAxisVectorForTarget,
  ensurePhysicalKinematicsConfig,
  ensurePhysicalJointConfigEntry,
  applyMotionLocksFromConfig,
  applyJointPivot,
  applyJointVisual,
  initAutomaticPinConstraint,
  getAutoPinConstraintReady,
  getAutomaticPinConstraint,
  applyAutomaticPinConstraint,
  updateAxisHelperFromSelectedJoint,
  getSelectedJointState,
  setSelectedJointState,
  showCoordinateProbe,
  updateCoordReadout,
  getAxisLineEditorState,
  startAxisLineEditor,
  stopAxisLineEditor,
  setAxisLineEditorMode,
  setAxisLineEditorLinePinned,
  setAxisLineEditorOnAxisUpdated,
  setAxisLineEditorOnStateChanged,
  log
}) {
  const physicalDraft = {
    enabled: false,
    type: "four_bar_dual_hole",
    space: "robot_local",
    planeAxis: "z",
    driverTarget: "j2",
    branch: "closest",
    joints: {
      j2: { target: "j2", pivot: [0, 0, 0], activeLinkLength: 0, angleOffsetDeg: 0 },
      j3: { target: "j3", pivot: [0, 0, 0], activeLinkLength: 0, angleOffsetDeg: 0 },
      j4: { target: "j4", pivot: [0, 0, 0], angleOffsetDeg: 0 }
    },
    endEffector: {
      yellowHoleLocal: [0, 0, 0],
      greenHoleLocal: [0, 0, 0]
    }
  };

  const pullPhysicalDraftFromConfig = () => {
    const currentLoaded = getLoadedJointConfig();
    const sourceConfig = currentLoaded && typeof currentLoaded === "object"
      ? currentLoaded
      : fallbackConfig;
    const raw = sourceConfig?.physicalKinematics && typeof sourceConfig.physicalKinematics === "object"
      ? sourceConfig.physicalKinematics
      : {};

    physicalDraft.enabled = raw.enabled === true;
    physicalDraft.type = String(raw.type || "four_bar_dual_hole");
    physicalDraft.space = normalizePhysicalPointSpace(raw.space, "robot_local");
    physicalDraft.planeAxis = safeAxis(raw.planeAxis || "z");
    physicalDraft.driverTarget = String(raw.driverTarget || "j2");
    physicalDraft.branch = String(raw.branch || "closest");
    physicalDraft.endEffector.yellowHoleLocal = normalizePivotArray(raw?.endEffector?.yellowHoleLocal, [0, 0, 0]);
    physicalDraft.endEffector.greenHoleLocal = normalizePivotArray(raw?.endEffector?.greenHoleLocal, [0, 0, 0]);

    const jointsRaw = raw?.joints && typeof raw.joints === "object" ? raw.joints : {};
    ["j2", "j3", "j4"].forEach((key) => {
      const jointRaw = jointsRaw[key] && typeof jointsRaw[key] === "object" ? jointsRaw[key] : {};
      const target = String(jointRaw.target || key);
      let pivot = parseOptionalVec3(jointRaw.pivot);
      if (!pivot) {
        const state = findJointStateByTarget(target);
        if (state) {
          const pivotWorld = getJointPivotWorldFromState(state);
          const convertedPivot = convertWorldPointToPhysicalSpace(pivotWorld, physicalDraft.space);
          pivot = [convertedPivot.x, convertedPivot.y, convertedPivot.z];
        } else {
          pivot = [0, 0, 0];
        }
      }

      const existingLength = toFiniteNumber(physicalDraft.joints[key]?.activeLinkLength, 0);
      const parsedLength = Math.max(0, toFiniteNumber(jointRaw.activeLinkLength, existingLength));
      physicalDraft.joints[key] = {
        target,
        pivot: normalizePivotArray(pivot, [0, 0, 0]),
        activeLinkLength: key === "j4" ? 0 : parsedLength,
        angleOffsetDeg: toFiniteNumber(jointRaw.angleOffsetDeg, 0)
      };
    });
  };

  const captureActivePhysicalPivotInputs = () => {
    const key = String(physicalTargetSelect.value || "j2");
    const entry = physicalDraft.joints[key];
    if (!entry) return;
    const current = normalizePivotArray(entry.pivot, [0, 0, 0]);
    entry.pivot = [
      clampNumber(physicalPivotXInput.value, -99999, 99999, current[0]),
      clampNumber(physicalPivotYInput.value, -99999, 99999, current[1]),
      clampNumber(physicalPivotZInput.value, -99999, 99999, current[2])
    ];
  };

  const syncPhysicalInputsFromDraft = () => {
    physicalEnabledInput.checked = physicalDraft.enabled === true;
    physicalSpaceSelect.value = normalizePhysicalPointSpace(physicalDraft.space, "robot_local");

    const key = String(physicalTargetSelect.value || "j2");
    const entry = physicalDraft.joints[key] || physicalDraft.joints.j2;
    const pivot = normalizePivotArray(entry?.pivot, [0, 0, 0]);
    physicalPivotXInput.value = String(pivot[0]);
    physicalPivotYInput.value = String(pivot[1]);
    physicalPivotZInput.value = String(pivot[2]);

    physicalJ2LengthInput.value = String(Math.max(0, toFiniteNumber(physicalDraft.joints.j2?.activeLinkLength, 0)));
    physicalJ3LengthInput.value = String(Math.max(0, toFiniteNumber(physicalDraft.joints.j3?.activeLinkLength, 0)));
  };

  const syncAxisInputsFromRuntime = () => {
    const target = String(axisTargetSelect.value || "j2");
    const axis = getParentAxisVectorForTarget(target);
    axisDirXInput.value = String(axis[0]);
    axisDirYInput.value = String(axis[1]);
    axisDirZInput.value = String(axis[2]);
  };

  const applyAxisInputsToRuntime = () => {
    const target = String(axisTargetSelect.value || "j2");
    const fallback = getParentAxisVectorForTarget(target);
    const normalized = normalizeAxisVectorArray(
      [
        clampNumber(axisDirXInput.value, -99999, 99999, fallback[0]),
        clampNumber(axisDirYInput.value, -99999, 99999, fallback[1]),
        clampNumber(axisDirZInput.value, -99999, 99999, fallback[2])
      ],
      fallback
    );

    const applied = setParentAxisVectorForTarget(target, normalized, {
      updateConfig: true,
      applyVisual: true
    }) || normalized;
    axisDirXInput.value = String(applied[0]);
    axisDirYInput.value = String(applied[1]);
    axisDirZInput.value = String(applied[2]);

    log("Parent-axis line updated", {
      target,
      axisParent: applied.map((v) => Number(v.toFixed(6)))
    });
  };

  const syncAxisEditorButtons = () => {
    const target = String(axisTargetSelect.value || "j2");
    const axisState = getAxisLineEditorState();
    const editingThis = axisState.active && axisState.target === target;
    axisDragBtn.textContent = "Drag Axis Dir";
    axisPickBtn.textContent = "Pick Axis (Out->In)";
    axisSlideBtn.textContent = "Slide Pivot On Axis";
    axisPinBtn.textContent = "Pin Line Pos";
    axisPinBtn.disabled = !editingThis;
  };

  const convertPhysicalDraftSpace = (nextSpace) => {
    const prevSpace = normalizePhysicalPointSpace(physicalDraft.space, "robot_local");
    const normalizedNext = normalizePhysicalPointSpace(nextSpace, prevSpace);
    if (prevSpace === normalizedNext) {
      physicalDraft.space = normalizedNext;
      return;
    }

    ["j2", "j3", "j4"].forEach((key) => {
      const entry = physicalDraft.joints[key];
      if (!entry) return;
      const current = toVec3(normalizePivotArray(entry.pivot, [0, 0, 0]));
      const worldPoint = prevSpace === "world" ? current : robotLocalToWorld(current);
      const nextPoint = normalizedNext === "world" ? worldPoint : worldToRobotLocal(worldPoint);
      entry.pivot = [nextPoint.x, nextPoint.y, nextPoint.z];
    });

    physicalDraft.space = normalizedNext;
  };

  const applyPhysicalDraftToRuntime = () => {
    captureActivePhysicalPivotInputs();
    physicalDraft.enabled = !!physicalEnabledInput.checked;
    physicalDraft.joints.j2.activeLinkLength = Math.max(0, clampNumber(
      physicalJ2LengthInput.value,
      0,
      99999,
      toFiniteNumber(physicalDraft.joints.j2.activeLinkLength, 0)
    ));
    physicalDraft.joints.j3.activeLinkLength = Math.max(0, clampNumber(
      physicalJ3LengthInput.value,
      0,
      99999,
      toFiniteNumber(physicalDraft.joints.j3.activeLinkLength, 0)
    ));

    const nextConfig = cloneConfig(getLoadedJointConfig() || fallbackConfig);
    const physical = ensurePhysicalKinematicsConfig(nextConfig);
    if (!physical) return;

    physical.enabled = physicalDraft.enabled;
    physical.type = physicalDraft.type;
    physical.space = normalizePhysicalPointSpace(physicalDraft.space, "robot_local");
    physical.planeAxis = safeAxis(physicalDraft.planeAxis || "z");
    physical.driverTarget = String(physicalDraft.driverTarget || "j2");
    physical.branch = String(physicalDraft.branch || "closest");
    physical.endEffector.yellowHoleLocal = normalizePivotArray(physicalDraft.endEffector.yellowHoleLocal, [0, 0, 0]);
    physical.endEffector.greenHoleLocal = normalizePivotArray(physicalDraft.endEffector.greenHoleLocal, [0, 0, 0]);

    ["j2", "j3", "j4"].forEach((key) => {
      const src = physicalDraft.joints[key] || {};
      const entry = ensurePhysicalJointConfigEntry(physical, key);
      entry.target = String(src.target || entry.target || key);
      entry.pivot = normalizePivotArray(src.pivot, [0, 0, 0]);
      entry.angleOffsetDeg = toFiniteNumber(src.angleOffsetDeg, toFiniteNumber(entry.angleOffsetDeg, 0));
      if (key === "j2" || key === "j3") {
        entry.activeLinkLength = Math.max(0, toFiniteNumber(src.activeLinkLength, toFiniteNumber(entry.activeLinkLength, 0)));
      }
    });

    setLoadedJointConfig(nextConfig);
    applyMotionLocksFromConfig(getLoadedJointConfig());

    const pointSpace = normalizePhysicalPointSpace(physical.space, "robot_local");
    ["j2", "j3", "j4"].forEach((key) => {
      const entry = physical.joints?.[key];
      if (!entry) return;
      const state = findJointStateByTarget(String(entry.target || key));
      if (!state) return;
      const pivotConfig = toVec3(normalizePivotArray(entry.pivot, [0, 0, 0]));
      const pivotLocal = pointSpace === "world" ? worldToRobotLocal(pivotConfig) : pivotConfig;
      state.pivotSpace = "local";
      applyJointPivot(state, [pivotLocal.x, pivotLocal.y, pivotLocal.z]);
      applyJointVisual(state, state.currentPos, { lockClosureForSelf: true });
    });

    initAutomaticPinConstraint();
    const automaticPinConstraint = getAutomaticPinConstraint();
    if (getAutoPinConstraintReady() && automaticPinConstraint?.mode === "physical_four_bar") {
      const driver = findJointStateByTarget(automaticPinConstraint.driverTarget) || findJointStateByTarget("j2");
      applyAutomaticPinConstraint({ sourceState: driver });
    }
    updateAxisHelperFromSelectedJoint();
    syncPhysicalInputsFromDraft();

    log("Physical calibration applied", {
      enabled: physical.enabled,
      space: physical.space,
      j2LinkMm: Number(physical.joints?.j2?.activeLinkLength || 0).toFixed(3),
      j3LinkMm: Number(physical.joints?.j3?.activeLinkLength || 0).toFixed(3)
    });
  };

  setAxisLineEditorOnAxisUpdated((axisParent, target) => {
    const t = String(target || "j2");
    if (axisTargetSelect.value !== t) {
      axisTargetSelect.value = t;
    }
    axisDirXInput.value = String(axisParent[0]);
    axisDirYInput.value = String(axisParent[1]);
    axisDirZInput.value = String(axisParent[2]);
    const applied = setParentAxisVectorForTarget(t, axisParent, {
      updateConfig: true,
      applyVisual: true
    }) || axisParent;
    axisDirXInput.value = String(applied[0]);
    axisDirYInput.value = String(applied[1]);
    axisDirZInput.value = String(applied[2]);
    syncAxisEditorButtons();
  });

  setAxisLineEditorOnStateChanged(() => {
    syncAxisEditorButtons();
  });

  [physicalPivotXInput, physicalPivotYInput, physicalPivotZInput].forEach((input) => {
    input.addEventListener("change", () => {
      captureActivePhysicalPivotInputs();
      syncPhysicalInputsFromDraft();
    });
  });

  physicalTargetSelect.addEventListener("change", () => {
    captureActivePhysicalPivotInputs();
    syncPhysicalInputsFromDraft();
  });

  physicalSpaceSelect.addEventListener("change", () => {
    captureActivePhysicalPivotInputs();
    convertPhysicalDraftSpace(physicalSpaceSelect.value);
    syncPhysicalInputsFromDraft();
  });

  physicalReloadBtn.addEventListener("click", () => {
    captureActivePhysicalPivotInputs();
    pullPhysicalDraftFromConfig();
    syncPhysicalInputsFromDraft();
    log("Physical config reloaded from current joints.json state");
  });

  physicalUseSelectedPivotBtn.addEventListener("click", () => {
    const selectedJointState = getSelectedJointState();
    if (!selectedJointState) {
      log("No selected joint for use-pivot operation.");
      return;
    }

    captureActivePhysicalPivotInputs();
    const key = String(physicalTargetSelect.value || "j2");
    if (!physicalDraft.joints[key]) return;

    const worldPoint = getJointPivotWorldFromState(selectedJointState);
    const point = convertWorldPointToPhysicalSpace(worldPoint, physicalDraft.space);
    physicalDraft.joints[key].pivot = [point.x, point.y, point.z];
    syncPhysicalInputsFromDraft();
    showCoordinateProbe(worldPoint);
    updateCoordReadout(worldPoint, "world");
    log("Loaded selected joint pivot to physical calibration", {
      from: selectedJointState.name,
      to: key,
      space: physicalDraft.space
    });
  });

  physicalApplyBtn.addEventListener("click", () => {
    applyPhysicalDraftToRuntime();
  });

  axisTargetSelect.addEventListener("change", () => {
    syncAxisInputsFromRuntime();
    const axisState = getAxisLineEditorState();
    if (axisState.active) {
      const target = String(axisTargetSelect.value || "j2");
      startAxisLineEditor(target);
      const state = findJointStateByTarget(target);
      if (state) {
        setSelectedJointState(state);
      }
    }
    syncAxisEditorButtons();
  });

  axisReloadBtn.addEventListener("click", () => {
    syncAxisInputsFromRuntime();
  });

  axisApplyBtn.addEventListener("click", () => {
    applyAxisInputsToRuntime();
  });

  axisShowBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const state = findJointStateByTarget(target);
    if (!state) {
      log("Axis target joint not found", { target });
      return;
    }
    setSelectedJointState(state);
  });

  axisDragBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const axisState = getAxisLineEditorState();
    const editingThis = axisState.active && axisState.target === target;
    if (editingThis && axisState.mode === "direction") {
      stopAxisLineEditor();
      log("Axis drag editor stopped", { target });
      return;
    }
    startAxisLineEditor(target);
    setAxisLineEditorMode("direction");
    const state = findJointStateByTarget(target);
    if (state) {
      setSelectedJointState(state);
    }
    syncAxisInputsFromRuntime();
    syncAxisEditorButtons();
    log("Axis direction drag mode enabled", { target });
  });

  axisPickBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const axisState = getAxisLineEditorState();
    const editingThis = axisState.active && axisState.target === target;
    if (editingThis && axisState.mode === "pick") {
      setAxisLineEditorMode("direction");
      syncAxisEditorButtons();
      log("Axis point-pick mode disabled", { target });
      return;
    }

    startAxisLineEditor(target);
    setAxisLineEditorMode("pick");
    const state = findJointStateByTarget(target);
    if (state) {
      setSelectedJointState(state);
    }
    syncAxisInputsFromRuntime();
    syncAxisEditorButtons();
    log("Axis point-pick mode enabled (click mesh to create outside->inside axis)", { target });
  });

  axisPinBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const axisState = getAxisLineEditorState();
    if (!axisState.active || axisState.target !== target) {
      startAxisLineEditor(target);
      const state = findJointStateByTarget(target);
      if (state) {
        setSelectedJointState(state);
      }
    }

    const latest = getAxisLineEditorState();
    setAxisLineEditorLinePinned(!latest.linePinned);
    syncAxisEditorButtons();
    const after = getAxisLineEditorState();
    log(after.linePinned ? "Axis line position pinned" : "Axis line position unpinned", { target });
  });

  axisSlideBtn.addEventListener("click", () => {
    const target = String(axisTargetSelect.value || "j2");
    const axisState = getAxisLineEditorState();
    const editingThis = axisState.active && axisState.target === target;
    if (editingThis && axisState.mode === "pivot_slide") {
      setAxisLineEditorMode("direction");
      syncAxisEditorButtons();
      log("Axis pivot-slide mode disabled", { target });
      return;
    }

    startAxisLineEditor(target);
    if (!getAxisLineEditorState().linePinned) {
      setAxisLineEditorLinePinned(true);
    }
    setAxisLineEditorMode("pivot_slide");
    const state = findJointStateByTarget(target);
    if (state) {
      setSelectedJointState(state);
    }
    syncAxisInputsFromRuntime();
    syncAxisEditorButtons();
    log("Axis pivot-slide mode enabled (pivot constrained on axis)", {
      target,
      linePinned: getAxisLineEditorState().linePinned
    });
  });

  return {
    pullPhysicalDraftFromConfig,
    syncPhysicalInputsFromDraft,
    syncAxisInputsFromRuntime,
    syncAxisEditorButtons,
    applyPhysicalDraftToRuntime
  };
}
