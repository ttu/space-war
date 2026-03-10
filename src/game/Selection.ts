import { World } from '../engine/types';
import { Position, Ship, Selectable, COMPONENT } from '../engine/components';

/**
 * Applies box selection in world coordinates: selects all player ships whose
 * position is inside the given axis-aligned rect. Non-player ships are ignored.
 * If shiftKey is false, all player ships are deselected first.
 */
export function applyBoxSelection(
  world: World,
  worldMinX: number,
  worldMinY: number,
  worldMaxX: number,
  worldMaxY: number,
  shiftKey: boolean,
): void {
  const entities = world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.Selectable);

  if (!shiftKey) {
    for (const id of entities) {
      const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      sel.selected = false;
    }
  }

  for (const id of entities) {
    const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
    if (ship.faction !== 'player') continue;
    const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
    if (pos.x >= worldMinX && pos.x <= worldMaxX && pos.y >= worldMinY && pos.y <= worldMaxY) {
      const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      sel.selected = true;
    }
  }
}
