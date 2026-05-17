export function sanitizePossibleMojibakeText(input) {
  const s = String(input ?? "");
  if (!s) return s;
  const noisyHints = ["闂", "缂", "閿", "锟", "€", "�"];
  const noisy = noisyHints.some((hint) => s.includes(hint));
  if (!noisy) return s;
  const ascii = s.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  return ascii || "message";
}

export function clampInt(value, min, max) {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function clampNumber(value, min, max, fallback = min) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

export function normalizeCommandScale(value, fallback = 1) {
  const v = Number(value);
  if (!Number.isFinite(v)) return clampNumber(fallback, 0.05, 1, 1);
  return clampNumber(v, 0.05, 1, 1);
}

export function estimateDefaultCommandScaleByJointRange(minDeg, maxDeg) {
  const min = Number(minDeg);
  const max = Number(maxDeg);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 1;
  const spanDeg = Math.abs(max - min);
  if (spanDeg <= 1e-6) return 1;
  return normalizeCommandScale(spanDeg / 240, 1);
}

export function toFiniteNumber(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}
