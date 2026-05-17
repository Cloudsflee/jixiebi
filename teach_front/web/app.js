import * as THREE from "./vendor/three/three.module.js";
import { OrbitControls } from "./vendor/three/jsm/controls/OrbitControls.js";
import { STLLoader } from "./vendor/three/jsm/loaders/STLLoader.js";
import {
  DEFAULT_PSEUDO_FEA_MODEL,
  normalizePseudoFeaModel
} from "./modules/demo_fea.js";
import {
  drawFeaChart as drawFeaChartCore,
  updateFeaVisualRuntime
} from "./modules/teaching_fea_runtime.js";
import { DEG2RAD, clamp, toFiniteNumber, toFixed3 } from "./modules/app_math.js";
import { computeFk as computeFkCore, solveIk as solveIkCore } from "./modules/teaching_kinematics.js";

const TEACH_WEB_VERSION = "20260518-teach-redesign1";


const app = new TeachingDemoApp();
app.init().catch((err) => {
  const logEl = document.getElementById("logs");
  if (logEl) {
    logEl.textContent = `[BOOT ERROR] ${String(err)}\n${logEl.textContent}`;
  }
  // eslint-disable-next-line no-console
  console.error(err);
});















