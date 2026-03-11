import type { World } from '../engine/types';
import { COMPONENT, type Position, type CelestialBody } from '../engine/components';
import { DANGER_ZONE_MULTIPLIER } from '../engine/systems/CollisionSystem';

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
  const sin = r / d;
  const cos = Math.sqrt(1 - sin * sin);
  const ux = -dx / d;
  const uy = -dy / d;
  const perpX = -uy;
  const perpY = ux;
  const t1x = cx + r * (ux * cos + perpX * sin);
  const t1y = cy + r * (uy * cos + perpY * sin);
  const t2x = cx + r * (ux * cos - perpX * sin);
  const t2y = cy + r * (uy * cos - perpY * sin);
  const dist1 = (t1x - toX) ** 2 + (t1y - toY) ** 2;
  const dist2 = (t2x - toX) ** 2 + (t2y - toY) ** 2;
  if (dist1 <= dist2) return { x: t1x, y: t1y };
  return { x: t2x, y: t2y };
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
