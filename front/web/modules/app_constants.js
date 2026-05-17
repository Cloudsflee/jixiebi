export const TARGET_ORDER = ["base", "j1", "j2", "j3", "j4", "j5", "j6", "j7"];
export const PRESET_STORAGE_KEY = "arm_joint_runtime_presets_v1";
export const PRESET_SCHEMA_VERSION = 1;
export const PRESET_MAX_COUNT = 40;
export const FRONT_MINIMAL_MODE = true;

export function defaultParentTargetForTarget(target) {
  const key = String(target || "").trim().toLowerCase();
  if (key === "j5" || key === "j6" || key === "j7") return "j4";
  const idx = TARGET_ORDER.indexOf(key);
  if (idx <= 0) return "base";
  return TARGET_ORDER[idx - 1];
}

export const FALLBACK_CONFIG = {
  note: "fallback",
  modelBasePathCandidates: ["./raw/"],
  physicalKinematics: {
    enabled: false,
    type: "four_bar_dual_hole",
    note: "Fill this block from CAD dimensions, then set enabled=true.",
    space: "robot_local",
    planeAxis: "x",
    driverTarget: "j2",
    branch: "closest",
    joints: {
      j2: { target: "j2", pivot: [0, 0, 0], activeLinkLength: 0, angleOffsetDeg: 0 },
      j3: { target: "j3", pivot: [0, 0, 0], activeLinkLength: 0, angleOffsetDeg: 0 },
      j4: { target: "j4", angleOffsetDeg: 0 }
    },
    endEffector: {
      yellowHoleLocal: [0, 0, 0],
      greenHoleLocal: [0, 0, 0]
    }
  },
  demoKinematics: {
    baseHeight: 86,
    link2: 135,
    link3: 145,
    tool: 70,
    wristPitchDeg: 0
  },
  demoFea: {
    yieldStressMpa: 210,
    dynamicGain: 0.35,
    payloadScale: 1,
    sections: {
      j2: { leverMm: 135, strengthArea: 90, compliance: 0.011 },
      j3: { leverMm: 145, strengthArea: 78, compliance: 0.014 },
      j4: { leverMm: 70, strengthArea: 64, compliance: 0.019 }
    }
  },
  demoRuntime: {
    enabled: false,
    autoFea: true,
    payloadNewton: 8,
    elbow: "down",
    wristPitchDeg: 0,
    target: { x: 240, y: 170, z: 0 }
  },
  assemblyLock: {
    enabled: false,
    disableCouplings: true,
    autoInferPivots: true,
    maxAutoShiftMm: 280,
    source: "",
    note: "When enabled, disable closure/pin couplings to keep assembly hierarchy rigid and stable."
  },
  frameCalibration: {
    enabled: true,
    mode: "fixed_j1_front",
    upTarget: "j1",
    frontTarget: "j4",
    frontAxis: "x",
    yawOffsetDeg: 0,
    minFrontBaselineMm: 20,
    useDynamicFallback: false
  },
  motionLocks: {
    axisByTarget: {
      j2: "x"
    },
    parentAxisByTarget: {
      j2: [1, 0, 0]
    }
  },
  parts: [],
  joints: [
    {
      name: "J1",
      target: "j1",
      parentTarget: "base",
      servoId: 1,
      axis: "y",
      invert: false,
      min: 0,
      max: 1000,
      guardMin: 120,
      guardMax: 880,
      minDeg: -140,
      maxDeg: 140,
      defaultPos: 500,
      defaultTime: 300,
      pivot: [0, 0, 0]
    },
    {
      name: "J2",
      target: "j2",
      parentTarget: "j1",
      servoId: 2,
      axis: "x",
      invert: false,
      min: 0,
      max: 1000,
      guardMin: 180,
      guardMax: 820,
      minDeg: -115,
      maxDeg: 115,
      defaultPos: 500,
      defaultTime: 300,
      pivot: [0, 0, 0]
    },
    {
      name: "J3",
      target: "j3",
      parentTarget: "j2",
      servoId: 3,
      axis: "z",
      invert: false,
      min: 0,
      max: 1000,
      guardMin: 180,
      guardMax: 820,
      minDeg: -120,
      maxDeg: 120,
      defaultPos: 500,
      defaultTime: 300,
      pivot: [0, 0, 0]
    },
    {
      name: "J4",
      target: "j4",
      parentTarget: "j3",
      servoId: 4,
      axis: "z",
      invert: false,
      min: 0,
      max: 1000,
      guardMin: 180,
      guardMax: 820,
      minDeg: -120,
      maxDeg: 120,
      defaultPos: 500,
      defaultTime: 300,
      pivot: [0, 0, 0]
    }
  ]
};
