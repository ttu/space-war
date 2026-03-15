import { describe, it, expect } from 'vitest';
import {
  segmentIntersectsCircle,
  segmentPassesThroughInterior,
  getSafeWaypoint,
  getSafeWaypoints,
  getBodiesFromWorld,
  type BodyDanger,
} from '../../src/game/PlanetAvoidance';
import { WorldImpl } from '../../src/engine/ecs/World';

describe('segmentIntersectsCircle', () => {
  it('returns false when segment is far from circle', () => {
    expect(segmentIntersectsCircle(0, 0, 10, 0, 5, 5, 1)).toBe(false);
  });

  it('returns true when segment crosses circle', () => {
    expect(segmentIntersectsCircle(0, 0, 10, 0, 5, 0, 2)).toBe(true);
  });

  it('returns true when segment is entirely inside circle', () => {
    expect(segmentIntersectsCircle(1, 0, 2, 0, 0, 0, 5)).toBe(true);
  });

  it('returns true when one endpoint is on circle boundary', () => {
    expect(segmentIntersectsCircle(0, 0, 3, 0, 0, 0, 3)).toBe(true);
  });

  it('returns true when segment goes from inside to outside', () => {
    expect(segmentIntersectsCircle(0, 0, 10, 0, 0, 0, 2)).toBe(true);
  });
});

describe('segmentPassesThroughInterior', () => {
  it('returns false when segment is tangent to circle', () => {
    // Horizontal line y=2 touches circle center (5,0) r=2 at (5,2) only
    expect(segmentPassesThroughInterior(0, 2, 10, 2, 5, 0, 2)).toBe(false);
  });

  it('returns true when segment crosses through circle', () => {
    expect(segmentPassesThroughInterior(0, 0, 10, 0, 5, 0, 3)).toBe(true);
  });
});

describe('getSafeWaypoint', () => {
  it('returns null when bodies array is empty', () => {
    expect(getSafeWaypoint(0, 0, 100, 0, [])).toBeNull();
  });

  it('returns null when path does not intersect any body', () => {
    const bodies: BodyDanger[] = [{ x: 50, y: 50, radius: 10, dangerRadius: 10, cautionRadius: 15 }];
    expect(getSafeWaypoint(0, 0, 100, 0, bodies)).toBeNull();
  });

  it('returns a waypoint outside circle when path is blocked', () => {
    const bodies: BodyDanger[] = [{ x: 50, y: 0, radius: 10, dangerRadius: 10, cautionRadius: 15 }];
    const result = getSafeWaypoint(0, 0, 100, 0, bodies);
    expect(result).not.toBeNull();
    if (result) {
      const dist = Math.sqrt((result.x - 50) ** 2 + (result.y - 0) ** 2);
      expect(dist).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('getSafeWaypoints', () => {
  it('returns empty array when path is clear', () => {
    const bodies: BodyDanger[] = [{ x: 50, y: 50, radius: 10, dangerRadius: 10, cautionRadius: 15 }];
    expect(getSafeWaypoints(0, 0, 100, 0, bodies)).toEqual([]);
  });

  it('returns waypoints around a single blocking body', () => {
    const bodies: BodyDanger[] = [{ x: 50, y: 0, radius: 10, dangerRadius: 10, cautionRadius: 15 }];
    const result = getSafeWaypoints(0, 0, 100, 0, bodies);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // All waypoints should be outside the avoidance radius
    for (const wp of result) {
      const dist = Math.sqrt((wp.x - 50) ** 2 + (wp.y - 0) ** 2);
      expect(dist).toBeGreaterThanOrEqual(10);
    }
  });

  it('returns multiple waypoints when path crosses two bodies', () => {
    const bodies: BodyDanger[] = [
      { x: 30, y: 0, radius: 10, dangerRadius: 10, cautionRadius: 15 },
      { x: 70, y: 0, radius: 10, dangerRadius: 10, cautionRadius: 15 },
    ];
    const result = getSafeWaypoints(0, 0, 100, 0, bodies);
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Each waypoint should be outside its respective body
    for (const wp of result) {
      for (const body of bodies) {
        const dist = Math.sqrt((wp.x - body.x) ** 2 + (wp.y - body.y) ** 2);
        // Waypoint should not be inside any body's avoidance radius
        expect(dist).toBeGreaterThanOrEqual(10 - 1); // small tolerance for tangent points
      }
    }
  });

  it('generates a clear path (no segment clips any body)', () => {
    // Planet directly in the middle of the path
    const bodies: BodyDanger[] = [{ x: 50, y: 0, radius: 20, dangerRadius: 20, cautionRadius: 30 }];
    const waypoints = getSafeWaypoints(0, 0, 100, 0, bodies);
    // Build full path: start → waypoints → end
    const path = [{ x: 0, y: 0 }, ...waypoints, { x: 100, y: 0 }];
    for (let i = 0; i < path.length - 1; i++) {
      const blocked = segmentIntersectsCircle(
        path[i].x, path[i].y, path[i + 1].x, path[i + 1].y,
        50, 0, 20,
      );
      expect(blocked).toBe(false);
    }
  });

  it('handles destination on opposite side of a large planet', () => {
    // Ship at top, destination at bottom, large planet in center
    const bodies: BodyDanger[] = [{ x: 0, y: 0, radius: 50, dangerRadius: 50, cautionRadius: 75 }];
    const result = getSafeWaypoints(0, 100, 0, -100, bodies);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Full path should not clip the planet
    const path = [{ x: 0, y: 100 }, ...result, { x: 0, y: -100 }];
    for (let i = 0; i < path.length - 1; i++) {
      const blocked = segmentIntersectsCircle(
        path[i].x, path[i].y, path[i + 1].x, path[i + 1].y,
        0, 0, 50,
      );
      expect(blocked).toBe(false);
    }
  });

  it('respects max recursion depth', () => {
    // Overlapping bodies that could cause infinite recursion
    const bodies: BodyDanger[] = [];
    for (let i = 0; i < 20; i++) {
      bodies.push({ x: 10 + i * 5, y: 0, radius: 10, dangerRadius: 10, cautionRadius: 15 });
    }
    // Should not throw or hang — returns some waypoints within depth limit
    const result = getSafeWaypoints(0, 0, 200, 0, bodies);
    expect(result).toBeDefined();
  });
});

describe('getBodiesFromWorld', () => {
  it('returns empty array when world has no celestial bodies', () => {
    const world = new WorldImpl();
    expect(getBodiesFromWorld(world)).toEqual([]);
  });
});
