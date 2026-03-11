import type { World, EntityId } from '../engine/types';
import { Position, Ship, Selectable, COMPONENT } from '../engine/components';
import { applyBoxSelection } from './Selection';

/** Optional: return display position for enemy ships (e.g. last-known from sensors). */
export type GetEnemyPickPosition = (entityId: EntityId) => { x: number; y: number } | undefined;

/**
 * Manages ship selection: click, shift-click, and box select.
 * Player and enemy ships with Selectable can be selected (enemies use last-known position when provided).
 */
export class SelectionManager {
  private selectionChangeCallbacks: Array<(ids: EntityId[]) => void> = [];

  constructor(
    private world: World,
    private getEnemyPickPosition?: GetEnemyPickPosition,
  ) {}

  /** Get all currently selected entity IDs (ships and missiles). */
  getSelectedIds(): EntityId[] {
    const out: EntityId[] = [];
    for (const id of this.world.query(COMPONENT.Ship, COMPONENT.Selectable)) {
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (sel.selected) out.push(id);
    }
    for (const id of this.world.query(COMPONENT.Missile, COMPONENT.Selectable)) {
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (sel.selected) out.push(id);
    }
    return out;
  }

  /** Get currently selected player ship entity IDs only (for orders / fleet panel). */
  getSelectedPlayerIds(): EntityId[] {
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
   * Considers both player and enemy ships. Enemy position uses getEnemyPickPosition when available.
   */
  setSelectionFromClick(
    worldX: number,
    worldY: number,
    pickRadiusKm: number,
    shiftKey: boolean,
  ): void {
    const ships = this.world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.Selectable);
    const missiles = this.world.query(COMPONENT.Position, COMPONENT.Missile, COMPONENT.Selectable);

    if (!shiftKey) {
      for (const id of ships) {
        const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
        sel.selected = false;
      }
      for (const id of missiles) {
        const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
        sel.selected = false;
      }
    }

    let closestId: EntityId | null = null;
    let closestDist = pickRadiusKm;

    // Check ships
    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const displayPos =
        ship.faction === 'player'
          ? { x: pos.x, y: pos.y }
          : this.getEnemyPickPosition?.(id) ?? { x: pos.x, y: pos.y };
      const dx = displayPos.x - worldX;
      const dy = displayPos.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }

    // Check missiles
    for (const id of missiles) {
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
   * Selects all ships (player and enemy) whose display position is inside the rect. If shiftKey is true, adds to selection.
   */
  setSelectionFromBox(
    worldMinX: number,
    worldMinY: number,
    worldMaxX: number,
    worldMaxY: number,
    shiftKey: boolean,
  ): void {
    applyBoxSelection(
      this.world,
      worldMinX,
      worldMinY,
      worldMaxX,
      worldMaxY,
      shiftKey,
      this.getEnemyPickPosition,
    );
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
