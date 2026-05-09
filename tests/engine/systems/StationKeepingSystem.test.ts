import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl as World } from '../../../src/engine/ecs/World';
import { StationKeepingSystem } from '../../../src/engine/systems/StationKeepingSystem';
import {
  COMPONENT, Position, Velocity, Thruster, Ship, CelestialBody,
  StationKeeping, NavigationOrder,
} from '../../../src/engine/components';

const dt = 0.1;

function addBody(world: World, x: number, y: number, vx: number, vy: number, bodyType: CelestialBody['bodyType'] = 'planet') {
  const id = world.createEntity();
  world.addComponent(id, { type: 'Position', x, y, prevX: x - vx * dt, prevY: y - vy * dt } as Position);
  world.addComponent(id, { type: 'Velocity', vx, vy } as Velocity);
  world.addComponent(id, { type: 'CelestialBody', name: 'B', mass: 1e24, radius: 1000, bodyType } as CelestialBody);
  return id;
}

function addShip(world: World, x: number, y: number, vx: number, vy: number, opts: { enabled?: boolean; nav?: boolean } = {}) {
  const id = world.createEntity();
  world.addComponent(id, { type: 'Position', x, y, prevX: x - vx * dt, prevY: y - vy * dt } as Position);
  world.addComponent(id, { type: 'Velocity', vx, vy } as Velocity);
  world.addComponent(id, { type: 'Thruster', maxThrust: 0.05, thrustAngle: 0, throttle: 0.5, rotationSpeed: 1 } as Thruster);
  world.addComponent(id, { type: 'Ship', name: 'S', hullClass: 'Corvette', faction: 'player', flagship: false } as Ship);
  world.addComponent(id, { type: 'StationKeeping', enabled: opts.enabled ?? true } as StationKeeping);
  if (opts.nav) {
    world.addComponent(id, {
      type: 'NavigationOrder',
      destinationX: 0, destinationY: 0, targetX: 0, targetY: 0, waypoints: [],
      phase: 'accelerating',
      burnPlan: { accelTime: 1, coastTime: 0, decelTime: 1, totalTime: 2, flipAngle: 0, burnDirection: 0 },
      phaseStartTime: 0, arrivalThreshold: 1,
    } as NavigationOrder);
  }
  return id;
}

describe('StationKeepingSystem', () => {
  let world: World;
  let sys: StationKeepingSystem;

  beforeEach(() => {
    world = new World();
    sys = new StationKeepingSystem();
  });

  it('matches anchor body velocity for an idle ship near a planet', () => {
    addBody(world, 1000, 0, 5, 0);
    const shipId = addShip(world, 1100, 0, 0, 0);

    sys.update(world, dt);

    const v = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    expect(v.vx).toBeCloseTo(5, 5);
    expect(v.vy).toBeCloseTo(0, 5);
  });

  it('co-moves position by the same delta as the anchor body', () => {
    addBody(world, 1000, 0, 50, 0);
    const shipId = addShip(world, 1100, 50, 0, 0);
    const before = { ...world.getComponent<Position>(shipId, COMPONENT.Position)! };

    sys.update(world, dt);

    const p = world.getComponent<Position>(shipId, COMPONENT.Position)!;
    // Body delta this tick: pos - prevPos = (1000 - 995, 0 - 0) = (5, 0)
    expect(p.x - before.prevX).toBeCloseTo(5, 5);
    expect(p.y - before.prevY).toBeCloseTo(0, 5);
  });

  it('does nothing when ship has an active NavigationOrder', () => {
    addBody(world, 1000, 0, 5, 0);
    const shipId = addShip(world, 1100, 0, 0, 0, { nav: true });

    sys.update(world, dt);

    const v = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    expect(v.vx).toBe(0);
    expect(v.vy).toBe(0);
  });

  it('does nothing when StationKeeping is disabled', () => {
    addBody(world, 1000, 0, 5, 0);
    const shipId = addShip(world, 1100, 0, 0, 0, { enabled: false });

    sys.update(world, dt);

    const v = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    expect(v.vx).toBe(0);
    expect(v.vy).toBe(0);
  });

  it('anchors to the nearest planet/moon, not a far-away body', () => {
    addBody(world, 1000, 0, 5, 0, 'planet');
    addBody(world, 0, 0, 99, 0, 'planet');
    const shipId = addShip(world, 1100, 0, 0, 0);

    sys.update(world, dt);

    const v = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    expect(v.vx).toBeCloseTo(5, 5);
  });

  it('falls back to the star when no planet/moon is reasonably close', () => {
    addBody(world, 0, 0, 7, 0, 'star');
    addBody(world, 1_000_000, 0, 999, 0, 'planet');
    const shipId = addShip(world, 1000, 0, 0, 0);

    sys.update(world, dt);

    const v = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    expect(v.vx).toBeCloseTo(7, 5);
  });

  it('zeros throttle for station-keeping ships', () => {
    addBody(world, 1000, 0, 5, 0);
    const shipId = addShip(world, 1100, 0, 0, 0);

    sys.update(world, dt);

    const t = world.getComponent<Thruster>(shipId, COMPONENT.Thruster)!;
    expect(t.throttle).toBe(0);
  });

  it('does nothing if there are no celestial bodies', () => {
    const shipId = addShip(world, 1100, 0, 3, 4);
    sys.update(world, dt);
    const v = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    expect(v.vx).toBe(3);
    expect(v.vy).toBe(4);
  });
});
