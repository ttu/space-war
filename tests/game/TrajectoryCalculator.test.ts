import { describe, it, expect } from 'vitest';
import {
  computeBurnPlan,
  angleBetweenPoints,
  normalizeAngle,
  shortestAngleDelta,
} from '../../src/game/TrajectoryCalculator';

describe('TrajectoryCalculator', () => {
  describe('normalizeAngle', () => {
    it('wraps angles to [0, 2π)', () => {
      expect(normalizeAngle(0)).toBeCloseTo(0);
      expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
      expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5);
    });
  });

  describe('shortestAngleDelta', () => {
    it('returns shortest rotation from current to target', () => {
      // 0 to PI/2 → positive (counterclockwise)
      expect(shortestAngleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
      // 0 to -PI/2 (= 3PI/2) → negative (clockwise)
      expect(shortestAngleDelta(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
      // PI to 0 → negative
      expect(shortestAngleDelta(Math.PI, 0)).toBeCloseTo(-Math.PI);
    });
  });

  describe('angleBetweenPoints', () => {
    it('calculates angle from origin to target', () => {
      expect(angleBetweenPoints(0, 0, 100, 0)).toBeCloseTo(0);
      expect(angleBetweenPoints(0, 0, 0, 100)).toBeCloseTo(Math.PI / 2);
      expect(angleBetweenPoints(0, 0, -100, 0)).toBeCloseTo(Math.PI);
    });
  });

  describe('computeBurnPlan', () => {
    it('computes brachistochrone for stationary ship', () => {
      const plan = computeBurnPlan(
        0, 0,     // ship position
        0, 0,     // ship velocity (stationary)
        10000, 0, // target position (10,000 km away)
        0.1,      // maxAccel 0.1 km/s²
      );

      // d = 10000 km, a = 0.1 km/s²
      // Half distance = 5000, t_half = sqrt(2*5000/0.1) = sqrt(100000) ≈ 316.2s
      // Total ≈ 632.5s
      expect(plan.accelTime).toBeCloseTo(316.23, 0);
      expect(plan.decelTime).toBeCloseTo(316.23, 0);
      expect(plan.coastTime).toBe(0);
      expect(plan.totalTime).toBeCloseTo(632.46, 0);
      expect(plan.burnDirection).toBeCloseTo(0); // thrust toward target
      expect(plan.flipAngle).toBeCloseTo(Math.PI); // flip 180° to decel
    });

    it('accounts for existing velocity toward target', () => {
      const plan = computeBurnPlan(
        0, 0,
        1, 0,     // already moving toward target at 1 km/s
        10000, 0,
        0.1,
      );
      // Should need less total time since already moving toward target
      const stationaryPlan = computeBurnPlan(0, 0, 0, 0, 10000, 0, 0.1);
      expect(plan.totalTime).toBeLessThan(stationaryPlan.totalTime);
    });

    it('handles ship moving away from target', () => {
      const plan = computeBurnPlan(
        0, 0,
        -5, 0,    // moving away from target at 5 km/s
        10000, 0,
        0.1,
      );
      // Should need more total time to first cancel velocity then approach
      const stationaryPlan = computeBurnPlan(0, 0, 0, 0, 10000, 0, 0.1);
      expect(plan.totalTime).toBeGreaterThan(stationaryPlan.totalTime);
    });

    it('returns minimal plan for very close target', () => {
      const plan = computeBurnPlan(0, 0, 0, 0, 10, 0, 0.1);
      expect(plan.totalTime).toBeGreaterThan(0);
      expect(plan.accelTime).toBeGreaterThan(0);
    });
  });
});
