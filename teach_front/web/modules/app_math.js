export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toFixed3(v) {
  return Number(v).toFixed(3);
}
