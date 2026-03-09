import { BurnPlan } from '../engine/components';

const TWO_PI = Math.PI * 2;

/** Normalize angle to [0, 2π) */
export function normalizeAngle(angle: number): number {
  const a = angle % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Shortest signed rotation from `from` to `to` in [-π, π] */
export function shortestAngleDelta(from: number, to: number): number {
  const diff = normalizeAngle(to) - normalizeAngle(from);
  if (diff > Math.PI) return diff - TWO_PI;
  if (diff < -Math.PI) return diff + TWO_PI;
  return diff;
}

/** Angle from point (x1,y1) to (x2,y2) */
export function angleBetweenPoints(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  return normalizeAngle(Math.atan2(y2 - y1, x2 - x1));
}

/**
 * Compute a brachistochrone burn plan to reach target from current state.
 *
 * Strategy:
 * 1. Project current velocity onto the direction toward target
 * 2. Compute time to accelerate to midpoint, then decelerate to stop
 * 3. Account for velocity component along the travel direction
 *
 * Simplifications:
 * - Ignores gravity (correction burns happen naturally during execution)
 * - Assumes constant max acceleration
 * - No coast phase (full brachistochrone)
 */
export function computeBurnPlan(
  px: number, py: number,
  vx: number, vy: number,
  tx: number, ty: number,
  maxAccel: number,
): BurnPlan {
  const dx = tx - px;
  const dy = ty - py;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const burnDirection = normalizeAngle(Math.atan2(dy, dx));
  const flipAngle = normalizeAngle(burnDirection + Math.PI);

  if (distance < 1) {
    return {
      accelTime: 0,
      coastTime: 0,
      decelTime: 0,
      totalTime: 0,
      flipAngle,
      burnDirection,
    };
  }

  // Project current velocity onto travel direction
  const dirX = dx / distance;
  const dirY = dy / distance;
  const vAlongDir = vx * dirX + vy * dirY;

  // Effective distance accounting for current velocity:
  // We need to solve: accelerate from vAlongDir to some peak velocity,
  // then decelerate from peak to 0, covering total `distance`.
  //
  // With acceleration a:
  //   During accel phase (time t1): distance1 = vAlongDir*t1 + 0.5*a*t1², final_v = vAlongDir + a*t1
  //   During decel phase (time t2): distance2 = final_v*t2 - 0.5*a*t2², final_v - a*t2 = 0 → t2 = final_v/a
  //
  // total_distance = distance1 + distance2
  // Substituting final_v = vAlongDir + a*t1 and t2 = (vAlongDir + a*t1)/a:
  //   d = vAlongDir*t1 + 0.5*a*t1² + (vAlongDir + a*t1)²/(2a)
  //   d = vAlongDir*t1 + 0.5*a*t1² + (v² + 2*v*a*t1 + a²*t1²)/(2a)
  //   d = vAlongDir*t1 + 0.5*a*t1² + v²/(2a) + v*t1 + 0.5*a*t1²
  //   d = 2*vAlongDir*t1 + a*t1² + v²/(2a)
  //
  // Solving quadratic: a*t1² + 2*v*t1 + (v²/(2a) - d) = 0

  const a = maxAccel;
  const v = vAlongDir;

  const qa = a;
  const qb = 2 * v;
  const qc = (v * v) / (2 * a) - distance;

  const discriminant = qb * qb - 4 * qa * qc;

  let accelTime: number;
  if (discriminant < 0) {
    // Shouldn't happen for valid inputs, fallback to simple estimate
    accelTime = Math.sqrt(distance / a);
  } else {
    const sqrtDisc = Math.sqrt(discriminant);
    const t1a = (-qb + sqrtDisc) / (2 * qa);
    const t1b = (-qb - sqrtDisc) / (2 * qa);
    // Pick the positive solution
    accelTime = t1a > 0 ? t1a : t1b > 0 ? t1b : Math.sqrt(distance / a);
  }

  accelTime = Math.max(0, accelTime);
  const peakV = v + a * accelTime;
  const decelTime = Math.max(0, peakV / a);

  return {
    accelTime,
    coastTime: 0,
    decelTime,
    totalTime: accelTime + decelTime,
    flipAngle,
    burnDirection,
  };
}
