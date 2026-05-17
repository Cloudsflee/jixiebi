import * as THREE from "../vendor/three/three.module.js?v=20260515-232131";
import { toFiniteNumber } from "./app_utils.js?v=20260518-022000";

export function safeAxis(axis) {
  return axis === "x" || axis === "y" || axis === "z" ? axis : "z";
}

export function axisNameFromVector(vec) {
  if (!vec) return "x";
  const ax = Math.abs(vec.x);
  const ay = Math.abs(vec.y);
  const az = Math.abs(vec.z);
  if (ax >= ay && ax >= az) return "x";
  if (ay >= ax && ay >= az) return "y";
  return "z";
}

export function axisVectorFromAxisName(axisName) {
  const axis = safeAxis(axisName);
  if (axis === "x") return [1, 0, 0];
  if (axis === "y") return [0, 1, 0];
  return [0, 0, 1];
}

export function toVec3(v) {
  if (Array.isArray(v) && v.length === 3) {
    return new THREE.Vector3(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
  }
  return new THREE.Vector3(0, 0, 0);
}

export function normalizePivotArray(value, fallback = [0, 0, 0]) {
  const fb = Array.isArray(fallback) && fallback.length === 3
    ? [Number(fallback[0]) || 0, Number(fallback[1]) || 0, Number(fallback[2]) || 0]
    : [0, 0, 0];

  if (!Array.isArray(value) || value.length !== 3) return fb;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return fb;
  return [x, y, z];
}

export function normalizeAxisVectorArray(value, fallback = [1, 0, 0]) {
  const fbRaw = Array.isArray(fallback) && fallback.length === 3 ? fallback : [1, 0, 0];
  const fb = [
    toFiniteNumber(fbRaw[0], 1),
    toFiniteNumber(fbRaw[1], 0),
    toFiniteNumber(fbRaw[2], 0)
  ];
  const fbLen = Math.hypot(fb[0], fb[1], fb[2]);
  const safeFb = fbLen > 1e-6 ? [fb[0] / fbLen, fb[1] / fbLen, fb[2] / fbLen] : [1, 0, 0];

  if (!Array.isArray(value) || value.length < 3) return safeFb;
  const x = toFiniteNumber(value[0], safeFb[0]);
  const y = toFiniteNumber(value[1], safeFb[1]);
  const z = toFiniteNumber(value[2], safeFb[2]);
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return safeFb;
  return [x / len, y / len, z / len];
}

export function normalizePivotSpace(value, fallback = "world") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "local" || raw === "robot_local" || raw === "robotlocal") return "local";
  if (raw === "world") return "world";
  return fallback === "local" ? "local" : "world";
}

export function normalizePhysicalPointSpace(value, fallback = "robot_local") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "world") return "world";
  if (raw === "robot_local" || raw === "local" || raw === "robotlocal") return "robot_local";
  return fallback === "world" ? "world" : "robot_local";
}

export function parseOptionalVec3(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

export function projectVec3ToPlane2(vec, axis = "z") {
  const safe = vec || new THREE.Vector3(0, 0, 0);
  if (axis === "x") return new THREE.Vector2(safe.y, safe.z);
  if (axis === "y") return new THREE.Vector2(safe.x, safe.z);
  return new THREE.Vector2(safe.x, safe.y);
}

export function wrapAngleDeg(deg) {
  let d = Number(deg) || 0;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function absAngleDiffDeg(a, b) {
  return Math.abs(wrapAngleDeg((Number(a) || 0) - (Number(b) || 0)));
}
