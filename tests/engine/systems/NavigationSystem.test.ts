import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { NavigationSystem } from '../../../src/engine/systems/NavigationSystem';
import {
  Position, Velocity, Thruster, NavigationOrder, RotationState, COMPONENT,
} from '../../../src/engine/components';

function createShipWithNav(world: WorldImpl, opts: {
  px?: number; py?: number; vx?: number; vy?: number;
  maxThrust?: number; rotationSpeed?: number;
  targetX?: number; targetY?: number;
  phase?: NavigationOrder['phase'];
  burnDirection?: number; flipAngle?: number;
  accelTime?: number; decelTime?: number;
  currentAngle?: number;
}) {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.px ?? 0, y: opts.py ?? 0, prevX: 0, prevY: 0,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Thruster>(id, {
    type: 'Thruster',
    maxThrust: opts.maxThrust ?? 0.1,
    thrustAngle: 0,
    throttle: 0,
    rotationSpeed: opts.rotationSpeed ?? 1.0,
  });
  world.addComponent<NavigationOrder>(id, {
    type: 'NavigationOrder',
    targetX: opts.targetX ?? 10000,
    targetY: opts.targetY ?? 0,
    phase: opts.phase ?? 'rotating',
    burnPlan: {
      accelTime: opts.accelTime ?? 100,
      coastTime: 0,
      decelTime: opts.decelTime ?? 100,
      totalTime: (opts.accelTime ?? 100) + (opts.decelTime ?? 100),
      burnDirection: opts.burnDirection ?? 0,
      flipAngle: opts.flipAngle ?? Math.PI,
    },
    phaseStartTime: 0,
    arrivalThreshold: 100,
  });
  world.addComponent<RotationState>(id, {
    type: 'RotationState',
    currentAngle: opts.currentAngle ?? 0,
    targetAngle: opts.burnDirection ?? 0,
    rotating: false,
  });
  return id;
}

describe('NavigationSystem', () => {
  it('sets throttle during acceleration phase', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, { phase: 'accelerating' });

    system.update(world, 1, 10);

    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    expect(thruster.throttle).toBe(1);
    expect(thruster.thrustAngle).toBe(0); // burnDirection
  });

  it('thrusts retrograde during deceleration', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship moving toward target at +x, should thrust in -x (retrograde)
    const id = createShipWithNav(world, {
      phase: 'decelerating',
      vx: 5, vy: 0,
      targetX: 10000, targetY: 0,
    });

    system.update(world, 1, 10);

    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    expect(thruster.throttle).toBe(1);
    expect(thruster.thrustAngle).toBeCloseTo(Math.PI); // opposite to velocity
  });

  it('stops thrust when arrived', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, {
      px: 9990, py: 0,
      targetX: 10000, targetY: 0,
      phase: 'decelerating',
      vx: 0.01, vy: 0,
    });

    system.update(world, 1, 10);

    // Should detect arrival (within threshold) and stop
    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    // NavigationOrder should be removed when arrived
    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    if (!nav) {
      expect(thruster.throttle).toBe(0);
    } else {
      expect(nav.phase).toBe('arrived');
    }
  });

  it('rotates ship toward target direction before accelerating', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Target is above ship — burn direction should be recalculated to PI/2
    const id = createShipWithNav(world, {
      phase: 'rotating',
      targetX: 0, targetY: 10000,
      currentAngle: 0,
      rotationSpeed: 1.0,
    });

    system.update(world, 0.5, 5);

    const rot = world.getComponent<RotationState>(id, COMPONENT.RotationState)!;
    // Should have rotated 0.5 radians toward PI/2 (direction to target)
    expect(rot.currentAngle).toBeCloseTo(0.5);
    expect(rot.rotating).toBe(true);
  });

  it('transitions from rotating to accelerating when aligned', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, {
      phase: 'rotating',
      burnDirection: 0.05,
      currentAngle: 0,
      rotationSpeed: 1.0,
    });

    // With rotation speed 1.0 and dt 1.0, ship rotates 1 radian
    // Target is only 0.05 radians away — should snap and transition
    system.update(world, 1.0, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
    expect(nav.phase).toBe('accelerating');
  });

  it('transitions from accelerating to flipping when stopping distance exceeds remaining', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship close to target with high velocity — stopping distance > remaining distance
    const id = createShipWithNav(world, {
      phase: 'accelerating',
      px: 9500, py: 0,
      vx: 10, vy: 0,
      targetX: 10000, targetY: 0,
      maxThrust: 0.1,
    });

    // distance=500, speed=10, stoppingDist = 10²/(2*0.1) = 500
    // With FLIP_MARGIN (1.15): 500*1.15=575 >= 500 → should flip
    system.update(world, 1, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
    expect(nav.phase).toBe('flipping');
  });
});
