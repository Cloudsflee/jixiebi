export function initSceneRuntime(app, deps) {
  const { THREE, OrbitControls } = deps;
  app.scene = new THREE.Scene();
  app.scene.background = new THREE.Color(0xe8f0f8);
  app.scene.fog = new THREE.Fog(0xe8f0f8, 700, 1800);

  app.camera = new THREE.PerspectiveCamera(
    45,
    app.dom.viewport.clientWidth / app.dom.viewport.clientHeight,
    0.1,
    6000
  );
  app.camera.position.set(280, 250, 430);

  app.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  app.renderer.setSize(app.dom.viewport.clientWidth, app.dom.viewport.clientHeight);
  app.renderer.shadowMap.enabled = true;
  app.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.dom.viewport.appendChild(app.renderer.domElement);

  app.controls = new OrbitControls(app.camera, app.renderer.domElement);
  app.controls.enableDamping = true;
  app.controls.target.set(100, 140, 120);

  app.gridHelper = new THREE.GridHelper(900, 30, 0x5b7ea1, 0xbecfe2);
  app.gridHelper.position.y = -2;
  app.scene.add(app.gridHelper);

  const worldAxes = new THREE.AxesHelper(140);
  app.scene.add(worldAxes);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb6cf, 0.7);
  app.scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(300, 420, 240);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  app.scene.add(key);

  const fill = new THREE.DirectionalLight(0xb8ddff, 0.5);
  fill.position.set(-280, 190, -220);
  app.scene.add(fill);
}

export function disposeRobotRuntime(app) {
  if (app.robotFrame) {
    app.scene.remove(app.robotFrame);
  }
  app.robotFrame = null;
  app.rigRoot = null;
  app.jointDefs.clear();
  app.jointNodes.clear();
  app.jointContents.clear();
  app.axisHelpers.clear();
  app.partRecords = [];
  app.feaRecords = [];
  app.jointAngles = {};
}

export function normalizeJointRuntime(raw, deps) {
  const { THREE, toFiniteNumber } = deps;
  const axisRaw = Array.isArray(raw?.axis) ? raw.axis : [0, 1, 0];
  const axis = new THREE.Vector3(
    toFiniteNumber(axisRaw[0], 0),
    toFiniteNumber(axisRaw[1], 1),
    toFiniteNumber(axisRaw[2], 0)
  );
  if (axis.lengthSq() < 1e-8) {
    axis.set(0, 1, 0);
  } else {
    axis.normalize();
  }

  return {
    name: String(raw?.name || ""),
    target: String(raw?.target || "").trim().toLowerCase(),
    parent: raw?.parent ? String(raw.parent) : null,
    uiHidden: raw?.uiHidden === true,
    controlRole: String(raw?.controlRole || ""),
    derivedType: String(raw?.derivedType || "").trim().toLowerCase(),
    derivedSourceName: String(raw?.derivedSourceName || ""),
    derivedSourceNames: Array.isArray(raw?.derivedSourceNames) ? raw.derivedSourceNames.slice() : [],
    derivedGain: toFiniteNumber(raw?.derivedGain, 1),
    derivedOffsetDeg: toFiniteNumber(raw?.derivedOffsetDeg, 0),
    pivot: Array.isArray(raw?.pivot)
      ? [toFiniteNumber(raw.pivot[0], 0), toFiniteNumber(raw.pivot[1], 0), toFiniteNumber(raw.pivot[2], 0)]
      : [0, 0, 0],
    axis,
    minDeg: toFiniteNumber(raw?.minDeg, -90),
    maxDeg: toFiniteNumber(raw?.maxDeg, 90),
    defaultDeg: toFiniteNumber(raw?.defaultDeg, 0),
    rawRef: raw
  };
}

export function createAxisHelperRuntime(axisVec, deps) {
  const { THREE } = deps;
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x1d4f84 });
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -85, 0),
    new THREE.Vector3(0, 140, 0)
  ]);
  const line = new THREE.Line(geom, mat);
  group.add(line);

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0x1d4f84 })
  );
  cone.position.y = 140;
  group.add(cone);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(4, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xe8590c })
  );
  group.add(dot);

  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisVec.clone().normalize());
  return group;
}

