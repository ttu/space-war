import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityId } from '../../src/engine/types';
import { WorldImpl } from '../../src/engine/ecs/World';
import { SelectionManager } from '../../src/game/SelectionManager';
import {
  Position,
  Ship,
  Selectable,
  COMPONENT,
} from '../../src/engine/components';

function addPlayerShip(world: WorldImpl, id: string, x: number, y: number): void {
  world.addComponent(id, {
    type: 'Position',
    x,
    y,
    prevX: x,
    prevY: y,
  } as import('../../src/engine/components').Position);
  world.addComponent(id, {
    type: 'Ship',
    name: `Ship-${id}`,
    hullClass: 'corvette',
    faction: 'player',
    flagship: id === 'e_0',
  } as import('../../src/engine/components').Ship);
  world.addComponent(id, {
    type: 'Selectable',
    selected: false,
  } as import('../../src/engine/components').Selectable);
}

describe('SelectionManager', () => {
  let world: WorldImpl;
  let manager: SelectionManager;

  beforeEach(() => {
    world = new WorldImpl();
    manager = new SelectionManager(world);
    const e0 = world.createEntity();
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    addPlayerShip(world, e0, 0, 0);
    addPlayerShip(world, e1, 10, 0);
    addPlayerShip(world, e2, 20, 0);
  });

  it('returns empty array when nothing selected', () => {
    expect(manager.getSelectedIds()).toEqual([]);
  });

  it('selects single ship on click when within pick radius', () => {
    manager.setSelectionFromClick(0, 0, 5, false);
    expect(manager.getSelectedIds()).toHaveLength(1);
    expect(manager.getSelectedIds()[0]).toBe('e_0');
  });

  it('deselects others when clicking without shift', () => {
    manager.setSelectionFromClick(0, 0, 5, false);
    manager.setSelectionFromClick(10, 0, 5, false);
    expect(manager.getSelectedIds()).toHaveLength(1);
    expect(manager.getSelectedIds()[0]).toBe('e_1');
  });

  it('adds to selection when clicking with shift', () => {
    manager.setSelectionFromClick(0, 0, 5, false);
    manager.setSelectionFromClick(10, 0, 5, true);
    expect(manager.getSelectedIds()).toHaveLength(2);
    expect(manager.getSelectedIds()).toContain('e_0');
    expect(manager.getSelectedIds()).toContain('e_1');
  });

  it('toggles off when shift-clicking already selected ship', () => {
    manager.setSelectionFromClick(0, 0, 5, false);
    manager.setSelectionFromClick(10, 0, 5, true);
    manager.setSelectionFromClick(0, 0, 5, true);
    expect(manager.getSelectedIds()).toHaveLength(1);
    expect(manager.getSelectedIds()[0]).toBe('e_1');
  });

  it('selects nothing when click is outside pick radius', () => {
    manager.setSelectionFromClick(100, 100, 5, false);
    expect(manager.getSelectedIds()).toEqual([]);
  });

  it('box select selects all player ships in rect', () => {
    manager.setSelectionFromBox(5, -5, 25, 5, false);
    expect(manager.getSelectedIds()).toHaveLength(2);
    expect(manager.getSelectedIds()).toContain('e_1');
    expect(manager.getSelectedIds()).toContain('e_2');
  });

  it('box select with shift adds to existing selection', () => {
    manager.setSelectionFromClick(0, 0, 5, false);
    manager.setSelectionFromBox(5, -5, 25, 5, true);
    expect(manager.getSelectedIds()).toHaveLength(3);
  });

  it('invokes onSelectionChange when selection changes', () => {
    const changes: EntityId[][] = [];
    manager.onSelectionChange((ids) => changes.push([...ids]));
    manager.setSelectionFromClick(0, 0, 5, false);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual(['e_0']);
    manager.setSelectionFromClick(10, 0, 5, false);
    expect(changes).toHaveLength(2);
    expect(changes[1]).toEqual(['e_1']);
  });

  it('getSelectedPlayerIds returns only player ships', () => {
    manager.setSelectionFromClick(0, 0, 5, false);
    expect(manager.getSelectedIds()).toContain('e_0');
    expect(manager.getSelectedPlayerIds()).toEqual(['e_0']);
  });

  it('selects enemy ship when getEnemyPickPosition returns position', () => {
    const enemyId = world.createEntity();
    world.addComponent(enemyId, {
      type: 'Position',
      x: 50,
      y: 50,
      prevX: 50,
      prevY: 50,
    } as import('../../src/engine/components').Position);
    world.addComponent(enemyId, {
      type: 'Ship',
      name: 'Enemy-1',
      hullClass: 'frigate',
      faction: 'enemy',
      flagship: false,
    } as import('../../src/engine/components').Ship);
    world.addComponent(enemyId, {
      type: 'Selectable',
      selected: false,
    } as import('../../src/engine/components').Selectable);

    const managerWithEnemyPos = new SelectionManager(world, (id) =>
      id === enemyId ? { x: 15, y: 0 } : undefined,
    );
    managerWithEnemyPos.setSelectionFromClick(15, 0, 5, false);
    expect(managerWithEnemyPos.getSelectedIds()).toContain(enemyId);
    expect(managerWithEnemyPos.getSelectedPlayerIds()).toEqual([]);
  });
});
