import { describe, it, expect } from 'vitest';
import {
  getSafeWaypoints,
  segmentIntersectsCircle,
  type BodyDanger,
} from '../../../src/engine/utils/PlanetAvoidance';

const body = (x: number, y: number, r: number): BodyDanger => ({
  x,
  y,
  radius: r * 2.0,
  dangerRadius: r,
  cautionRadius: r * 1.3,
});

function pathClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  wps: { x: number; y: number }[],
  bodies: BodyDanger[],
  useDangerRadius: boolean,
): { ok: boolean; segIdx?: number; bodyIdx?: number; minDist?: number } {
  const points = [from, ...wps, to];
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < bodies.length; j++) {
      const b = bodies[j];
      const r = useDangerRadius ? b.dangerRadius : b.radius;
      if (segmentIntersectsCircle(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, b.x, b.y, r)) {
        return { ok: false, segIdx: i, bodyIdx: j };
      }
    }
  }
  return { ok: true };
}

describe('PlanetAvoidance edge cases', () => {
  it('clears path against the planning radius for two staggered bodies', () => {
    // Path goes near both bodies; second body is offset such that the tangent
    // around the first body brings us close to the second body.
    const bodies = [body(0, 0, 1), body(0.5, 1.2, 1)];
    const from = { x: 10, y: 0 };
    const to = { x: -10, y: 0 };
    const wps = getSafeWaypoints(from.x, from.y, to.x, to.y, bodies);
    const r = pathClear(from, to, wps, bodies, false);
    expect(r.ok).toBe(true);
  });

  it('clears path when bodies are tightly clustered (binary)', () => {
    const bodies = [body(0, 0, 1), body(2.5, 0, 1)];
    const from = { x: 10, y: 0.1 };
    const to = { x: -10, y: -0.1 };
    const wps = getSafeWaypoints(from.x, from.y, to.x, to.y, bodies);
    const r = pathClear(from, to, wps, bodies, false);
    expect(r.ok).toBe(true);
  });

  it('clears path going past a planet with destination just beyond it', () => {
    const bodies = [body(0, 0, 1)];
    const from = { x: 10, y: 0 };
    const to = { x: -3, y: 0 }; // Just past the body
    const wps = getSafeWaypoints(from.x, from.y, to.x, to.y, bodies);
    const r = pathClear(from, to, wps, bodies, false);
    expect(r.ok).toBe(true);
  });

  it('clears path when destination is at body danger boundary', () => {
    const bodies = [body(0, 0, 1)];
    const from = { x: 10, y: 0 };
    // destination just outside planning radius (=2) but inside legacy zone
    const to = { x: -2.01, y: 0 };
    const wps = getSafeWaypoints(from.x, from.y, to.x, to.y, bodies);
    const r = pathClear(from, to, wps, bodies, true);
    expect(r.ok).toBe(true);
  });

  it('clears solar-system-like long path through inner planets', () => {
    // Roughly Sol + Mercury + Venus + Terra at realistic km scale
    const bodies = [
      body(0, 0, 696_340), // Sol
      body(57_900_000, 0, 2_440), // Mercury
      body(108_000_000, 0, 6_052), // Venus
      body(150_000_000, 0, 6_371), // Terra
    ];
    // Ship at Terra orbit going across to opposite side of Sol
    const from = { x: 150_000_000 + 50_000, y: 0 };
    const to = { x: -150_000_000, y: 0 };
    const wps = getSafeWaypoints(from.x, from.y, to.x, to.y, bodies);
    const r = pathClear(from, to, wps, bodies, false);
    expect(r.ok).toBe(true);
  });

  it('produces minimal waypoint count for simple bypass', () => {
    const bodies = [body(0, 0, 1)];
    const wps = getSafeWaypoints(10, 0, -10, 0, bodies);
    // One body, one waypoint should suffice
    expect(wps.length).toBeLessThanOrEqual(2);
  });

  it('handles narrow gap that cannot be threaded — must go around', () => {
    // Two bodies almost touching — gap < clearance — must go around the cluster
    const bodies = [body(0, 1.05, 1), body(0, -1.05, 1)];
    const from = { x: 10, y: 0 };
    const to = { x: -10, y: 0 };
    const wps = getSafeWaypoints(from.x, from.y, to.x, to.y, bodies);
    const r = pathClear(from, to, wps, bodies, false);
    expect(r.ok).toBe(true);
  });

  it('escape from inside body radius produces path that does not re-enter', () => {
    const bodies = [body(0, 0, 1)];
    // Ship at (0.3, 0) — inside danger radius of 1
    const from = { x: 0.3, y: 0 };
    const to = { x: 5, y: 0 };
    const wps = getSafeWaypoints(from.x, from.y, to.x, to.y, bodies);
    // After the first waypoint, the path should be clear
    expect(wps.length).toBeGreaterThan(0);
    const points = [from, ...wps, to];
    // The first segment is the escape — may pass through, but subsequent must not
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      expect(
        segmentIntersectsCircle(a.x, a.y, b.x, b.y, 0, 0, 1),
        `segment ${i} (${a.x},${a.y})→(${b.x},${b.y}) intersects body`,
      ).toBe(false);
    }
  });
});