export async function buildRobotRuntime(app, deps) {
  const { THREE } = deps;
  app.disposeRobot();

  app.robotFrame = new THREE.Group();
  app.scene.add(app.robotFrame);

  app.rigRoot = new THREE.Group();
  app.robotFrame.add(app.rigRoot);

  const rawJoints = Array.isArray(app.config?.joints) ? app.config.joints : [];
  for (const raw of rawJoints) {
    const def = app.normalizeJoint(raw);
    if (!def.name) {
      continue;
    }

    app.jointDefs.set(def.name, def);
    app.jointAngles[def.name] = def.defaultDeg;

    const parentContent = def.parent ? app.jointContents.get(def.parent) : app.rigRoot;
    const attachParent = parentContent || app.rigRoot;

    const pivot = new THREE.Vector3().fromArray(def.pivot);
    const node = new THREE.Group();
    node.name = `${def.name}_node`;
    node.position.copy(pivot);
    attachParent.add(node);

    const content = new THREE.Group();
    content.name = `${def.name}_content`;
    content.position.copy(pivot).multiplyScalar(-1);
    node.add(content);

    const axisHelper = app.createAxisHelper(def.axis);
    axisHelper.visible = app.dom.toggleAxes ? app.dom.toggleAxes.checked : true;
    node.add(axisHelper);

    app.jointNodes.set(def.name, node);
    app.jointContents.set(def.name, content);
    app.axisHelpers.set(def.name, axisHelper);
  }

  const targetGroups = new Map();
  targetGroups.set("base", app.rigRoot);
  for (const def of app.jointDefs.values()) {
    targetGroups.set(def.target, app.jointContents.get(def.name));
  }

  const parts = Array.isArray(app.config?.parts) ? app.config.parts : [];
  const jobs = [];
  for (const part of parts) {
    const files = Array.isArray(part?.files) ? part.files : [];
    for (const file of files) {
      jobs.push(app.loadPartMesh(part, file, targetGroups));
    }
  }
  await Promise.all(jobs);

  app.alignRobotFrameByJ1AndFront();
  app.applyJointAngles();
  app.fitCameraToRobot();
  requestAnimationFrame(() => app.fitCameraToRobot());
}

export function normalizeMeshNameRuntime(name) {
  return String(name || "").trim().toLowerCase();
}

export function isFeaTargetRuntime(target) {
  const key = String(target || "").trim().toLowerCase();
  return key === "j2" || key === "j3" || key === "j4";
}

export function parseFrontAxisVectorRuntime(axisName, deps) {
  const { THREE } = deps;
  const text = String(axisName || "").trim().toLowerCase();
  if (text === "x" || text === "+x" || text === "posx") return new THREE.Vector3(1, 0, 0);
  if (text === "-x" || text === "negx") return new THREE.Vector3(-1, 0, 0);
  if (text === "z" || text === "+z" || text === "posz") return new THREE.Vector3(0, 0, 1);
  if (text === "-z" || text === "negz") return new THREE.Vector3(0, 0, -1);
  return new THREE.Vector3(1, 0, 0);
}

export function resolveFrameCalibrationConfigRuntime(app) {
  const raw = app.config?.frameCalibration && typeof app.config.frameCalibration === "object"
    ? app.config.frameCalibration
    : {};
  const safeNum = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    enabled: raw.enabled !== false,
    upTarget: String(raw.upTarget || "j1").trim().toLowerCase() || "j1",
    frontTarget: String(raw.frontTarget || "j4").trim().toLowerCase() || "j4",
    frontAxisWorld: app.parseFrontAxisVector(raw.frontAxis || "x"),
    yawOffsetDeg: safeNum(raw.yawOffsetDeg, 0),
    minFrontBaselineMm: Math.max(1, safeNum(raw.minFrontBaselineMm, 20)),
    useDynamicFallback: raw.useDynamicFallback === true
  };
}

export function jointNameFromTargetRuntime(target) {
  const t = String(target || "").trim().toLowerCase();
  if (/^j[1-7]$/.test(t)) return t.toUpperCase();
  return "";
}

export function getJointAxisWorldByNameRuntime(app, name, deps) {
  const { THREE } = deps;
  const def = app.jointDefs.get(name);
  const node = app.jointNodes.get(name);
  if (!def || !node) {
    return null;
  }
  const axis = def.axis.clone();
  const q = new THREE.Quaternion();
  node.getWorldQuaternion(q);
  axis.applyQuaternion(q);
  if (axis.lengthSq() < 1e-8) {
    return null;
  }
  return axis.normalize();
}

