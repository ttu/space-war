import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { CollisionSystem } from '../../../src/engine/systems/CollisionSystem';
import type { GameEvent } from '../../../src/engine/types';
import {
  Position, Velocity, Hull, Ship, CelestialBody, COMPONENT,
} from '../../../src/engine/components';
import type { Missile, Projectile } from '../../../src/engine/components';

function createPlanet(
  world: WorldImpl,
  opts: { x: number; y: number; mass: number; radius: number; name?: string },
) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'CelestialBody', name: opts.name ?? 'Planet', mass: opts.mass,
    radius: opts.radius, bodyType: 'planet',
  } as CelestialBody);
  return id;
}

function createShip(
  world: WorldImpl,
  opts: { x: number; y: number; hullCurrent?: number },
) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'Velocity', vx: 0, vy: 0,
  } as Velocity);
  world.addComponent(id, {
    type: 'Ship', name: 'TestShip', hullClass: 'frigate', faction: 'player', flagship: false,
  } as Ship);
  world.addComponent(id, {
    type: 'Hull', current: opts.hullCurrent ?? 100, max: 100, armor: 0,
  } as Hull);
  return id;
}

function createMissile(world: WorldImpl, opts: { x: number; y: number }) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'Velocity', vx: 0, vy: 0,
  } as Velocity);
  world.addComponent(id, {
    type: 'Missile', targetId: 'dummy', fuel: 100, maxFuel: 100,
    acceleration: 0.1, guidanceMode: 'sensor', seekerRange: 1000,
    seekerSensitivity: 1, salvoId: 's1', faction: 'player', detonationRange: 1,
    launchTime: 0,
  } as Missile);
  return id;
}

function createProjectile(world: WorldImpl, opts: { x: number; y: number }) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'Velocity', vx: 0, vy: 0,
  } as Velocity);
  world.addComponent(id, {
    type: 'Projectile', shooterId: '', targetId: '', hitRadius: 0.5,
    damage: 30, faction: 'player',
    spawnX: opts.x, spawnY: opts.y, maxRange: 10_000,
  } as Projectile);
  return id;
}

describe('CollisionSystem', () => {
  it('destroys ship inside planet radius', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const shipId = createShip(world, { x: 3000, y: 0 }); // inside radius

    system.update(world);

    expect(world.getAllEntities().includes(shipId)).toBe(false);
  });

  it('emits CelestialCollision event on ship destruction', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    const events: GameEvent[] = [];
    eventBus.subscribe('CelestialCollision', (e) => events.push(e));

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371, name: 'Terra' });
    createShip(world, { x: 3000, y: 0 });

    system.update(world);

    expect(events.length).toBe(1);
    expect(events[0].data.bodyName).toBe('Terra');
  });

  it('damages ship in danger zone (between radius and 1.5x radius)', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const shipId = createShip(world, { x: 6371 * 1.25, y: 0, hullCurrent: 100 });

    system.update(world);

    expect(world.getAllEntities().includes(shipId)).toBe(true);
    const hull = world.getComponent<Hull>(shipId, COMPONENT.Hull)!;
    expect(hull.current).toBeLessThan(100);
  });

  it('does not affect ship outside danger zone', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const shipId = createShip(world, { x: 6371 * 2, y: 0 });

    system.update(world);

    expect(world.getAllEntities().includes(shipId)).toBe(true);
    const hull = world.getComponent<Hull>(shipId, COMPONENT.Hull)!;
    expect(hull.current).toBe(100);
  });

  it('destroys missile inside danger zone', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const missileId = createMissile(world, { x: 6371 * 1.5, y: 0 });

    system.update(world);

    expect(world.getAllEntities().includes(missileId)).toBe(false);
  });

  it('destroys projectile inside danger zone', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const projId = createProjectile(world, { x: 6371 * 1.5, y: 0 });

    system.update(world);

    expect(world.getAllEntities().includes(projId)).toBe(false);
  });

  it('does not destroy celestial bodies', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    const planetId = createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const moonId = createPlanet(world, { x: 3000, y: 0, mass: 1e22, radius: 1737 });

    system.update(world);

    expect(world.getAllEntities().includes(planetId)).toBe(true);
    expect(world.getAllEntities().includes(moonId)).toBe(true);
  });

  it('destroys ship with low hull on surface contact', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    const events: GameEvent[] = [];
    eventBus.subscribe('CelestialCollision', (e) => events.push(e));

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const shipId = createShip(world, { x: 1000, y: 0, hullCurrent: 5 });

    system.update(world);

    expect(world.getAllEntities().includes(shipId)).toBe(false);
  });
});
