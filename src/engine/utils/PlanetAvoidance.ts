import type { World } from '../types';
import { COMPONENT, type Position, type CelestialBody } from '../components';
import { DANGER_ZONE_MULTIPLIER } from '../constants';

/** Planning radius must allow for curved PN trajectories; too small and ships cut into the danger zone. */
const AVOIDANCE_PLANNING_MULTIPLIER = 2.0;

/** Start escaping when within this multiple of danger zone (before actually entering). */
const ESCAPE_CAUTION_MULTIPLIER = 1.3;

export interface BodyDanger {
  x: number;
  y: number;
  /** Radius used for path/waypoint avoidance (danger zone × planning multiplier). */
  radius: number;
  /** Radius used for "in danger" check (collision danger zone). */
  dangerRadius: number;
  /** Distance below which we force escape (dangerRadius × ESCAPE_CAUTION_MULTIPLIER). */
  cautionRadius: number;
}

/**
 * Returns celestial bodies with radius = danger zone for collision scaled by
 * AVOIDANCE_PLANNING_MULTIPLIER so waypoints keep curved paths clear of the zone.
 */
export function getBodiesFromWorld(world: World): BodyDanger[] {
  const bodyEntities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
  const result: BodyDanger[] = [];
  for (const id of bodyEntities) {
    const pos = world.getComponent<Position>(id, COMPONENT.Position);
    const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody);
    if (!pos || !body) continue;
    const dangerRadius = body.radius * DANGER_ZONE_MULTIPLIER;
    result.push({
      x: pos.x,
      y: pos.y,
      radius: dangerRadius * AVOIDANCE_PLANNING_MULTIPLIER,
      dangerRadius,
      cautionRadius: dangerRadius * ESCAPE_CAUTION_MULTIPLIER,
    });
  }
  return result;
}

/**
 * Returns true if the segment passes through the interior of the circle (strictly inside),
 * or either endpoint is inside. Use this for in-flight correction so we don't re-route
 * when the path only touches the circle (e.g. heading to a tangent waypoint).
 */
export function segmentPassesThroughInterior(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const distA = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2);
  const distB = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2);
  if (distA < r || distB < r) return true;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distA < r;

  let t = ((cx - ax) * dx + (cy - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  const distP = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  return distP < r;
}

/**
 * Returns true if the segment from (ax,ay) to (bx,by) intersects or lies inside
 * the circle with center (cx,cy) and radius r.
 */
export function segmentIntersectsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const distA = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2);
  const distB = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2);
  if (distA <= r || distB <= r) return true;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distA <= r;

  let t = ((cx - ax) * dx + (cy - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx;
  const py = ay + t * dy;
  const distP = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  return distP <= r;
}

const BYPASS_MARGIN = 1.15;

/**
 * Returns a point on the circle (cx,cy) with radius r that is tangent from (fromX, fromY).
 * Returns the tangent point closer to (toX, toY). If (fromX, fromY) is inside the circle,
 * returns undefined (caller should use escape vector instead).
 *
 * The tangent touch point is where the tangent line from the external point grazes the circle.
 * The segment from→tangentPoint follows the tangent line and does NOT enter the circle.
 */
function tangentPointCloserTo(
  fromX: number,
  fromY: number,
  cx: number,
  cy: number,
  r: number,
  toX: number,
  toY: number,
): { x: number; y: number } | undefined {
  const dx = fromX - cx;
  const dy = fromY - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= r) return undefined;
  // Unit vector from circle center toward "from" point
  const unitX = dx / d;
  const unitY = dy / d;
  // CCW perpendicular
  const perpX = -unitY;
  const perpY = unitX;
  // Tangent angle: sin = r/d, cos = sqrt(1 - (r/d)^2)
  const sinA = r / d;
  const cosA = Math.sqrt(1 - sinA * sinA);
  // Tangent touch points on the circle (near side, facing "from")
  const t1x = cx + r * (sinA * unitX + cosA * perpX);
  const t1y = cy + r * (sinA * unitY + cosA * perpY);
  const t2x = cx + r * (sinA * unitX - cosA * perpX);
  const t2y = cy + r * (sinA * unitY - cosA * perpY);
  const dist1 = (t1x - toX) ** 2 + (t1y - toY) ** 2;
  const dist2 = (t2x - toX) ** 2 + (t2y - toY) ** 2;
  if (dist1 <= dist2) return { x: t1x, y: t1y };
  return { x: t2x, y: t2y };
}

const MAX_RECURSION_DEPTH = 8;

/**
 * Pre-compute a chain of waypoints that form a clear path around all blocking bodies.
 * Returns an ordered array of intermediate waypoints (empty = path is clear).
 * Uses recursive segment splitting: for each blocked segment, compute a waypoint
 * around the nearest blocking body, then recursively check both sub-segments.
 */
export function getSafeWaypoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  bodies: BodyDanger[],
  depth = 0,
): { x: number; y: number }[] {
  if (depth > MAX_RECURSION_DEPTH || bodies.length === 0) return [];

  const wp = getSafeWaypoint(fromX, fromY, toX, toY, bodies);
  if (!wp) return []; // path is clear

  const before = getSafeWaypoints(fromX, fromY, wp.x, wp.y, bodies, depth + 1);
  const after = getSafeWaypoints(wp.x, wp.y, toX, toY, bodies, depth + 1);
  return [...before, wp, ...after];
}

/**
 * If the segment from (fromX, fromY) to (toX, toY) intersects any body's danger circle,
 * returns a safe waypoint (outside the first blocking body) that goes around it.
 * Otherwise returns null (path is clear).
 */
export function getSafeWaypoint(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  bodies: BodyDanger[],
): { x: number; y: number } | null {
  if (bodies.length === 0) return null;

  let blocking: BodyDanger | null = null;
  let closestDistSq = Infinity;

  for (const body of bodies) {
    if (!segmentIntersectsCircle(fromX, fromY, toX, toY, body.x, body.y, body.radius))
      continue;
    const dx = body.x - fromX;
    const dy = body.y - fromY;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestDistSq) {
      closestDistSq = d2;
      blocking = body;
    }
  }

  if (!blocking) return null;

  const dx = fromX - blocking.x;
  const dy = fromY - blocking.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d <= blocking.radius) {
    const margin = blocking.radius * BYPASS_MARGIN;
    const nx = d > 0 ? dx / d : 1;
    const ny = d > 0 ? dy / d : 0;
    return {
      x: blocking.x + nx * margin,
      y: blocking.y + ny * margin,
    };
  }

  const tangent = tangentPointCloserTo(
    fromX,
    fromY,
    blocking.x,
    blocking.y,
    blocking.radius,
    toX,
    toY,
  );
  if (!tangent) return null;
  const margin = BYPASS_MARGIN;
  return {
    x: blocking.x + (tangent.x - blocking.x) * margin,
    y: blocking.y + (tangent.y - blocking.y) * margin,
  };
}
