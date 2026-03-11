import { describe, it, expect } from 'vitest';
import {
  segmentIntersectsCircle,
  segmentPassesThroughInterior,
  getSafeWaypoint,
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

describe('getBodiesFromWorld', () => {
  it('returns empty array when world has no celestial bodies', () => {
    const world = new WorldImpl();
    expect(getBodiesFromWorld(world)).toEqual([]);
  });
});
