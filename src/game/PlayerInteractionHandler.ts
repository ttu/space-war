import type { World, EntityId } from '../engine/types';
import type { CameraController } from '../core/Camera';
import type { GameTime } from '../engine/core/GameTime';
import type { SelectionManager } from './SelectionManager';
import type { CommandHandler } from './CommandHandler';
import type { PendingOrderType } from '../ui/OrderBar';
import {
  Position, Ship, Missile, NavigationOrder, CelestialBody, ContactTracker, COMPONENT,
} from '../engine/components';
import { DANGER_ZONE_MULTIPLIER } from '../engine/constants';

export interface InteractionDeps {
  world: World;
  camera: CameraController;
  canvas: HTMLCanvasElement;
  selectionManager: SelectionManager;
  commandHandler: CommandHandler;
  gameTime: GameTime;
  getPlayerContacts: () => ContactTracker | undefined;
  getPendingOrder: () => PendingOrderType;
  clearPendingOrder: () => void;
}

/**
 * Handles player mouse interactions: right-click commands, waypoint drag, waypoint delete.
 * Translates raw screen input into CommandHandler calls.
 */
export class PlayerInteractionHandler {
  private waypointDrag: {
    shipId: EntityId;
    waypointIndex: number; // -1 = destination, 0+ = waypoints[i]
  } | null = null;

  constructor(private deps: InteractionDeps) {}

