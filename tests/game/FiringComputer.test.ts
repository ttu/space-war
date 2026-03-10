import { describe, it, expect } from 'vitest';
import {
  computeLeadSolution,
  hitProbability,
  type LeadSolution,
} from '../../src/game/FiringComputer';

describe('FiringComputer', () => {
  describe('computeLeadSolution', () => {
    it('returns intercept at target position when target is stationary', () => {
      const result = computeLeadSolution(
        0, 0, 0, 0,   // shooter at origin, stationary
        100, 0, 0, 0, // target at (100, 0), stationary
        10,            // 10 km/s projectile
      );
      expect(result).not.toBeNull();
      expect((result as LeadSolution).interceptX).toBeCloseTo(100);
      expect((result as LeadSolution).interceptY).toBeCloseTo(0);
      expect((result as LeadSolution).timeToImpact).toBeCloseTo(10); // 100 km / 10 km/s
    });

    it('returns null when target is out of range', () => {
      const result = computeLeadSolution(
        0, 0, 0, 0,
        100_000, 0, 0, 0,
        10,
        50_000, // maxRange 50_000 km
      );
      expect(result).toBeNull();
    });

    it('leads a moving target', () => {
      // Shooter at origin, target at (100, 0) moving away at 2 km/s in +x
      const result = computeLeadSolution(
        0, 0, 0, 0,
        100, 0, 2, 0,
        20, // projectile 20 km/s
      );
      expect(result).not.toBeNull();
      // Intercept must be ahead of current target position (target moves, we aim ahead)
      expect((result as LeadSolution).interceptX).toBeGreaterThan(100);
      expect((result as LeadSolution).timeToImpact).toBeGreaterThan(0);
    });

    it('returns null when no intercept is possible (target moving away too fast)', () => {
      const result = computeLeadSolution(
        0, 0, 0, 0,
        100, 0, 100, 0, // target moving away at 100 km/s
        10,              // projectile only 10 km/s
      );
      expect(result).toBeNull();
    });
  });

  describe('hitProbability', () => {
    it('returns a value between 0 and 1', () => {
      const p = hitProbability(1000, 1, 50, 10_000);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });

    it('decreases with range when other factors fixed', () => {
      const close = hitProbability(500, 1, 50, 10_000);
      const far = hitProbability(5000, 1, 50, 10_000);
      expect(close).toBeGreaterThan(far);
    });

    it('decreases with target speed when other factors fixed', () => {
      const slow = hitProbability(1000, 0.5, 50, 10_000);
      const fast = hitProbability(1000, 5, 50, 10_000);
      expect(slow).toBeGreaterThan(fast);
    });
  });
});
