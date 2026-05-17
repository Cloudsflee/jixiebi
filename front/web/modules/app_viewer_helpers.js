import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";

export function createRobotHierarchyStructure(config = null, { displayRoot, targetOrder, defaultParentTargetForTarget }) {
  const robotRoot = new THREE.Group();
  displayRoot.clear();
  displayRoot.add(robotRoot);

  const groups = {};
  const meshes = {};
  const pivots = {};

  targetOrder.forEach((target) => {
    groups[target] = new THREE.Group();
    meshes[target] = new THREE.Group();
    groups[target].add(meshes[target]);
    if (target !== "base") {
      pivots[target] = new THREE.Group();
    }
  });

  robotRoot.add(groups.base);
  const jointParentByTarget = new Map();
  if (Array.isArray(config?.joints)) {
    config.joints.forEach((joint) => {
      const target = String(joint?.target || "").trim().toLowerCase();
      if (!target || target === "base") return;
      const parentTarget = String(
        joint?.parentTarget || defaultParentTargetForTarget(target)
      ).trim().toLowerCase();
      jointParentByTarget.set(target, parentTarget || "base");
    });
  }

  targetOrder.forEach((target) => {
    if (target === "base") return;
    const pivot = pivots[target];
    const group = groups[target];
    if (!pivot || !group) return;

    const fromConfig = jointParentByTarget.get(target);
    let parentTarget = String(fromConfig || defaultParentTargetForTarget(target)).toLowerCase();
    if (!groups[parentTarget] || parentTarget === target) {
      parentTarget = defaultParentTargetForTarget(target);
    }
    const parentGroup = groups[parentTarget] || groups.base || robotRoot;
    parentGroup.add(pivot);
    pivot.add(group);
  });

  return {
    robotRoot,
    groupsByTarget: groups,
    meshGroupsByTarget: meshes,
    pivotsByTarget: pivots
  };
}

export function loadSingleStl(stlLoader, url) {
  return new Promise((resolve, reject) => {
    stlLoader.load(
      encodeURI(url),
      (geometry) => resolve(geometry),
      undefined,
      (error) => reject(error)
    );
  });
}

export async function loadStlWithFallback(stlLoader, baseCandidates, fileName) {
  for (const base of baseCandidates) {
    const path = `${base}${fileName}`;
    try {
      const geometry = await loadSingleStl(stlLoader, path);
      return { geometry, path };
    } catch {
      // try next
    }
  }
  return null;
}

export async function loadRobotMeshes(
  config,
  {
    stlLoader,
    meshGroupsByTarget,
    meshMaterialByTarget,
    baseMaterialColorByTarget,
    baseMeshScaleByTarget,
    setViewerStatus,
    log
  }
) {
  meshMaterialByTarget.clear();
  baseMaterialColorByTarget.clear();
  baseMeshScaleByTarget.clear();

  const baseCandidates = Array.isArray(config.modelBasePathCandidates) && config.modelBasePathCandidates.length > 0
    ? config.modelBasePathCandidates
    : ["./raw/"];

  let loaded = 0;
  let failed = 0;
  const loadedByTarget = Object.create(null);

  if (!Array.isArray(config.parts) || config.parts.length === 0) {
    setViewerStatus("no parts found in joints.json");
    return { loaded, failed };
  }

  for (const part of config.parts) {
    const targetGroup = meshGroupsByTarget?.[part.target];
    if (!targetGroup || !Array.isArray(part.files)) continue;

    const material = new THREE.MeshStandardMaterial({
      color: part.color || "#7f8c8d",
      metalness: 0.18,
      roughness: 0.64
    });
    meshMaterialByTarget.set(part.target, material);
    baseMaterialColorByTarget.set(part.target, material.color.clone());
    baseMeshScaleByTarget.set(part.target, targetGroup.scale.clone());

    for (const fileName of part.files) {
      const loadedResult = await loadStlWithFallback(stlLoader, baseCandidates, fileName);
      if (!loadedResult) {
        failed += 1;
        log("STL load failed", { file: fileName });
        continue;
      }

      const geometry = loadedResult.geometry;
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = fileName;
      targetGroup.add(mesh);
      loaded += 1;
      loadedByTarget[String(part.target || "unknown")] = (loadedByTarget[String(part.target || "unknown")] || 0) + 1;
    }
  }

  return { loaded, failed, loadedByTarget };
}

