export function populateCalibrationUiRuntime(app) {
  if (!app.dom.calibJoint) {
    return;
  }

  app.dom.calibJoint.innerHTML = "";
  for (const def of app.jointDefs.values()) {
    const option = document.createElement("option");
    option.value = def.name;
    option.textContent = def.name;
    app.dom.calibJoint.appendChild(option);
  }
  app.syncCalibrationInputs();
}

export function syncCalibrationInputsRuntime(app, deps) {
  const { toFixed3 } = deps;
  const name = app.dom.calibJoint?.value || (Array.from(app.jointDefs.keys())[0] || "");
  const def = app.jointDefs.get(name);
  if (!def) {
    return;
  }

  if (app.dom.pivotX) app.dom.pivotX.value = toFixed3(def.pivot[0]);
  if (app.dom.pivotY) app.dom.pivotY.value = toFixed3(def.pivot[1]);
  if (app.dom.pivotZ) app.dom.pivotZ.value = toFixed3(def.pivot[2]);
  if (app.dom.axisX) app.dom.axisX.value = toFixed3(def.axis.x);
  if (app.dom.axisY) app.dom.axisY.value = toFixed3(def.axis.y);
  if (app.dom.axisZ) app.dom.axisZ.value = toFixed3(def.axis.z);
}

export function recomputeJointFramesRuntime(app, deps) {
  const { THREE } = deps;
  for (const def of app.jointDefs.values()) {
    const node = app.jointNodes.get(def.name);
    const content = app.jointContents.get(def.name);
    if (!node || !content) {
      continue;
    }
    const pivot = new THREE.Vector3().fromArray(def.pivot);
    node.position.copy(pivot);
    content.position.copy(pivot).multiplyScalar(-1);
  }
}

export function applyCalibrationRuntime(app, deps) {
  const { THREE, toFixed3, toFiniteNumber } = deps;
  const name = app.dom.calibJoint?.value;
  const def = app.jointDefs.get(name);
  if (!def) {
    return;
  }

  const pivot = [
    toFiniteNumber(app.dom.pivotX?.value, 0),
    toFiniteNumber(app.dom.pivotY?.value, 0),
    toFiniteNumber(app.dom.pivotZ?.value, 0)
  ];
  const axis = new THREE.Vector3(
    toFiniteNumber(app.dom.axisX?.value, 0),
    toFiniteNumber(app.dom.axisY?.value, 1),
    toFiniteNumber(app.dom.axisZ?.value, 0)
  );

  if (axis.lengthSq() < 1e-8) {
    app.log("Axis vector invalid, ignored", { joint: name });
    return;
  }

  axis.normalize();
  def.pivot = pivot;
  def.axis.copy(axis);

  if (def.rawRef) {
    def.rawRef.pivot = pivot.slice(0, 3);
    def.rawRef.axis = [axis.x, axis.y, axis.z];
  }

  app.recomputeJointFrames();
  app.applyJointAngles();
  app.updateEefReadout();

  const helper = app.axisHelpers.get(name);
  if (helper) {
    helper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  }

  app.log("Joint frame applied", {
    joint: name,
    pivot,
    axis: [toFixed3(axis.x), toFixed3(axis.y), toFixed3(axis.z)]
  });
}

export function writeSelectedJointRuntime(app) {
  const name = app.dom.calibJoint?.value;
  const def = app.jointDefs.get(name);
  if (!def) {
    return;
  }

  const payload = {
    name: def.name,
    target: def.target,
    parent: def.parent,
    axis: [Number(def.axis.x.toFixed(6)), Number(def.axis.y.toFixed(6)), Number(def.axis.z.toFixed(6))],
    pivot: def.pivot.map((v) => Number(v.toFixed(4))),
    minDeg: def.minDeg,
    maxDeg: def.maxDeg,
    defaultDeg: Number((app.jointAngles[def.name] ?? def.defaultDeg).toFixed(4))
  };

  const text = JSON.stringify(payload, null, 2);

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  } catch {}

  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${def.name}.json`;
  a.click();
  URL.revokeObjectURL(href);

  app.log("Write Selected J done", payload);
}
