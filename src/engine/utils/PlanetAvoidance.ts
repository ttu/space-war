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
    // Stations are docking targets, not navigation hazards — ships are expected
    // to fly close to them. Including them produced spurious avoidance waypoints
    // when ships departed from a station.
    if (body.bodyType === 'station') continue;
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
 * Returns BOTH tangent points on the circle (cx,cy,r) from external point (fromX,fromY),
 * ordered (CCW-side, CW-side). Returns null if (fromX,fromY) is inside the circle.
 */
function tangentPoints(
  fromX: number,
  fromY: number,
  cx: number,
  cy: number,
  r: number,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const dx = fromX - cx;
  const dy = fromY - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= r) return null;
  const unitX = dx / d;
  const unitY = dy / d;
  const perpX = -unitY;
  const perpY = unitX;
  // Angle at center between C→from and C→tangent: cos(α) = r/d.
  // (Variable names below preserve the original code's labeling for stability.)
  const sinA = r / d;
  const cosA = Math.sqrt(1 - sinA * sinA);
  return [
    { x: cx + r * (sinA * unitX + cosA * perpX), y: cy + r * (sinA * unitY + cosA * perpY) },
    { x: cx + r * (sinA * unitX - cosA * perpX), y: cy + r * (sinA * unitY - cosA * perpY) },
  ];
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
 * Returns true if (px, py) is inside any body's planning radius, optionally
 * excluding `except`. Used to validate candidate waypoints don't land inside
 * neighboring planets when planning circles overlap.
 */
function pointInsideAnyBody(
  px: number,
  py: number,
  bodies: BodyDanger[],
  except: BodyDanger | null,
): BodyDanger | null {
  for (const b of bodies) {
    if (b === except) continue;
    const dx = px - b.x;
    const dy = py - b.y;
    if (dx * dx + dy * dy < b.radius * b.radius) return b;
  }
  return null;
}

/**
 * Build a "cluster" bounding circle that encloses `seed` plus every body whose
 * planning circle overlaps the cluster. Used as a fallback when the natural
 * tangent waypoints around `seed` would land inside neighbouring bodies — by
 * routing around the union we avoid recursion thrashing.
 */
function clusterBoundingCircle(
  seed: BodyDanger,
  bodies: BodyDanger[],
): { x: number; y: number; radius: number } {
  const members: BodyDanger[] = [seed];
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of bodies) {
      if (members.includes(b)) continue;
      for (const m of members) {
        const dx = b.x - m.x;
        const dy = b.y - m.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < b.radius + m.radius) {
          members.push(b);
          changed = true;
          break;
        }
      }
    }
  }
  if (members.length === 1) return { x: seed.x, y: seed.y, radius: seed.radius };
  // Bounding circle: centroid + max distance to any member's far edge.
  let cx = 0, cy = 0;
  for (const m of members) { cx += m.x; cy += m.y; }
  cx /= members.length;
  cy /= members.length;
  let radius = 0;
  for (const m of members) {
    const dx = m.x - cx;
    const dy = m.y - cy;
    const reach = Math.sqrt(dx * dx + dy * dy) + m.radius;
    if (reach > radius) radius = reach;
  }
  return { x: cx, y: cy, radius };
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
    // Ship inside body — escape radially outward to just past the planning radius.
    const margin = blocking.radius * BYPASS_MARGIN;
    const nx = d > 0 ? dx / d : 1;
    const ny = d > 0 ? dy / d : 0;
    return {
      x: blocking.x + nx * margin,
      y: blocking.y + ny * margin,
    };
  }

  const candidates = tangentWaypoints(fromX, fromY, blocking);
  if (!candidates) return null;
  const [wpA, wpB] = candidates;

  // Prefer a tangent waypoint that does NOT land inside a neighbouring body's
  // planning circle. Without this filter, recursion on the inner body produces
  // duplicated waypoints and final paths that still cross the danger zone.
  const aClear = pointInsideAnyBody(wpA.x, wpA.y, bodies, blocking) === null;
  const bClear = pointInsideAnyBody(wpB.x, wpB.y, bodies, blocking) === null;

  if (aClear && bClear) return closerTo(wpA, wpB, toX, toY);
  if (aClear) return wpA;
  if (bClear) return wpB;

  // Both natural tangents are inside neighbour planning circles — the bodies
  // form an overlapping cluster. Route around the cluster's bounding circle.
  const cluster = clusterBoundingCircle(blocking, bodies);
  const clusterTangents = tangentPoints(fromX, fromY, cluster.x, cluster.y, cluster.radius);
  if (!clusterTangents) return closerTo(wpA, wpB, toX, toY);
  const [cA, cB] = clusterTangents;
  const cwpA = { x: cluster.x + (cA.x - cluster.x) * BYPASS_MARGIN, y: cluster.y + (cA.y - cluster.y) * BYPASS_MARGIN };
  const cwpB = { x: cluster.x + (cB.x - cluster.x) * BYPASS_MARGIN, y: cluster.y + (cB.y - cluster.y) * BYPASS_MARGIN };
  return closerTo(cwpA, cwpB, toX, toY);
}

function tangentWaypoints(
  fromX: number,
  fromY: number,
  body: BodyDanger,
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const ts = tangentPoints(fromX, fromY, body.x, body.y, body.radius);
  if (!ts) return null;
  return [
    { x: body.x + (ts[0].x - body.x) * BYPASS_MARGIN, y: body.y + (ts[0].y - body.y) * BYPASS_MARGIN },
    { x: body.x + (ts[1].x - body.x) * BYPASS_MARGIN, y: body.y + (ts[1].y - body.y) * BYPASS_MARGIN },
  ];
}

function closerTo(
  a: { x: number; y: number },
  b: { x: number; y: number },
  toX: number,
  toY: number,
): { x: number; y: number } {
  const dA = (a.x - toX) ** 2 + (a.y - toY) ** 2;
  const dB = (b.x - toX) ** 2 + (b.y - toY) ** 2;
  return dA <= dB ? a : b;
}
