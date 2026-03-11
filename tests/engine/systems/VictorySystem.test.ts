import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { VictorySystem } from '../../../src/engine/systems/VictorySystem';
import type { GameEvent } from '../../../src/engine/types';
import { Position, Ship, COMPONENT } from '../../../src/engine/components';
import { EntityId } from '../../../src/engine/types';

function addShip(
  world: WorldImpl,
  opts: { x: number; y: number; faction: 'player' | 'enemy' | 'neutral' },
): EntityId {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position',
    x: opts.x,
    y: opts.y,
    prevX: opts.x,
    prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'Ship',
    name: 'S',
    hullClass: 'cruiser',
    faction: opts.faction,
    flagship: true,
  } as Ship);
  return id;
}

describe('VictorySystem', () => {
  it('emits VictoryAchieved once when no enemy ships and at least one player ship', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new VictorySystem(eventBus);

    addShip(world, { x: 0, y: 0, faction: 'player' });
    // No enemy ships

    const events: GameEvent[] = [];
    eventBus.subscribe('VictoryAchieved', (e) => events.push(e));

    system.update(world, 1);
    system.update(world, 2);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('VictoryAchieved');
  });

  it('emits DefeatSuffered once when no player ships', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new VictorySystem(eventBus);

    addShip(world, { x: 0, y: 0, faction: 'enemy' });
    // No player ships

    const events: GameEvent[] = [];
    eventBus.subscribe('DefeatSuffered', (e) => events.push(e));

    system.update(world, 1);
    system.update(world, 2);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('DefeatSuffered');
  });

  it('emits nothing when both player and enemy have ships', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new VictorySystem(eventBus);

    addShip(world, { x: 0, y: 0, faction: 'player' });
    addShip(world, { x: 100, y: 100, faction: 'enemy' });

    const victory: GameEvent[] = [];
    const defeat: GameEvent[] = [];
    eventBus.subscribe('VictoryAchieved', (e) => victory.push(e));
    eventBus.subscribe('DefeatSuffered', (e) => defeat.push(e));

    system.update(world, 1);
    system.update(world, 2);

    expect(victory.length).toBe(0);
    expect(defeat.length).toBe(0);
  });

  it('emits DefeatSuffered when both player and enemy have zero ships (mutual wipe)', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new VictorySystem(eventBus);

    // No ships at all

    const defeat: GameEvent[] = [];
    eventBus.subscribe('DefeatSuffered', (e) => defeat.push(e));

    system.update(world, 1);

    expect(defeat.length).toBe(1);
  });

  it('reset() allows victory to be emitted again after new scenario load', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new VictorySystem(eventBus);

    addShip(world, { x: 0, y: 0, faction: 'player' });

    const events: GameEvent[] = [];
    eventBus.subscribe('VictoryAchieved', (e) => events.push(e));

    system.update(world, 1);
    expect(events.length).toBe(1);

    system.reset();
    world.clear();
    addShip(world, { x: 0, y: 0, faction: 'player' });
    system.update(world, 2);

    expect(events.length).toBe(2);
  });

  it('ignores neutral faction ships for victory/defeat', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new VictorySystem(eventBus);

    addShip(world, { x: 0, y: 0, faction: 'neutral' });
    // No player ships -> defeat; no enemy ships but also no player -> defeat

    const defeat: GameEvent[] = [];
    eventBus.subscribe('DefeatSuffered', (e) => defeat.push(e));

    system.update(world, 1);

    expect(defeat.length).toBe(1);
  });
});
