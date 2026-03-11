import type { EntityId } from '../engine/types';
import { World } from '../engine/types';
import { Position, Ship, Selectable, COMPONENT } from '../engine/components';

/** Optional: return display position for enemy ships (e.g. last-known from sensors). */
export type GetEnemyPosition = (entityId: EntityId) => { x: number; y: number } | undefined;

/**
 * Applies box selection in world coordinates: selects all ships (player and enemy) whose
 * display position is inside the given axis-aligned rect. Enemy position uses getEnemyPosition when provided.
 * If shiftKey is false, all ships are deselected first.
 */
export function applyBoxSelection(
  world: World,
  worldMinX: number,
  worldMinY: number,
  worldMaxX: number,
  worldMaxY: number,
  shiftKey: boolean,
  getEnemyPosition?: GetEnemyPosition,
): void {
  const entities = world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.Selectable);

  if (!shiftKey) {
    for (const id of entities) {
      const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      sel.selected = false;
    }
  }

  for (const id of entities) {
    const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
    const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
    const displayPos =
      ship.faction === 'player'
        ? { x: pos.x, y: pos.y }
        : getEnemyPosition?.(id) ?? { x: pos.x, y: pos.y };
    if (
      displayPos.x >= worldMinX &&
      displayPos.x <= worldMaxX &&
      displayPos.y >= worldMinY &&
      displayPos.y <= worldMaxY
    ) {
      const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      sel.selected = true;
    }
  }
}
