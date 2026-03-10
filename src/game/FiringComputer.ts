/**
 * Hit probability estimation and lead targeting for railguns.
 * Pure math; used by RailgunSystem and UI for solution quality display.
 */

export interface LeadSolution {
  interceptX: number;
  interceptY: number;
  timeToImpact: number;
  /** Direction from shooter to intercept (radians) */
  fireAngle: number;
}

/**
 * Compute intercept solution: where to aim and time to impact.
 * Projectile is assumed to travel in a straight line at constant speed from shooter position.
 * Target moves at constant velocity.
 * Returns null if no solution (target out of maxRange or unreachable).
 */
export function computeLeadSolution(
  shooterX: number,
  shooterY: number,
  shooterVx: number,
  shooterVy: number,
  targetX: number,
  targetY: number,
  targetVx: number,
  targetVy: number,
  projectileSpeed: number,
  maxRange?: number,
): LeadSolution | null {
  const Dx = targetX - shooterX;
  const Dy = targetY - shooterY;
  const rangeSq = Dx * Dx + Dy * Dy;
  const range = Math.sqrt(rangeSq);
  if (range < 1e-6) return null;
  if (maxRange != null && range > maxRange) return null;

  // Relative velocity: target velocity in shooter frame (we treat shooter as stationary for intercept)
  const relVx = targetVx - shooterVx;
  const relVy = targetVy - shooterVy;

  // Solve: |D + V_rel * t| = projectileSpeed * t
  // => (Dx + relVx*t)^2 + (Dy + relVy*t)^2 = projectileSpeed^2 * t^2
  const a = relVx * relVx + relVy * relVy - projectileSpeed * projectileSpeed;
  const b = 2 * (Dx * relVx + Dy * relVy);
  const c = Dx * Dx + Dy * Dy;

  let t: number | null = null;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return null;
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    const valid = [t1, t2].filter((x) => x > 0);
    if (valid.length === 0) return null;
    t = Math.min(...valid);
  }
  if (t == null || t <= 0) return null;

  if (maxRange != null && projectileSpeed * t > maxRange) return null;

  const interceptX = targetX + targetVx * t;
  const interceptY = targetY + targetVy * t;
  const fireAngle = Math.atan2(interceptY - shooterY, interceptX - shooterX);

  return {
    interceptX,
    interceptY,
    timeToImpact: t,
    fireAngle,
  };
}

/**
 * Estimate hit probability for display (0..1).
 * Simple model: decreases with range and target transverse speed.
 */
export function hitProbability(
  range: number,
  targetSpeed: number,
  projectileSpeed: number,
  maxRange: number,
): number {
  if (range <= 0 || range >= maxRange) return 0;
  const rangeFactor = 1 - (range / maxRange) * (range / maxRange);
  const speedRatio = Math.min(1, targetSpeed / Math.max(0.1, projectileSpeed));
  const speedFactor = 1 - 0.5 * speedRatio;
  const p = rangeFactor * speedFactor;
  return Math.max(0, Math.min(1, p));
}