export function alignRobotFrameByJ1AndFrontRuntime(app, deps) {
  const { THREE, DEG2RAD } = deps;
  if (!app.robotFrame || !app.rigRoot) {
    return;
  }

  const calibration = app.resolveFrameCalibrationConfig();
  if (!calibration.enabled) {
    return;
  }

  const upName = app.jointNameFromTarget(calibration.upTarget) || "J1";
  const j1Node = app.jointNodes.get(upName);
  if (!j1Node) {
    return;
  }

  const applyOnFrame = (quat) => {
    if (!quat) return;
    app.robotFrame.quaternion.premultiply(quat);
    app.robotFrame.position.applyQuaternion(quat);
  };

  const worldUp = new THREE.Vector3(0, 1, 0);
  app.rigRoot.updateWorldMatrix(true, true);
  let j1AxisWorld = app.getJointAxisWorldByName(upName);
  if (!j1AxisWorld) {
    return;
  }

  const qAlignUp = new THREE.Quaternion().setFromUnitVectors(j1AxisWorld, worldUp);
  applyOnFrame(qAlignUp);

  app.rigRoot.updateWorldMatrix(true, true);
  const j1Pivot = j1Node.getWorldPosition(new THREE.Vector3());
  const frontTargets = calibration.useDynamicFallback
    ? [calibration.frontTarget, "j4", "j3", "j2"]
    : [calibration.frontTarget];

  for (const target of frontTargets) {
    const jointName = app.jointNameFromTarget(target);
    if (!jointName) continue;
    const node = app.jointNodes.get(jointName);
    if (!node) continue;

    const frontPivot = node.getWorldPosition(new THREE.Vector3());
    const frontDir = frontPivot.sub(j1Pivot);
    frontDir.y = 0;
    const len = frontDir.length();
    if (!Number.isFinite(len) || len < calibration.minFrontBaselineMm) {
      continue;
    }

    frontDir.normalize();
    const targetFront = calibration.frontAxisWorld.clone().setY(0).normalize();
    if (targetFront.lengthSq() < 1e-8) {
      continue;
    }

    const qYaw = new THREE.Quaternion().setFromUnitVectors(frontDir, targetFront);
    applyOnFrame(qYaw);

    if (Math.abs(calibration.yawOffsetDeg) > 1e-9) {
      const qOffset = new THREE.Quaternion().setFromAxisAngle(worldUp, calibration.yawOffsetDeg * DEG2RAD);
      applyOnFrame(qOffset);
    }
    break;
  }

  app.rigRoot.updateWorldMatrix(true, true);
  const baseMeshRecords = (app.partRecords || []).filter((r) => {
    const target = String(r?.part?.target || "").trim().toLowerCase();
    return target === "base";
  });
  if (!baseMeshRecords.length) {
    const j1PivotAfter = j1Node.getWorldPosition(new THREE.Vector3());
    j1AxisWorld = app.getJointAxisWorldByName(upName);
    if (!j1AxisWorld) {
      return;
    }

    let originWorldFallback = j1PivotAfter.clone();
    if (Math.abs(j1AxisWorld.y) > 1e-8) {
      const t = -j1PivotAfter.y / j1AxisWorld.y;
      originWorldFallback = j1PivotAfter.clone().addScaledVector(j1AxisWorld, t);
    } else {
      originWorldFallback.y = 0;
    }
    app.robotFrame.position.sub(originWorldFallback);
    return;
  }

  const baseWorldBox = new THREE.Box3();
  for (const rec of baseMeshRecords) {
    if (rec?.mesh) {
      baseWorldBox.expandByObject(rec.mesh);
    }
  }
  if (baseWorldBox.isEmpty()) {
    return;
  }

  const baseCenter = baseWorldBox.getCenter(new THREE.Vector3());
  const originWorld = new THREE.Vector3(baseCenter.x, baseWorldBox.min.y, baseCenter.z);
  app.robotFrame.position.sub(originWorld);
}