  /** Returns true if a waypoint drag was started (caller should suppress normal click). */
  tryStartWaypointDrag(screenX: number, screenY: number): boolean {
    const { world, camera, canvas, selectionManager } = this.deps;
    const worldPos = camera.screenToWorld(screenX, screenY, canvas);
    const pickRadius = camera.getZoom() * 0.04;

    const selectedIds = selectionManager.getSelectedPlayerIds();
    for (const shipId of selectedIds) {
      const nav = world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
      if (!nav || nav.phase === 'arrived') continue;

      // Check destination
      const ddx = nav.destinationX - worldPos.x;
      const ddy = nav.destinationY - worldPos.y;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < pickRadius) {
        this.waypointDrag = { shipId, waypointIndex: -1 };
        return true;
      }

      // Check waypoints
      for (let i = 0; i < nav.waypoints.length; i++) {
        const wp = nav.waypoints[i];
        const dx = wp.x - worldPos.x;
        const dy = wp.y - worldPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < pickRadius) {
          this.waypointDrag = { shipId, waypointIndex: i };
          return true;
        }
      }
    }
    return false;
  }

  get isDraggingWaypoint(): boolean {
    return this.waypointDrag !== null;
  }

  handleWaypointDragMove(screenX: number, screenY: number): void {
    if (!this.waypointDrag) return;
    const { world, camera, canvas, commandHandler } = this.deps;
    const worldPos = camera.screenToWorld(screenX, screenY, canvas);
    const nav = world.getComponent<NavigationOrder>(this.waypointDrag.shipId, COMPONENT.NavigationOrder);
    if (!nav) { this.waypointDrag = null; return; }

    commandHandler.moveWaypoint(this.waypointDrag.shipId, this.waypointDrag.waypointIndex, worldPos.x, worldPos.y);
  }

  handleWaypointDragEnd(screenX: number, screenY: number): void {
    if (!this.waypointDrag) return;
    this.handleWaypointDragMove(screenX, screenY);

    if (this.waypointDrag.waypointIndex === -1) {
      this.deps.commandHandler.recomputeAfterDrag(this.waypointDrag.shipId);
    }

    this.waypointDrag = null;
  }

  handleRightClick(screenX: number, screenY: number, shiftKey = false): void {
    const { world, camera, canvas, commandHandler, gameTime, getPlayerContacts, getPendingOrder, clearPendingOrder } = this.deps;
    const worldPos = camera.screenToWorld(screenX, screenY, canvas);
    const pickRadius = camera.getZoom() * 0.04;

    // Pick enemy ship
    const ships = world.query(COMPONENT.Position, COMPONENT.Ship);
    const playerContacts = getPlayerContacts();
    let clickedEnemy: string | null = null;
    let enemyDist = pickRadius;

    for (const id of ships) {
      const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction === 'player') continue;

      let checkX: number, checkY: number;
      if (playerContacts) {
        const contact = playerContacts.contacts.get(id);
        if (!contact) continue;
        checkX = contact.lastKnownX;
        checkY = contact.lastKnownY;
      } else {
        const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
        checkX = pos.x;
        checkY = pos.y;
      }

      const dx = checkX - worldPos.x;
      const dy = checkY - worldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < enemyDist) {
        enemyDist = dist;
        clickedEnemy = id;
      }
    }

    // Pick enemy missile
    let clickedMissile: string | null = null;
    let missileDist = pickRadius;
    const missiles = world.query(COMPONENT.Position, COMPONENT.Missile);
    for (const id of missiles) {
      const missile = world.getComponent<Missile>(id, COMPONENT.Missile)!;
      if (missile.launcherFaction === 'player') continue;
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      const dx = pos.x - worldPos.x;
      const dy = pos.y - worldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < missileDist) {
        missileDist = dist;
        clickedMissile = id;
      }
    }

    const order = getPendingOrder();
    const railgunTarget =
      order === 'fireRailgun' && (clickedEnemy !== null || clickedMissile !== null)
        ? clickedEnemy === null
          ? clickedMissile
          : clickedMissile === null
            ? clickedEnemy
            : enemyDist <= missileDist
              ? clickedEnemy
              : clickedMissile
        : null;

    if (order === 'fireMissile' && clickedEnemy) {
      commandHandler.launchMissile(clickedEnemy, gameTime.elapsed);
      clearPendingOrder();
    } else if (order === 'fireRailgun' && railgunTarget) {
      commandHandler.fireRailgun(railgunTarget, gameTime.elapsed);
      clearPendingOrder();
    } else if (order === 'move' || order === 'none') {
      // Check if click is on a celestial body — issue orbit instead of move
      let clickedPlanet: EntityId | null = null;
      const celestials = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
      for (const id of celestials) {
        const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
        const bPos = world.getComponent<Position>(id, COMPONENT.Position)!;
        const hitRadius = body.radius * DANGER_ZONE_MULTIPLIER;
        const dx = bPos.x - worldPos.x;
        const dy = bPos.y - worldPos.y;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          clickedPlanet = id;
          break;
        }
      }

      if (clickedPlanet) {
        commandHandler.issueOrbitTo(clickedPlanet);
      } else {
        commandHandler.issueMoveTo(worldPos.x, worldPos.y, shiftKey);
      }
      if (order === 'move') {
        clearPendingOrder();
      }
    }
  }

  handleDeleteWaypoint(screenX: number, screenY: number): void {
    const { world, camera, canvas, selectionManager, commandHandler } = this.deps;
    const worldPos = camera.screenToWorld(screenX, screenY, canvas);
    const pickRadius = camera.getZoom() * 0.04;

    const selectedIds = selectionManager.getSelectedPlayerIds();
    if (selectedIds.length === 0) return;

    for (const shipId of selectedIds) {
      const nav = world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
      if (!nav || nav.phase === 'arrived') continue;

      // Check destination marker
      const ddx = nav.destinationX - worldPos.x;
      const ddy = nav.destinationY - worldPos.y;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < pickRadius) {
        commandHandler.deleteWaypoint(shipId, -1);
        return;
      }

      // Check waypoint markers
      for (let i = 0; i < nav.waypoints.length; i++) {
        const wp = nav.waypoints[i];
        const dx = wp.x - worldPos.x;
        const dy = wp.y - worldPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < pickRadius) {
          commandHandler.deleteWaypoint(shipId, i);
          return;
        }
      }
    }
  }
}
