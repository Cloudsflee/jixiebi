import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";
import { OrbitControls } from "../vendor/three/jsm/controls/OrbitControls.js?v=20260515-232131";
import { STLLoader } from "../vendor/three/jsm/loaders/STLLoader.js?v=20260515-232131";

export function initViewerRuntime({
  viewerEl,
  ensureAxisHelper,
  updateAxisHelperFromSelectedJoint,
  refreshAxisLineEditorFromRuntime,
  getAxisLineEditorActive,
  getAxisLineEditorDragging
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6f8);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50000);
  camera.position.set(600, 300, 600);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  viewerEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 120, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.92));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(520, 800, 620);
  scene.add(dirLight);
  scene.add(new THREE.GridHelper(1200, 24, 0x778899, 0xaec3d5));
  scene.add(new THREE.AxesHelper(200));

  const displayRoot = new THREE.Group();
  scene.add(displayRoot);
  ensureAxisHelper();

  const stlLoader = new STLLoader();

  const resize = () => {
    const width = viewerEl.clientWidth;
    const height = viewerEl.clientHeight;
    if (width <= 0 || height <= 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    updateAxisHelperFromSelectedJoint();
    if (getAxisLineEditorActive() && !getAxisLineEditorDragging()) {
      refreshAxisLineEditorFromRuntime();
    }
    renderer.render(scene, camera);
  };

  window.addEventListener("resize", resize);
  resize();
  animate();

  return {
    scene,
    camera,
    renderer,
    controls,
    displayRoot,
    stlLoader
  };
}
