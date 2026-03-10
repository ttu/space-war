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
  });
  return id;
}

function createProjectile(
  world: WorldImpl,
  opts: {
    x: number; y: number; vx: number; vy: number;
    shooterId: EntityId; targetId: EntityId; faction: 'player' | 'enemy';
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
  });
  return id;
}

describe('RailgunSystem', () => {
  it('moves projectiles by velocity each tick', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new RailgunSystem(eventBus);

    const shooterId = createShipWithRailgun(world, { x: 0, y: 0, faction: 'player' });
    const targetId = createShip(world, { x: 1000, y: 0, faction: 'enemy' });
    const projId = createProjectile(world, {
      x: 0, y: 0, vx: 100, vy: 0,
      shooterId: targetId, targetId, faction: 'player',
    });

    system.update(world, 0.1, 1.0);

    const pos = world.getComponent<Position>(projId, COMPONENT.Position)!;
    expect(pos.x).toBeCloseTo(10);
    expect(pos.y).toBeCloseTo(0);
  });

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

  it('does not hit when projectile is beyond hitRadius of target', () => {
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

    const pos = world.getComponent<Position>(projId, COMPONENT.Position)!;
    expect(pos.x).toBeCloseTo(60);
    expect(world.getAllEntities().includes(projId)).toBe(true);
  });
});
