import { describe, it, expect } from 'vitest';
import {
  computeLeadSolution,
  hitProbability,
  type LeadSolution,
} from '../../src/engine/utils/FiringComputer';

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

    it('accounts for target acceleration when provided', () => {
      // Target at (100, 0) stationary but accelerating in +x at 1 km/s²
      const withAccel = computeLeadSolution(
        0, 0, 0, 0,
        100, 0, 0, 0,
        10,           // 10 km/s projectile
        undefined,
        1, 0,         // accelerating +x at 1 km/s²
      );
      const withoutAccel = computeLeadSolution(
        0, 0, 0, 0,
        100, 0, 0, 0,
        10,
      );
      expect(withAccel).not.toBeNull();
      expect(withoutAccel).not.toBeNull();
      // Accelerating target: intercept point should be further ahead
      expect(withAccel!.interceptX).toBeGreaterThan(withoutAccel!.interceptX);
      expect(withAccel!.timeToImpact).toBeGreaterThan(withoutAccel!.timeToImpact);
    });

    it('predicts accurate intercept for constant acceleration target', () => {
      // Target at (500, 0), velocity (0, 10), accelerating (0, 0) — straight line
      // vs target at (500, 0), velocity (0, 10), accelerating (0, 2) — curving
      const straight = computeLeadSolution(
        0, 0, 0, 0,
        500, 0, 0, 10,
        50,
      );
      const curving = computeLeadSolution(
        0, 0, 0, 0,
        500, 0, 0, 10,
        50,
        undefined,
        0, 2,
      );
      expect(straight).not.toBeNull();
      expect(curving).not.toBeNull();
      // Curving target's intercept Y should be further along due to acceleration
      expect(curving!.interceptY).toBeGreaterThan(straight!.interceptY);
    });

    it('with zero acceleration produces same result as without', () => {
      const without = computeLeadSolution(
        0, 0, 0, 0,
        100, 0, 5, 3,
        20,
      );
      const withZero = computeLeadSolution(
        0, 0, 0, 0,
        100, 0, 5, 3,
        20,
        undefined,
        0, 0,
      );
      expect(without).not.toBeNull();
      expect(withZero).not.toBeNull();
      expect(withZero!.interceptX).toBeCloseTo(without!.interceptX, 6);
      expect(withZero!.interceptY).toBeCloseTo(without!.interceptY, 6);
      expect(withZero!.timeToImpact).toBeCloseTo(without!.timeToImpact, 6);
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
