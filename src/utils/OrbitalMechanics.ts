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
): { ax: number; ay: number } {
  const dx = mx - px;
  const dy = my - py;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);

  if (dist < 1) {
    // Prevent singularity at very close distances
    return { ax: 0, ay: 0 };
  }

  const accel = (G_KM * mass) / distSq;
  return {
    ax: accel * (dx / dist),
    ay: accel * (dy / dist),
  };
}

/**
 * Calculate orbital velocity for a circular orbit at given radius.
 */
export function circularOrbitSpeed(mass: number, radiusKm: number): number {
  return Math.sqrt((G_KM * mass) / radiusKm);
}
