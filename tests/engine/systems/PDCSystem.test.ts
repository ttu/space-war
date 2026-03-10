import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { PDCSystem } from '../../../src/engine/systems/PDCSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import {
  Position, Velocity, Ship, Missile, PDC, Facing, ThermalSignature,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId } from '../../../src/engine/types';

function createShipWithPDC(
  world: WorldImpl,
  opts: { x: number; y: number; faction: 'player' | 'enemy'; pdcRange?: number },
): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, { type: 'Velocity', vx: 0, vy: 0 });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Defender', hullClass: 'cruiser', faction: opts.faction, flagship: true,
  });
  world.addComponent<PDC>(id, {
    type: 'PDC',
    range: opts.pdcRange ?? 5,
    fireRate: 100,
    lastFiredTime: 0,
    damagePerHit: 1,
  });
  return id;
}

function createMissile(
  world: WorldImpl,
  opts: {
    x: number; y: number;
    targetId: EntityId;
    faction: 'player' | 'enemy';
    count?: number;
  },
): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, { type: 'Velocity', vx: 0, vy: 0 });
  world.addComponent<Facing>(id, { type: 'Facing', angle: 0 });
  world.addComponent<ThermalSignature>(id, {
    type: 'ThermalSignature', baseSignature: 100, thrustMultiplier: 500,
  });
  world.addComponent<Missile>(id, {
    type: 'Missile',
    targetId: opts.targetId,
    launcherFaction: opts.faction,
    count: opts.count ?? 3,
    fuel: 60,
    accel: 0.5,
    seekerRange: 5_000,
    seekerSensitivity: 1e-8,
    guidanceMode: 'sensor',
    armed: true,
    armingDistance: 5,
  });
  return id;
}

describe('PDCSystem', () => {
  it('decrements missile count when PDC engages hostile missile in range', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new PDCSystem(eventBus);

    const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
    const missileId = createMissile(world, {
      x: 3, y: 0, targetId: defenderId, faction: 'enemy', count: 5,
    });

    system.update(world, 0.1, 1.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile);
    expect(missile).toBeDefined();
    expect(missile!.count).toBeLessThan(5);
  });

  it('removes missile entity when count reaches zero and emits MissileIntercepted', () => {
    const world = new WorldImpl();
    const events: { type: string; targetId?: EntityId }[] = [];
    const eventBus = new EventBusImpl();
    eventBus.subscribe('MissileIntercepted', (e) => events.push({ type: e.type, targetId: e.targetId }));

    const system = new PDCSystem(eventBus);
    const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
    const missileId = createMissile(world, {
      x: 2, y: 0, targetId: defenderId, faction: 'enemy', count: 1,
    });

    system.update(world, 1.0, 1.0);

    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(false);
    expect(events.some((e) => e.type === 'MissileIntercepted')).toBe(true);
  });

  it('does not engage missiles that are friendly (same faction as PDC ship)', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new PDCSystem(eventBus);

    const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
    const missileId = createMissile(world, {
      x: 3, y: 0, targetId: defenderId, faction: 'player', count: 2,
    });

    system.update(world, 0.5, 1.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.count).toBe(2);
  });

  it('does not engage missiles outside PDC range', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new PDCSystem(eventBus);

    createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 5 });
    const missileId = createMissile(world, {
      x: 100, y: 0, targetId: 'dummy', faction: 'enemy', count: 2,
    });

    system.update(world, 0.5, 1.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.count).toBe(2);
  });
});
