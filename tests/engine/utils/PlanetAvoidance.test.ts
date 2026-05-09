import { describe, it, expect } from 'vitest';
import {
  getSafeWaypoints,
  segmentIntersectsCircle,
  type BodyDanger,
} from '../../../src/engine/utils/PlanetAvoidance';

function pathSegmentsClear(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  waypoints: { x: number; y: number }[],
  bodies: BodyDanger[],
  // Use the dangerRadius (collision threshold), not the planning radius,
  // because waypoints are placed just outside the planning radius by design.
  useDangerRadius = true,
): { ok: boolean; failingSegment?: number; failingBody?: number } {
  const points = [{ x: fromX, y: fromY }, ...waypoints, { x: toX, y: toY }];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0; j < bodies.length; j++) {
      const body = bodies[j];
      const r = useDangerRadius ? body.dangerRadius : body.radius;
      if (segmentIntersectsCircle(a.x, a.y, b.x, b.y, body.x, body.y, r)) {
        return { ok: false, failingSegment: i, failingBody: j };
      }
    }
  }
  return { ok: true };
}

const body = (x: number, y: number, r: number): BodyDanger => ({
  x,
  y,
  radius: r * 2.0, // planning radius (matches AVOIDANCE_PLANNING_MULTIPLIER = 2.0)
  dangerRadius: r,
  cautionRadius: r * 1.3,
});

describe('PlanetAvoidance: getSafeWaypoints', () => {
  it('clears path through single body (head-on)', () => {
    const bodies = [body(0, 0, 1)];
    const wps = getSafeWaypoints(10, 0, -10, 0, bodies);
    const result = pathSegmentsClear(10, 0, -10, 0, wps, bodies);
    expect(result.ok).toBe(true);
  });

  it('clears path with two bodies in a row', () => {
    const bodies = [body(0, 0, 1), body(5, 0.5, 1)];
    const wps = getSafeWaypoints(10, 0, -10, 0, bodies);
    const result = pathSegmentsClear(10, 0, -10, 0, wps, bodies);
    expect(result.ok).toBe(true);
  });

  it('clears path that passes between two bodies (must go around one)', () => {
    // Two bodies forming a "wall" — path goes through gap between them
    const bodies = [body(0, 2, 1), body(0, -2, 1)];
    const wps = getSafeWaypoints(10, 0, -10, 0, bodies);
    const result = pathSegmentsClear(10, 0, -10, 0, wps, bodies);
    expect(result.ok).toBe(true);
  });

  it('returns no waypoints for clear path', () => {
    const bodies = [body(0, 100, 1)];
    const wps = getSafeWaypoints(10, 0, -10, 0, bodies);
    expect(wps.length).toBe(0);
  });

  it('clears path when destination is inside danger zone', () => {
    // ship to a point near a body
    const bodies = [body(0, 0, 1)];
    const wps = getSafeWaypoints(10, 0, 0.5, 0, bodies);
    // The destination itself is inside the body, so path can't be fully clear,
    // but the algorithm should at least produce a path that doesn't cross
    // through the body before the final segment.
    const points = [{ x: 10, y: 0 }, ...wps, { x: 0.5, y: 0 }];
    // All segments except possibly the last should be clear
    for (let i = 0; i < points.length - 2; i++) {
      const a = points[i];
      const b = points[i + 1];
      expect(segmentIntersectsCircle(a.x, a.y, b.x, b.y, 0, 0, 1)).toBe(false);
    }
  });

  it('clears path when ship starts inside danger zone (escape)', () => {
    const bodies = [body(0, 0, 1)];
    // Ship at (0.5, 0) — inside danger radius=1, escape required
    const wps = getSafeWaypoints(0.5, 0, 10, 0, bodies);
    expect(wps.length).toBeGreaterThan(0);
  });

  it('produces a path that clears the planning radius (not just danger radius)', () => {
    // The whole point of planning radius being 2× danger radius is to leave
    // visual breathing room. After avoidance, the path should be clear of the
    // larger planning radius too.
    const bodies = [body(0, 0, 1)];
    const wps = getSafeWaypoints(10, 0, -10, 0, bodies);
    const result = pathSegmentsClear(10, 0, -10, 0, wps, bodies, false);
    expect(result.ok).toBe(true);
  });

  it('handles destination directly behind a body relative to ship', () => {
    const bodies = [body(0, 0, 1)];
    // Almost exactly co-linear
    const wps = getSafeWaypoints(10, 0.001, -10, -0.001, bodies);
    const result = pathSegmentsClear(10, 0.001, -10, -0.001, wps, bodies);
    expect(result.ok).toBe(true);
  });

  it('handles three bodies in a cluster', () => {
    const bodies = [body(0, 0, 1), body(2, 1, 1), body(-2, 1, 1)];
    const wps = getSafeWaypoints(10, 0, -10, 0, bodies);
    const result = pathSegmentsClear(10, 0, -10, 0, wps, bodies);
    expect(result.ok).toBe(true);
  });
});