export function createPartRecordRuntime(app, mesh, part, deps) {
  const { THREE, clamp, toFiniteNumber } = deps;
  const posAttr = mesh.geometry.getAttribute("position");
  const norAttr = mesh.geometry.getAttribute("normal");
  const count = posAttr.count;

  const colors = new Float32Array(count * 3);
  const baseColor = new THREE.Color(part.color || "#9aa9ba");
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = baseColor.r;
    colors[i * 3 + 1] = baseColor.g;
    colors[i * 3 + 2] = baseColor.b;
  }
  mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const bbox = new THREE.Box3().setFromBufferAttribute(posAttr);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bbox.getCenter(center);
  bbox.getSize(size);

  const originalPos = Float32Array.from(posAttr.array);
  const normals = Float32Array.from(norAttr.array);
  const stressBasis = new Float32Array(count);

  const sx = Math.max(1e-6, size.x * 0.5);
  const sy = Math.max(1e-6, size.y);
  const sz = Math.max(1e-6, size.z * 0.5);
  for (let i = 0; i < count; i += 1) {
    const p = i * 3;
    const x = originalPos[p];
    const y = originalPos[p + 1];
    const z = originalPos[p + 2];
    const gy = (y - bbox.min.y) / sy;
    const gx = Math.abs((x - center.x) / sx);
    const gz = Math.abs((z - center.z) / sz);
    stressBasis[i] = clamp(0.2 + gy * 0.5 + gx * 0.15 + gz * 0.15, 0, 1);
  }

  const feaWeight = toFiniteNumber(part.feaWeight, 0);
  const targetKey = String(part?.target || "").trim().toLowerCase();
  const meshName = app.normalizeMeshName(mesh.name);
  const feaActive =
    feaWeight > 0 &&
    (app.isFeaTarget(targetKey)
      || /link_bc|link_cd|link_c_axis|gripper_bracket|link_triangle|suarmt_global_0[234]\.stl/i.test(meshName));

  return {
    mesh,
    part,
    feaWeight,
    feaActive,
    originalPos,
    normals,
    stressBasis
  };
}

export async function loadPartMeshRuntime(app, part, file, targetGroups, deps) {
  const { THREE } = deps;
  const parent = targetGroups.get(String(part?.target || "").trim().toLowerCase());
  if (!parent) {
    app.log("Target group missing", { part: part?.name || "", target: part?.target || "" });
    return;
  }

  const basePath = String(app.config?.modelBasePath || "./models/raw/");
  const assetVersion = String(app.config?.assetVersion || "20260518");
  const url = `${basePath}${file}?v=${encodeURIComponent(assetVersion)}`;

  try {
    const geometry = await app.loader.loadAsync(url);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(part?.color || "#9aa9ba"),
      metalness: 0.12,
      roughness: 0.56,
      vertexColors: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = file;
    parent.add(mesh);

    const record = app.createPartRecord(mesh, part || {});
    app.partRecords.push(record);
    if (record.feaActive) {
      app.feaRecords.push(record);
    }
  } catch (error) {
    app.log("STL load failed", { file, error: String(error) });
  }
}

export function fitCameraToRobotRuntime(app, deps) {
  const { THREE } = deps;
  if (!app.partRecords.length || !app.controls || !app.camera) {
    return;
  }

  const box = new THREE.Box3();
  for (const record of app.partRecords) {
    box.expandByObject(record.mesh);
  }
  if (box.isEmpty()) {
    return;
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const fov = app.camera.fov * Math.PI / 180;
  const halfFovTan = Math.tan(fov / 2);
  const aspect = Math.max(0.5, app.camera.aspect || 1);
  const margin = 1.35;

  const fitHeightDist = (size.y * 0.5) / Math.max(1e-6, halfFovTan);
  const fitWidthDist = (size.x * 0.5) / Math.max(1e-6, halfFovTan * aspect);
  const fitDepthDist = size.z * 0.9;
  const safeDistance = Math.max(fitHeightDist, fitWidthDist, fitDepthDist) * margin;

  const target = new THREE.Vector3(center.x, center.y + size.y * 0.08, center.z);
  const viewDir = new THREE.Vector3(1, 0.62, 1).normalize();
  const camPos = target.clone().addScaledVector(viewDir, Math.max(460, safeDistance));

  app.camera.position.copy(camPos);
  app.controls.target.copy(target);
  app.controls.minDistance = Math.max(180, safeDistance * 0.42);
  app.controls.maxDistance = Math.max(2600, safeDistance * 8.0);
  app.controls.update();
}

export function onResizeRuntime(app) {
  if (!app.renderer || !app.camera || !app.dom.viewport) {
    return;
  }
  const w = app.dom.viewport.clientWidth;
  const h = app.dom.viewport.clientHeight;
  app.camera.aspect = w / h;
  app.camera.updateProjectionMatrix();
  app.renderer.setSize(w, h);
}
