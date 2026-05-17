export function createCoordProbeVisualController({
  THREE,
  getScene,
  getCoordProbeGroup,
  setCoordProbeGroup,
  setCoordProbeLastWorldPoint
}) {
  const ensureCoordinateProbe = () => {
    const scene = getScene();
    if (getCoordProbeGroup() || !scene) return;

    const group = new THREE.Group();
    group.visible = false;

    const sphereGeometry = new THREE.SphereGeometry(5, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4f7b,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });
    const marker = new THREE.Mesh(sphereGeometry, sphereMaterial);
    marker.renderOrder = 1202;

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -14, 0, 0, 14, 0, 0,
          0, -14, 0, 0, 14, 0,
          0, 0, -14, 0, 0, 14
        ],
        3
      )
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff9b37,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });
    const cross = new THREE.LineSegments(lineGeometry, lineMaterial);
    cross.renderOrder = 1203;

    group.add(marker);
    group.add(cross);
    scene.add(group);
    setCoordProbeGroup(group);
  };

  const showCoordinateProbe = (worldPoint) => {
    ensureCoordinateProbe();
    const group = getCoordProbeGroup();
    if (!group) return;
    group.position.copy(worldPoint);
    group.visible = true;
    setCoordProbeLastWorldPoint(worldPoint.clone());
  };

  const hideCoordinateProbe = () => {
    const group = getCoordProbeGroup();
    if (group) {
      group.visible = false;
    }
    setCoordProbeLastWorldPoint(null);
  };

  return {
    ensureCoordinateProbe,
    showCoordinateProbe,
    hideCoordinateProbe
  };
}
