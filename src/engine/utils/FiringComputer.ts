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
 * Solve the constant-velocity intercept quadratic.
 * Returns the smallest positive time, or null if no solution.
 */
function solveConstantVelocityIntercept(
  Dx: number, Dy: number,
  relVx: number, relVy: number,
  projectileSpeed: number,
): number | null {
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
  return t;
}

/**
 * Compute intercept solution: where to aim and time to impact.
 * Projectile is assumed to travel in a straight line at constant speed from shooter position.
 *
 * When target acceleration (targetAx, targetAy) is provided, uses iterative refinement
 * to account for the target's acceleration — solving the quartic implicitly by re-solving
 * the quadratic with updated predicted positions. Converges in 3 iterations for smooth burns.
 *
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
  targetAx: number = 0,
  targetAy: number = 0,
): LeadSolution | null {
  const Dx = targetX - shooterX;
  const Dy = targetY - shooterY;
  const range = Math.sqrt(Dx * Dx + Dy * Dy);
  if (range < 1e-6) return null;
  if (maxRange != null && range > maxRange) return null;

  const relVx = targetVx - shooterVx;
  const relVy = targetVy - shooterVy;

  // Solve constant-velocity intercept as initial estimate
  let t = solveConstantVelocityIntercept(Dx, Dy, relVx, relVy, projectileSpeed);
  if (t == null) return null;

  // If target is accelerating, iteratively refine the intercept time.
  // Each iteration: compute where acceleration moves the target by time t,
  // shift the target position by that offset, and re-solve the constant-velocity quadratic.
  const hasAccel = Math.abs(targetAx) > 1e-12 || Math.abs(targetAy) > 1e-12;
  if (hasAccel) {
    const ITERATIONS = 3;
    for (let i = 0; i < ITERATIONS; i++) {
      // Extra displacement from acceleration at estimated time t
      const accelOffsetX = 0.5 * targetAx * t * t;
      const accelOffsetY = 0.5 * targetAy * t * t;

      // Re-solve with shifted target position, keeping original velocity
      const adjDx = Dx + accelOffsetX;
      const adjDy = Dy + accelOffsetY;

      const newT = solveConstantVelocityIntercept(adjDx, adjDy, relVx, relVy, projectileSpeed);
      if (newT == null) return null;
      t = newT;
    }
  }

  if (maxRange != null && projectileSpeed * t > maxRange) return null;

  // Final intercept position (with acceleration if present)
  const interceptX = targetX + targetVx * t + 0.5 * targetAx * t * t;
  const interceptY = targetY + targetVy * t + 0.5 * targetAy * t * t;
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

/**
 * Estimate hit probability for a guided missile (0..1).
 * Uses range to target, closing rate, target evasion, and fuel remaining.
 */
export function missileHitProbability(
  missileX: number,
  missileY: number,
  missileVx: number,
  missileVy: number,
  missileAccel: number,
  missileFuel: number,
  seekerRange: number,
  targetX: number,
  targetY: number,
  targetVx: number,
  targetVy: number,
): number {
  const dx = targetX - missileX;
  const dy = targetY - missileY;
  const range = Math.sqrt(dx * dx + dy * dy);
  if (range < 1) return 1;
  if (seekerRange <= 0) return 0;

  const missileSpeed = Math.sqrt(missileVx * missileVx + missileVy * missileVy);
  const closingSpeed = (dx * (missileVx - targetVx) + dy * (missileVy - targetVy)) / range;
  const targetSpeed = Math.sqrt(targetVx * targetVx + targetVy * targetVy);

  const refSpeed = Math.max(0.5, missileSpeed + missileAccel * 2);

  // Range: smooth decay that never zeros (so launch shows non-zero P)
  const rangeScale = seekerRange * 4;
  const rangeFactor = 1 / (1 + range / rangeScale);

  // When not yet closing (e.g. at launch) use 0.5 so we don't show 0%
  const closingFactor = closingSpeed > 0
    ? Math.min(1, 0.5 + 0.5 * (closingSpeed / refSpeed))
    : 0.5;

  const evasionFactor = 1 - 0.35 * Math.min(1, targetSpeed / refSpeed);

  const estTimeToIntercept = closingSpeed > 0
    ? range / closingSpeed
    : range / Math.max(0.1, missileSpeed);
  const fuelRatio = missileFuel > 0 && estTimeToIntercept > 0
    ? Math.min(2, missileFuel / Math.max(0.1, estTimeToIntercept))
    : 1;
  const fuelFactor = 0.5 + 0.5 * Math.min(1, fuelRatio);

  let p = rangeFactor * closingFactor * evasionFactor * fuelFactor;

  if (range <= seekerRange && closingSpeed > 0) {
    const terminal = 1 - range / seekerRange;
    p = Math.min(1, p * (1 + 0.4 * terminal));
  }

  return Math.max(0, Math.min(1, p));
}
