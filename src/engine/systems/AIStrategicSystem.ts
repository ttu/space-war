import { World, EntityId } from '../types';
import {
  Position,
  Ship,
  Hull,
  ContactTracker,
  AIStrategicIntent,
  COMPONENT,
} from '../components';
import { getBodiesFromWorld, getSafeWaypoint } from '../utils/PlanetAvoidance';

const STRATEGIC_INTERVAL = 3; // seconds between re-evaluation
const DISENGAGE_HULL_RATIO = 0.35; // retreat when hull below this fraction
const RETREAT_DISTANCE_KM = 5000; // how far to set retreat point from contact

/**
 * Fleet-level AI: sets objective (engage / disengage / hold), primary target,
 * and maneuver point for each enemy ship. Runs at fixed interval.
 */
export class AIStrategicSystem {
  update(world: World, _dt: number, gameTime: number): void {
    const enemyTracker = this.getEnemyContactTracker(world);
    const enemyShips = world.query(
      COMPONENT.Ship,
      COMPONENT.Position,
      COMPONENT.Hull,
      COMPONENT.AIStrategicIntent,
    );

    for (const shipId of enemyShips) {
      const ship = world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'enemy') continue;

      const intent = world.getComponent<AIStrategicIntent>(shipId, COMPONENT.AIStrategicIntent)!;
      if (gameTime < intent.nextStrategicUpdate) continue;

      const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const hull = world.getComponent<Hull>(shipId, COMPONENT.Hull)!;
      const hullRatio = hull.max > 0 ? hull.current / hull.max : 1;

      if (hullRatio < DISENGAGE_HULL_RATIO) {
        this.setDisengage(world, shipId, intent, pos, enemyTracker, gameTime);
      } else if (enemyTracker && enemyTracker.contacts.size > 0) {
        this.setEngage(world, shipId, intent, pos, enemyTracker, gameTime);
      } else {
        intent.objective = 'hold';
        intent.targetId = undefined;
        intent.moveToX = undefined;
        intent.moveToY = undefined;
        intent.nextStrategicUpdate = gameTime + STRATEGIC_INTERVAL;
      }
    }
  }

  private getEnemyContactTracker(world: World): ContactTracker | undefined {
    const trackers = world.query(COMPONENT.ContactTracker);
    for (const id of trackers) {
      const t = world.getComponent<ContactTracker>(id, COMPONENT.ContactTracker)!;
      if (t.faction === 'enemy') return t;
    }
    return undefined;
  }

  private setDisengage(
    world: World,
    _shipId: EntityId,
    intent: AIStrategicIntent,
    pos: Position,
    tracker: ContactTracker | undefined,
    gameTime: number,
  ): void {
    intent.objective = 'disengage';
    intent.targetId = undefined;

    if (tracker && tracker.contacts.size > 0) {
      let cx = 0;
      let cy = 0;
      let count = 0;
      for (const contact of tracker.contacts.values()) {
        cx += contact.lastKnownX;
        cy += contact.lastKnownY;
        count++;
      }
      if (count > 0) {
        cx /= count;
        cy /= count;
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const goalX = pos.x + nx * RETREAT_DISTANCE_KM;
        const goalY = pos.y + ny * RETREAT_DISTANCE_KM;
        const bodies = getBodiesFromWorld(world);
        const safe = getSafeWaypoint(pos.x, pos.y, goalX, goalY, bodies);
        intent.moveToX = safe ? safe.x : goalX;
        intent.moveToY = safe ? safe.y : goalY;
      } else {
        intent.moveToX = undefined;
        intent.moveToY = undefined;
      }
    } else {
      intent.moveToX = undefined;
      intent.moveToY = undefined;
    }
    intent.nextStrategicUpdate = gameTime + STRATEGIC_INTERVAL;
  }

  private setEngage(
    world: World,
    _shipId: EntityId,
    intent: AIStrategicIntent,
    pos: Position,
    tracker: ContactTracker,
    gameTime: number,
  ): void {
    let bestId: EntityId | undefined;
    let bestDistSq = Infinity;
    let bestX = 0;
    let bestY = 0;

    for (const [entityId, contact] of tracker.contacts) {
      if (contact.lost) continue;
      const dx = contact.lastKnownX - pos.x;
      const dy = contact.lastKnownY - pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestId = entityId;
        bestX = contact.lastKnownX;
        bestY = contact.lastKnownY;
      }
    }

    intent.objective = 'engage';
    intent.targetId = bestId;
    if (bestId !== undefined) {
      const bodies = getBodiesFromWorld(world);
      const safe = getSafeWaypoint(pos.x, pos.y, bestX, bestY, bodies);
      intent.moveToX = safe ? safe.x : bestX;
      intent.moveToY = safe ? safe.y : bestY;
    } else {
      intent.moveToX = undefined;
      intent.moveToY = undefined;
    }
    intent.nextStrategicUpdate = gameTime + STRATEGIC_INTERVAL;
  }
}
