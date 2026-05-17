export function createAxisHelperController({
  THREE,
  getScene,
  getAxisHelperGroup,
  setAxisHelperGroup,
  setAxisHelperLine,
  setAxisHelperPivotMarker,
  getAxisHelperLine,
  getAxisHelperPivotMarker,
  getSelectedJointState,
  getRobotRoot,
  getJointAxisWorld,
  getJointAxisDisplayLength
}) {
  const ensureAxisHelper = () => {
    if (getAxisHelperGroup() || !getScene()) return;

    const group = new THREE.Group();
    group.visible = false;

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xa8ff2f,
      transparent: true,
      opacity: 0.92,
      depthTest: false
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.renderOrder = 1200;

    const markerGeometry = new THREE.SphereGeometry(4, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ccff,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.renderOrder = 1201;

    group.add(line);
    group.add(marker);
    getScene().add(group);

    setAxisHelperGroup(group);
    setAxisHelperLine(line);
    setAxisHelperPivotMarker(marker);
  };

  const updateAxisHelperFromSelectedJoint = () => {
    ensureAxisHelper();
    const group = getAxisHelperGroup();
    const line = getAxisHelperLine();
    const marker = getAxisHelperPivotMarker();
    if (!group || !line || !marker) return;

    const selectedJointState = getSelectedJointState();
    if (!selectedJointState?.pivotGroup) {
      group.visible = false;
      return;
    }

    const robotRoot = getRobotRoot();
    if (robotRoot) {
      robotRoot.updateWorldMatrix(true, true);
    }

    const axis = getJointAxisWorld(selectedJointState);
    if (!axis) {
      group.visible = false;
      return;
    }

    const pivotWorld = selectedJointState.pivotGroup.getWorldPosition(new THREE.Vector3());
    const halfLen = getJointAxisDisplayLength(selectedJointState);
    const p1 = pivotWorld.clone().addScaledVector(axis, halfLen);
    const p2 = pivotWorld.clone().addScaledVector(axis, -halfLen);

    const posAttr = line.geometry.getAttribute("position");
    posAttr.setXYZ(0, p1.x, p1.y, p1.z);
    posAttr.setXYZ(1, p2.x, p2.y, p2.z);
    posAttr.needsUpdate = true;
    line.geometry.computeBoundingSphere();

    marker.position.copy(pivotWorld);
    group.visible = true;
  };

  return {
    ensureAxisHelper,
    updateAxisHelperFromSelectedJoint
  };
}
