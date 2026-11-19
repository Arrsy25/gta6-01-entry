// Small shared helpers for NEON BAY: math, random and collision.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

// Shortest signed angle from a to b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * t;
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.hypot(dx, dz);
}

// Push a circle (x, z, radius) out of an axis-aligned box collider.
// Returns true when a push happened. Mutates pos {x, z}.
export function circleVsBox(pos, r, box) {
  const cx = clamp(pos.x, box.minX, box.maxX);
  const cz = clamp(pos.z, box.minZ, box.maxZ);
  const dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
  } else {
    // Centre inside the box: push out along the smallest penetration axis.
    const pl = pos.x - box.minX, pr = box.maxX - pos.x;
    const pt = pos.z - box.minZ, pb = box.maxZ - pos.z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) pos.x = box.minX - r;
    else if (m === pr) pos.x = box.maxX + r;
    else if (m === pt) pos.z = box.minZ - r;
    else pos.z = box.maxZ + r;
  }
  return true;
}

// Test a circle against a list of boxes; returns the first box hit or null.
export function circleHitsAny(pos, r, boxes) {
  for (const b of boxes) {
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    if (dx * dx + dz * dz < r * r) return b;
  }
  return null;
}
