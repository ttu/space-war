/** Gravitational constant in km³/(kg·s²) */
const G_KM = 6.674e-20; // 6.674e-11 m³/(kg·s²) converted to km

/**
 * Calculate gravitational acceleration on a body at (px, py)
 * due to a mass at (mx, my).
 * Returns acceleration vector in km/s².
 */
export function gravitationalAcceleration(
  px: number,
  py: number,
  mx: number,
  my: number,
  mass: number,
  minDistance: number = 1,
): { ax: number; ay: number } {
  const dx = mx - px;
  const dy = my - py;
  const rawDistSq = dx * dx + dy * dy;
  const rawDist = Math.sqrt(rawDistSq);

  if (rawDist < 1) {
    return { ax: 0, ay: 0 };
  }

  // Clamp distance to minDistance (body radius) so gravity never exceeds surface gravity
  const effectiveDist = Math.max(rawDist, minDistance);
  const effectiveDistSq = effectiveDist * effectiveDist;

  const accel = (G_KM * mass) / effectiveDistSq;
  return {
    ax: accel * (dx / rawDist),
    ay: accel * (dy / rawDist),
  };
}

/**
 * Calculate orbital velocity for a circular orbit at given radius.
 */
export function circularOrbitSpeed(mass: number, radiusKm: number): number {
  return Math.sqrt((G_KM * mass) / radiusKm);
}
