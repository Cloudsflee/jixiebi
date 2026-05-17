export function getAxisLineEditorNdcFromEvent(rendererDom, evt) {
  if (!rendererDom) return null;
  const rect = rendererDom.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
}

export function collectAxisLineEditorPickMeshes({
  target,
  findJointStateByTarget,
  meshGroupsByTarget
}) {
  const unique = new Set();
  const meshes = [];
  const pushFromRoot = (root) => {
    if (!root) return;
    root.traverse((obj) => {
      if (!obj || obj.isMesh !== true || obj.visible === false) return;
      if (unique.has(obj)) return;
      unique.add(obj);
      meshes.push(obj);
    });
  };

  const state = findJointStateByTarget(target);
  pushFromRoot(state?.meshGroup || meshGroupsByTarget?.[target] || null);
  if (meshes.length > 0) {
    return meshes;
  }

  Object.values(meshGroupsByTarget || {}).forEach((root) => {
    pushFromRoot(root);
  });
  return meshes;
}

export function getAxisLineEditorWorldNormalFromHit(THREE, hit) {
  if (!hit?.face || !hit?.object) return null;

  const worldNormal = hit.face.normal.clone();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  worldNormal.applyMatrix3(normalMatrix);
  if (worldNormal.lengthSq() < 1e-10) {
    return null;
  }
  worldNormal.normalize();

  const box = new THREE.Box3().setFromObject(hit.object);
  if (!box.isEmpty() && hit.point) {
    const center = box.getCenter(new THREE.Vector3());
    const radial = hit.point.clone().sub(center);
    if (radial.lengthSq() > 1e-10 && worldNormal.dot(radial) < 0) {
      worldNormal.multiplyScalar(-1);
    }
  }

  return worldNormal.normalize();
}
