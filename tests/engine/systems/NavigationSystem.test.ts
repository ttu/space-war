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
  destinationX?: number; destinationY?: number;
  waypoints?: { x: number; y: number }[];
  phase?: NavigationOrder['phase'];
  burnDirection?: number; flipAngle?: number;
  accelTime?: number; decelTime?: number;
  currentAngle?: number;
}) {
  const id = world.createEntity();
  const targetX = opts.targetX ?? 10000;
  const targetY = opts.targetY ?? 0;
  const destinationX = opts.destinationX ?? targetX;
  const destinationY = opts.destinationY ?? targetY;
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
    destinationX,
    destinationY,
    targetX,
    targetY,
    waypoints: opts.waypoints ?? [],
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

  it('decelerates when approaching target too fast', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship moving toward target fast, close enough that it needs to slow down
    // distance=500, speed=10, maxApproachSpeed = sqrt(2*0.1*500) = 10
    // Ship is at the braking point — thrust should be roughly retrograde
    const id = createShipWithNav(world, {
      phase: 'decelerating',
      px: 9500, py: 0,
      vx: 15, vy: 0,
      targetX: 10000, targetY: 0,
      maxThrust: 0.1,
      currentAngle: Math.PI,
    });

    system.update(world, 1, 10);

    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    expect(thruster.throttle).toBe(1);
    // PN guidance: desired speed < current speed, so thrust has a retrograde component
    // The exact angle depends on PN calculation, but thrust should be roughly opposite to velocity
    const thrustDirX = Math.cos(thruster.thrustAngle);
    expect(thrustDirX).toBeLessThan(0); // thrusting in -x direction to slow down
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

  it('switches to decelerating phase when too fast for remaining distance', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship close to target with high velocity — needs to decelerate
    const id = createShipWithNav(world, {
      phase: 'accelerating',
      px: 9500, py: 0,
      vx: 15, vy: 0,
      targetX: 10000, targetY: 0,
      maxThrust: 0.1,
      currentAngle: Math.PI,
    });

    // distance=500, speed=15, maxApproachSpeed=sqrt(2*0.1*~500)≈10
    // Current speed > max approach speed → PN guidance computes retrograde thrust → decelerating phase
    system.update(world, 1, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
    expect(nav.phase).toBe('decelerating');
  });

  it('on arrival at waypoint, advances target to destination', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship at waypoint (1000, 0), destination (10000, 0); close to waypoint and slow → "arrived" at waypoint
    const id = createShipWithNav(world, {
      px: 1005,
      py: 0,
      vx: 0,
      vy: 0,
      targetX: 1000,
      targetY: 0,
      destinationX: 10000,
      destinationY: 0,
      phase: 'decelerating',
      currentAngle: Math.PI,
    });

    system.update(world, 1, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    expect(nav!.targetX).toBe(10000);
    expect(nav!.targetY).toBe(0);
    expect(nav!.destinationX).toBe(10000);
    expect(nav!.destinationY).toBe(0);
  });

  it('removes NavigationOrder on arrival with no waypoints', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship at destination, slow, no waypoints
    const id = createShipWithNav(world, {
      px: 9990, py: 0,
      vx: 0.01, vy: 0,
      targetX: 10000, targetY: 0,
      destinationX: 10000, destinationY: 0,
      waypoints: [],
      phase: 'decelerating',
    });

    system.update(world, 1, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeUndefined();
    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    expect(thruster.throttle).toBe(0);
  });

  it('advances to next waypoint when waypoints exist', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship at destination (10000, 0), with one waypoint queued
    const id = createShipWithNav(world, {
      px: 9990, py: 0,
      vx: 0.01, vy: 0,
      targetX: 10000, targetY: 0,
      destinationX: 10000, destinationY: 0,
      waypoints: [{ x: 20000, y: 5000 }],
      phase: 'decelerating',
    });

    system.update(world, 1, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    // Should have shifted the waypoint to become the new destination
    expect(nav!.destinationX).toBe(20000);
    expect(nav!.destinationY).toBe(5000);
    expect(nav!.targetX).toBe(20000);
    expect(nav!.targetY).toBe(5000);
    expect(nav!.waypoints).toHaveLength(0);
    expect(nav!.phase).toBe('accelerating');
  });

  it('advances through multiple waypoints sequentially', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    // Ship at destination with two waypoints queued
    const id = createShipWithNav(world, {
      px: 9990, py: 0,
      vx: 0.01, vy: 0,
      targetX: 10000, targetY: 0,
      destinationX: 10000, destinationY: 0,
      waypoints: [{ x: 20000, y: 5000 }, { x: 30000, y: 10000 }],
      phase: 'decelerating',
    });

    system.update(world, 1, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    // First waypoint becomes destination
    expect(nav!.destinationX).toBe(20000);
    expect(nav!.destinationY).toBe(5000);
    // Second waypoint still queued
    expect(nav!.waypoints).toHaveLength(1);
    expect(nav!.waypoints[0]).toEqual({ x: 30000, y: 10000 });
  });
});
