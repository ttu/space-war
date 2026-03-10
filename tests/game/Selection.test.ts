import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../src/engine/ecs/World';
import { applyBoxSelection } from '../../src/game/Selection';
import {
  Position,
  Ship,
  Selectable,
  COMPONENT,
} from '../../src/engine/components';

function addPlayerShip(world: WorldImpl, x: number, y: number, selected = false): string {
  const id = world.createEntity();
  world.addComponent<Position>(id, { type: 'Position', x, y, prevX: x, prevY: y });
  world.addComponent<Ship>(id, {
    type: 'Ship',
    name: 'P',
    hullClass: 'destroyer',
    faction: 'player',
    flagship: false,
  });
  world.addComponent<Selectable>(id, { type: 'Selectable', selected });
  return id;
}

function addEnemyShip(world: WorldImpl, x: number, y: number, selected = false): string {
  const id = world.createEntity();
  world.addComponent<Position>(id, { type: 'Position', x, y, prevX: x, prevY: y });
  world.addComponent<Ship>(id, {
    type: 'Ship',
    name: 'E',
    hullClass: 'frigate',
    faction: 'enemy',
    flagship: false,
  });
  world.addComponent<Selectable>(id, { type: 'Selectable', selected });
  return id;
}

describe('applyBoxSelection', () => {
  it('selects only player ships inside the world rect', () => {
    const world = new WorldImpl();
    const inside = addPlayerShip(world, 50, 50);
    const outside = addPlayerShip(world, 0, 0);
    addEnemyShip(world, 50, 50);

    applyBoxSelection(world, 10, 10, 90, 90, false);

    expect(world.getComponent<Selectable>(inside, COMPONENT.Selectable)!.selected).toBe(true);
    expect(world.getComponent<Selectable>(outside, COMPONENT.Selectable)!.selected).toBe(false);
    const enemyId = world.query(COMPONENT.Ship).find((id) => world.getComponent<Ship>(id, COMPONENT.Ship)!.faction === 'enemy')!;
    expect(world.getComponent<Selectable>(enemyId, COMPONENT.Selectable)!.selected).toBe(false);
  });

  it('deselects all player ships when not shiftKey, then selects those in rect', () => {
    const world = new WorldImpl();
    const inRect = addPlayerShip(world, 50, 50, true);
    const outRect = addPlayerShip(world, 200, 200, true);

    applyBoxSelection(world, 10, 10, 90, 90, false);

    expect(world.getComponent<Selectable>(inRect, COMPONENT.Selectable)!.selected).toBe(true);
    expect(world.getComponent<Selectable>(outRect, COMPONENT.Selectable)!.selected).toBe(false);
  });

  it('adds to selection when shiftKey is true', () => {
    const world = new WorldImpl();
    const alreadySelected = addPlayerShip(world, 200, 200, true);
    const inRect = addPlayerShip(world, 50, 50, false);

    applyBoxSelection(world, 10, 10, 90, 90, true);

    expect(world.getComponent<Selectable>(inRect, COMPONENT.Selectable)!.selected).toBe(true);
    expect(world.getComponent<Selectable>(alreadySelected, COMPONENT.Selectable)!.selected).toBe(true);
  });
});
