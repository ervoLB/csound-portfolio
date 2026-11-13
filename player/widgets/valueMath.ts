/** Value mapping shared by all continuous widgets. */

export function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const LOG_FLOOR = 1e-7;

/** Value → 0..1 position, linear or logarithmic. */
export function normalizeScale(value: number, min: number, max: number, scale?: string): number {
  if (scale === 'logarithmic') {
    const safeMin = min <= 0 ? LOG_FLOOR : min;
    const safeMax = max <= 0 ? LOG_FLOOR : max;
    const safeVal = value <= 0 ? LOG_FLOOR : value;
    if (safeMin === safeMax) return 0;
    const n = Math.log(safeVal / safeMin) / Math.log(safeMax / safeMin);
    return Number.isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
  }
  const result = (value - min) / (max - min || 1);
  return Number.isNaN(result) ? 0 : Math.max(0, Math.min(1, result));
}

/** 0..1 position → value, linear or logarithmic. */
export function denormalizeScale(norm: number, min: number, max: number, scale?: string): number {
  const n = Math.max(0, Math.min(1, norm));
  if (scale === 'logarithmic') {
    const safeMin = min <= 0 ? LOG_FLOOR : min;
    const safeMax = max <= 0 ? LOG_FLOOR : max;
    const result = safeMin * Math.pow(safeMax / safeMin, n);
    if (min === 0 && result <= LOG_FLOOR * 1.01) return 0;
    return result;
  }
  return min + n * (max - min);
}

/** Clamp to [min, max] and snap to `step` (counted from min). */
export function clampToStep(value: number, min: number, max: number, step?: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  let v = Math.max(lo, Math.min(hi, toFiniteNumber(value, lo)));
  if (step !== undefined && step > 0 && Number.isFinite(step)) {
    v = lo + Math.round((v - lo) / step) * step;
    v = Math.max(lo, Math.min(hi, v));
    // Remove floating-point noise such as 0.30000000000000004.
    const decimals = stepDecimals(step);
    v = Number(v.toFixed(Math.min(10, decimals + 2)));
  }
  return v;
}

export function stepDecimals(step: number): number {
  const s = String(step);
  if (s.includes('e-')) return parseInt(s.split('e-')[1], 10);
  if (s.includes('.')) return s.split('.')[1].length;
  return 0;
}

/** Display a value with the precision implied by its step (0.001 → 3 decimals). */
export function formatWidgetValue(value: number, step?: number): string {
  const n = toFiniteNumber(value, 0);
  const s = step === undefined ? NaN : toFiniteNumber(step, NaN);
  if (!Number.isFinite(s) || s <= 0) {
    const abs = Math.abs(n);
    if (abs >= 1000) return n.toFixed(0);
    if (abs >= 100) return n.toFixed(1);
    return n.toFixed(2);
  }
  return n.toFixed(Math.min(6, stepDecimals(s)));
}

/** Keyboard increment: the step, or 1% of the range when there is no step. */
export function keyboardStep(min: number, max: number, step?: number): number {
  if (step !== undefined && step > 0 && Number.isFinite(step)) return step;
  return Math.abs(max - min) / 100 || 0.01;
}
