import type { World, EntityId } from '../engine/types';
import { Position, Ship, Selectable, COMPONENT } from '../engine/components';
import { applyBoxSelection } from './Selection';

/**
 * Manages ship selection: click, shift-click, and box select.
 * Only player ships with Selectable are considered.
 */
export class SelectionManager {
  private selectionChangeCallbacks: Array<(ids: EntityId[]) => void> = [];

  constructor(private world: World) {}

  /** Get currently selected player ship entity IDs. */
  getSelectedIds(): EntityId[] {
    const ships = this.world.query(COMPONENT.Ship, COMPONENT.Selectable);
    const out: EntityId[] = [];
    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (sel.selected) out.push(id);
    }
    return out;
  }

  /**
   * Update selection from a single click in world coordinates.
   * If shiftKey is false, deselects all then selects (or toggles) the ship under the point.
   * If shiftKey is true, adds/removes the ship under the point from selection.
   */
  setSelectionFromClick(
    worldX: number,
    worldY: number,
    pickRadiusKm: number,
    shiftKey: boolean,
  ): void {
    const ships = this.world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.Selectable);

    if (!shiftKey) {
      for (const id of ships) {
        const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
        if (ship.faction !== 'player') continue;
        const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
        sel.selected = false;
      }
    }

    let closestId: EntityId | null = null;
    let closestDist = pickRadiusKm;
    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const dx = pos.x - worldX;
      const dy = pos.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }

    if (closestId) {
      const sel = this.world.getComponent<Selectable>(closestId, COMPONENT.Selectable)!;
      sel.selected = !sel.selected || !shiftKey;
    }

    this.notifySelectionChange();
  }

  /**
   * Update selection from a box in world coordinates.
   * Selects all player ships inside the axis-aligned rect. If shiftKey is true, adds to selection.
   */
  setSelectionFromBox(
    worldMinX: number,
    worldMinY: number,
    worldMaxX: number,
    worldMaxY: number,
    shiftKey: boolean,
  ): void {
    applyBoxSelection(this.world, worldMinX, worldMinY, worldMaxX, worldMaxY, shiftKey);
    this.notifySelectionChange();
  }

  /** Subscribe to selection changes. Returns unsubscribe. */
  onSelectionChange(callback: (ids: EntityId[]) => void): () => void {
    this.selectionChangeCallbacks.push(callback);
    return () => {
      this.selectionChangeCallbacks = this.selectionChangeCallbacks.filter((c) => c !== callback);
    };
  }

  private notifySelectionChange(): void {
    const ids = this.getSelectedIds();
    for (const cb of this.selectionChangeCallbacks) {
      cb(ids);
    }
  }
}