export function fitCameraToObject(camera, controls, object3d) {
  const box = new THREE.Box3().setFromObject(object3d);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = Math.max(260, maxDim * 1.8);

  camera.position.set(center.x + dist, center.y + dist * 0.58, center.z + dist);
  controls.target.copy(center);
  controls.update();
}

export function getSceneFocusTarget(controls, displayRoot, robotRoot) {
  if (controls) {
    return controls.target.clone();
  }

  const box = new THREE.Box3().setFromObject(displayRoot || robotRoot || new THREE.Group());
  if (!box.isEmpty()) {
    return box.getCenter(new THREE.Vector3());
  }
  return new THREE.Vector3(0, 0, 0);
}

export function getSceneViewDistance(camera, target, displayRoot, robotRoot) {
  if (camera) {
    const d = camera.position.distanceTo(target);
    if (Number.isFinite(d) && d > 1) {
      return d;
    }
  }

  const box = new THREE.Box3().setFromObject(displayRoot || robotRoot || new THREE.Group());
  if (!box.isEmpty()) {
    const diag = box.getSize(new THREE.Vector3()).length();
    return Math.max(260, diag * 1.35);
  }

  return 520;
}

export function setPlaneView(plane, { camera, controls, displayRoot, robotRoot, log }) {
  if (!camera || !controls) return;

  const target = getSceneFocusTarget(controls, displayRoot, robotRoot);
  const dist = getSceneViewDistance(camera, target, displayRoot, robotRoot);

  let dir = new THREE.Vector3(0, 0, 1);
  let up = new THREE.Vector3(0, 1, 0);
  let viewLabel = "XY(front)";

  if (plane === "xy") {
    dir = new THREE.Vector3(0, 0, 1);
    up = new THREE.Vector3(0, 1, 0);
    viewLabel = "XY(front)";
  } else if (plane === "xz") {
    dir = new THREE.Vector3(0, 1, 0);
    up = new THREE.Vector3(0, 0, -1);
    viewLabel = "XZ(top)";
  } else if (plane === "yz") {
    dir = new THREE.Vector3(1, 0, 0);
    up = new THREE.Vector3(0, 1, 0);
    viewLabel = "YZ(side)";
  }

  camera.up.copy(up);
  camera.position.copy(target.clone().addScaledVector(dir, dist));
  camera.lookAt(target);
  controls.target.copy(target);
  controls.update();
  log("View switched", { plane: viewLabel });
}

export function parseFrontAxisVector(value, fallback = new THREE.Vector3(1, 0, 0)) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "x" || text === "+x" || text === "posx") return new THREE.Vector3(1, 0, 0);
  if (text === "-x" || text === "negx") return new THREE.Vector3(-1, 0, 0);
  if (text === "z" || text === "+z" || text === "posz") return new THREE.Vector3(0, 0, 1);
  if (text === "-z" || text === "negz") return new THREE.Vector3(0, 0, -1);
  return fallback.clone();
}

export function resolveFrameCalibrationConfig(loadedJointConfig, options = {}, clampNumber) {
  const cfgRaw = loadedJointConfig?.frameCalibration && typeof loadedJointConfig.frameCalibration === "object"
    ? loadedJointConfig.frameCalibration
    : {};
  const optRaw = options?.frameCalibration && typeof options.frameCalibration === "object"
    ? options.frameCalibration
    : {};
  const merged = { ...cfgRaw, ...optRaw };

  const upTarget = String(merged.upTarget || "j1").trim().toLowerCase() || "j1";
  const frontTarget = String(merged.frontTarget || options.frontTarget || "j4").trim().toLowerCase() || "j4";
  const frontAxis = String(merged.frontAxis || "x").trim().toLowerCase() || "x";
  const yawOffsetDeg = clampNumber(merged.yawOffsetDeg, -180, 180, 0);
  const minFrontBaselineMm = Math.max(1, clampNumber(merged.minFrontBaselineMm, 1, 100000, 20));
  const useDynamicFallback = merged.useDynamicFallback === true;

  return {
    mode: String(merged.mode || "fixed_j1_front"),
    enabled: merged.enabled !== false,
    upTarget,
    frontTarget,
    frontAxis,
    frontAxisWorld: parseFrontAxisVector(frontAxis),
    yawOffsetDeg,
    minFrontBaselineMm,
    useDynamicFallback
  };
}
