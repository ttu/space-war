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
  it('selects player and enemy ships inside the world rect', () => {
    const world = new WorldImpl();
    const playerInside = addPlayerShip(world, 50, 50);
    const playerOutside = addPlayerShip(world, 0, 0);
    const enemyInside = addEnemyShip(world, 50, 50);

    applyBoxSelection(world, 10, 10, 90, 90, false);

    expect(world.getComponent<Selectable>(playerInside, COMPONENT.Selectable)!.selected).toBe(true);
    expect(world.getComponent<Selectable>(playerOutside, COMPONENT.Selectable)!.selected).toBe(false);
    expect(world.getComponent<Selectable>(enemyInside, COMPONENT.Selectable)!.selected).toBe(true);
  });

  it('uses getEnemyPosition for enemy display position when provided', () => {
    const world = new WorldImpl();
    addPlayerShip(world, 0, 0);
    const enemyRealPos = addEnemyShip(world, 200, 200);
    const enemyDisplayPos = addEnemyShip(world, 5, 5);

    applyBoxSelection(world, 10, 10, 90, 90, false, (id) =>
      id === enemyDisplayPos ? { x: 50, y: 50 } : undefined,
    );

    expect(world.getComponent<Selectable>(enemyRealPos, COMPONENT.Selectable)!.selected).toBe(false);
    expect(world.getComponent<Selectable>(enemyDisplayPos, COMPONENT.Selectable)!.selected).toBe(true);
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
