import { describe, it, expect } from 'vitest';
import { NavigationOrder, RotationState, COMPONENT } from '../../../src/engine/components';

describe('Navigation Components', () => {
  it('NavigationOrder has correct structure', () => {
    const order: NavigationOrder = {
      type: 'NavigationOrder',
      destinationX: 100,
      destinationY: 200,
      targetX: 100,
      targetY: 200,
      waypoints: [],
      phase: 'rotating',
      burnPlan: {
        accelTime: 50,
        coastTime: 0,
        decelTime: 50,
        totalTime: 100,
        flipAngle: Math.PI,
        burnDirection: 0.5,
      },
      phaseStartTime: 0,
      arrivalThreshold: 100,
    };
    expect(order.type).toBe('NavigationOrder');
    expect(order.phase).toBe('rotating');
  });

  it('RotationState has correct structure', () => {
    const rot: RotationState = {
      type: 'RotationState',
      currentAngle: 0,
      targetAngle: Math.PI,
      rotating: true,
    };
    expect(rot.type).toBe('RotationState');
    expect(rot.rotating).toBe(true);
  });

  it('COMPONENT constants include new components', () => {
    expect(COMPONENT.NavigationOrder).toBe('NavigationOrder');
    expect(COMPONENT.RotationState).toBe('RotationState');
  });
});
