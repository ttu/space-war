import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { RailgunSystem } from '../../../src/engine/systems/RailgunSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import {
  Position, Velocity, Ship, Railgun, Projectile, Facing,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId } from '../../../src/engine/types';

function createShip(
  world: WorldImpl,
  opts: { x: number; y: number; vx?: number; vy?: number; faction: 'player' | 'enemy' },
): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Ship', hullClass: 'cruiser', faction: opts.faction, flagship: true,
  });
  return id;
}

function createShipWithRailgun(
  world: WorldImpl,
  opts: { x: number; y: number; faction: 'player' | 'enemy'; projectileSpeed?: number },
): EntityId {
  const id = createShip(world, opts);
  world.addComponent<Railgun>(id, {
    type: 'Railgun',
    projectileSpeed: opts.projectileSpeed ?? 100,
    maxRange: 10_000,
    reloadTime: 2,
    lastFiredTime: 0,
    damage: 50,
    ammo: 50,
    maxAmmo: 50,
  });
  return id;
}

function createProjectile(
  world: WorldImpl,
  opts: {
    x: number; y: number; vx: number; vy: number;
    shooterId: EntityId; targetId: EntityId; faction: 'player' | 'enemy';
    maxRange?: number;
  },
): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, { type: 'Velocity', vx: opts.vx, vy: opts.vy });
  world.addComponent<Projectile>(id, {
    type: 'Projectile',
    shooterId: opts.shooterId,
    targetId: opts.targetId,
    faction: opts.faction,
    damage: 50,
    hitRadius: 0.5,
    spawnX: opts.x,
    spawnY: opts.y,
    maxRange: opts.maxRange ?? 20_000,
  });
  return id;
}

describe('RailgunSystem', () => {
  it('removes projectile and emits RailgunHit when within hitRadius of target', () => {
    const world = new WorldImpl();
    const events: { type: string; targetId?: EntityId }[] = [];
    const eventBus = new EventBusImpl();
    eventBus.subscribe('RailgunHit', (e) => events.push({ type: e.type, targetId: e.targetId }));

    const system = new RailgunSystem(eventBus);
    const shooterId = createShipWithRailgun(world, { x: 0, y: 0, faction: 'player' });
    const targetId = createShip(world, { x: 10, y: 0, faction: 'enemy' });
    const projId = createProjectile(world, {
      x: 10.2, y: 0, vx: -5, vy: 0,
      shooterId, targetId, faction: 'player',
    });

    system.update(world, 0.1, 1.0);

    expect(world.getAllEntities().includes(projId)).toBe(false);
    expect(events.some((e) => e.type === 'RailgunHit' && e.targetId === targetId)).toBe(true);
  });

  it('does not hit when projectile is still approaching target', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new RailgunSystem(eventBus);

    const shooterId = createShipWithRailgun(world, { x: 0, y: 0, faction: 'player' });
    const targetId = createShip(world, { x: 100, y: 0, faction: 'enemy' });
    const projId = createProjectile(world, {
      x: 50, y: 0, vx: 100, vy: 0,
      shooterId, targetId, faction: 'player',
    });

    system.update(world, 0.1, 1.0);

    expect(world.getAllEntities().includes(projId)).toBe(true);
  });

  it('removes projectile when target is destroyed', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new RailgunSystem(eventBus);

    const shooterId = createShipWithRailgun(world, { x: 0, y: 0, faction: 'player' });
    const targetId = 'nonexistent' as EntityId;
    const projId = createProjectile(world, {
      x: 50, y: 0, vx: 100, vy: 0,
      shooterId, targetId, faction: 'player',
    });

    system.update(world, 0.1, 1.0);

    expect(world.getAllEntities().includes(projId)).toBe(false);
  });

  it('removes projectile when max range exceeded', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new RailgunSystem(eventBus);

    const shooterId = createShipWithRailgun(world, { x: 0, y: 0, faction: 'player' });
    const targetId = createShip(world, { x: 10000, y: 0, faction: 'enemy' });
    // Projectile spawned at origin, now at 150 — maxRange is 100
    const projId = createProjectile(world, {
      x: 150, y: 0, vx: 100, vy: 0,
      shooterId, targetId, faction: 'player',
      maxRange: 100,
    });
    // Override spawnX to simulate the projectile having traveled from the origin
    world.getComponent<Projectile>(projId, COMPONENT.Projectile)!.spawnX = 0;

    system.update(world, 0.1, 1.0);

    expect(world.getAllEntities().includes(projId)).toBe(false);
  });
});
