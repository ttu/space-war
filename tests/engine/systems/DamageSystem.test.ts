import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { DamageSystem } from '../../../src/engine/systems/DamageSystem';
import type { GameEvent } from '../../../src/engine/types';
import {
  Position, Velocity, Ship, Hull, ShipSystems, createShipSystems,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId } from '../../../src/engine/types';

function createShipWithHull(
  world: WorldImpl,
  opts: { x: number; y: number; faction: 'player' | 'enemy'; hullCurrent?: number; hullMax?: number },
): EntityId {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position',
    x: opts.x,
    y: opts.y,
    prevX: opts.x,
    prevY: opts.y,
  });
  world.addComponent(id, {
    type: 'Velocity',
    vx: 0,
    vy: 0,
  });
  world.addComponent(id, {
    type: 'Ship',
    name: 'Ship',
    hullClass: 'cruiser',
    faction: opts.faction,
    flagship: true,
  });
  const hullMax = opts.hullMax ?? 100;
  world.addComponent(id, {
    type: 'Hull',
    current: opts.hullCurrent ?? hullMax,
    max: hullMax,
    armor: 5,
  });
  return id;
}

describe('DamageSystem', () => {
  it('applies RailgunHit damage to target Hull', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new DamageSystem(eventBus);

    const targetId = createShipWithHull(world, { x: 0, y: 0, faction: 'enemy', hullCurrent: 100, hullMax: 100 });

    eventBus.emit({
      type: 'RailgunHit',
      time: 1,
      entityId: 'proj_1',
      targetId,
      data: { damage: 30, faction: 'player' as const },
    });
    system.processHitEvents(world);

    const hull = world.getComponent<Hull>(targetId, COMPONENT.Hull)!;
    // damage 30, armor 5 => effective 25, 100 - 25 = 75
    expect(hull.current).toBe(75);
  });

  it('applies MissileImpact damage to target Hull', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new DamageSystem(eventBus);

    const targetId = createShipWithHull(world, { x: 0, y: 0, faction: 'enemy', hullCurrent: 100, hullMax: 100 });

    eventBus.emit({
      type: 'MissileImpact',
      time: 1,
      entityId: 'missile_1',
      targetId,
      data: { missileCount: 4, faction: 'player' as const },
    });
    system.processHitEvents(world);

    const hull = world.getComponent<Hull>(targetId, COMPONENT.Hull)!;
    // 4 missiles * 15 = 60 damage, armor 5 => 55 effective, 100 - 55 = 45
    expect(hull.current).toBe(45);
  });

  it('emits ShipDestroyed and removes entity when Hull reaches zero', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new DamageSystem(eventBus);

    const targetId = createShipWithHull(world, { x: 0, y: 0, faction: 'enemy', hullCurrent: 10, hullMax: 100 });

    const destroyed: GameEvent[] = [];
    eventBus.subscribe('ShipDestroyed', (e) => destroyed.push(e));

    eventBus.emit({
      type: 'RailgunHit',
      time: 1,
      entityId: 'proj_1',
      targetId,
      data: { damage: 50, faction: 'player' as const },
    });
    system.processHitEvents(world);

    expect(destroyed.length).toBe(1);
    expect(destroyed[0].targetId).toBe(targetId);
    expect(world.getAllEntities().includes(targetId)).toBe(false);
  });

  it('does nothing if target has no Hull component', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new DamageSystem(eventBus);

    const targetId = world.createEntity();
    world.addComponent(targetId, {
      type: 'Position',
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
    });
    world.addComponent(targetId, {
      type: 'Ship',
      name: 'Ship',
      hullClass: 'cruiser',
      faction: 'enemy',
      flagship: true,
    });

    eventBus.emit({
      type: 'RailgunHit',
      time: 1,
      entityId: 'proj_1',
      targetId,
      data: { damage: 50, faction: 'player' as const },
    });
    system.processHitEvents(world);

    expect(world.hasComponent(targetId, COMPONENT.Hull)).toBe(false);
    expect(world.getAllEntities().includes(targetId)).toBe(true);
  });
});
