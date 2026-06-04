import { World, EntityId } from '../types';
import {
  Position,
  Velocity,
  Ship,
  Hull,
  Thruster,
  ContactTracker,
  AIStrategicIntent,
  MissileLauncher,
  Railgun,
  COMPONENT,
} from '../components';
import { getBodiesFromWorld, getSafeWaypoint } from '../utils/PlanetAvoidance';

const STRATEGIC_INTERVAL = 3; // seconds between re-evaluation
const DISENGAGE_HULL_RATIO = 0.35; // retreat when hull below this fraction
const RETREAT_DISTANCE_KM = 20_000; // how far to set retreat point from contact
const SAFE_RETREAT_DISTANCE_KM = 80_000; // once this far from threats, stop fleeing
/** Max lead time (seconds) to prevent wild extrapolation for distant targets. */
const MAX_LEAD_TIME = 600;
/** Always velocity-match during engagement to prevent high-speed flybys. */
const VELOCITY_MATCH_RANGE = Infinity;
/** Desired closing speed (km/s) when outside missile range — cover distance fast. */
const DESIRED_CLOSING_SPEED = 30;
/** Desired closing speed (km/s) inside missile range. */
const DESIRED_CLOSING_SPEED_MISSILE = 20;
/** Desired closing speed (km/s) when out of missiles — rush in for railgun range. */
const DESIRED_CLOSING_SPEED_BRAWL = 60;

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

      const armed = this.hasAnyWeapon(world, shipId);
      if (hullRatio < DISENGAGE_HULL_RATIO || (armed && this.isOutOfAmmo(world, shipId))) {
        this.setDisengage(world, shipId, intent, pos, enemyTracker, gameTime);
      } else if (armed && enemyTracker && enemyTracker.contacts.size > 0) {
        this.setEngage(world, shipId, intent, pos, enemyTracker, gameTime);
      } else {
        intent.objective = 'hold';
        intent.targetId = undefined;
        intent.moveToX = undefined;
        intent.moveToY = undefined;
        intent.matchVx = undefined;
        intent.matchVy = undefined;
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

  private hasAnyWeapon(world: World, shipId: EntityId): boolean {
    return (
      world.hasComponent(shipId, COMPONENT.MissileLauncher) ||
      world.hasComponent(shipId, COMPONENT.Railgun)
    );
  }

  private isOutOfAmmo(world: World, shipId: EntityId): boolean {
    const ml = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher);
    const rg = world.getComponent<Railgun>(shipId, COMPONENT.Railgun);
    if (!ml && !rg) return false;
    const missilesEmpty = !ml || ml.ammo <= 0;
    const railgunEmpty = !rg || rg.ammo <= 0;
    return missilesEmpty && railgunEmpty;
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
    intent.matchVx = undefined;
    intent.matchVy = undefined;

    if (tracker && tracker.contacts.size > 0) {
      let cx = 0;
      let cy = 0;
      let count = 0;
      let nearestThreatSq = Infinity;
      for (const contact of tracker.contacts.values()) {
        cx += contact.lastKnownX;
        cy += contact.lastKnownY;
        count++;
        const ddx = pos.x - contact.lastKnownX;
        const ddy = pos.y - contact.lastKnownY;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < nearestThreatSq) nearestThreatSq = d2;
      }
      // If already far from nearest threat, stop adding retreat goals (loiter).
      if (nearestThreatSq > SAFE_RETREAT_DISTANCE_KM * SAFE_RETREAT_DISTANCE_KM) {
        intent.moveToX = undefined;
        intent.moveToY = undefined;
      } else if (count > 0) {
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
    shipId: EntityId,
    intent: AIStrategicIntent,
    pos: Position,
    tracker: ContactTracker,
    gameTime: number,
  ): void {
    let bestId: EntityId | undefined;
    let bestDistSq = Infinity;
    let bestX = 0;
    let bestY = 0;
    let bestVx = 0;
    let bestVy = 0;

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
        bestVx = contact.lastKnownVx;
        bestVy = contact.lastKnownVy;
      }
    }

    // If all contacts are lost, fall back to hold rather than engaging a phantom.
    if (bestId === undefined) {
      intent.objective = 'hold';
      intent.targetId = undefined;
      intent.moveToX = undefined;
      intent.moveToY = undefined;
      intent.matchVx = undefined;
      intent.matchVy = undefined;
      intent.nextStrategicUpdate = gameTime + STRATEGIC_INTERVAL;
      return;
    }

    intent.objective = 'engage';
    intent.targetId = bestId;
    {
      const dist = Math.sqrt(bestDistSq);
      const thruster = world.getComponent<Thruster>(shipId, COMPONENT.Thruster);
      const accel = thruster?.maxThrust ?? 0.01;
      const vel = world.getComponent<Velocity>(shipId, COMPONENT.Velocity);
      const shipVx = vel?.vx ?? 0;
      const shipVy = vel?.vy ?? 0;

      // Unit vector toward target
      const ux = (bestX - pos.x) / (dist || 1);
      const uy = (bestY - pos.y) / (dist || 1);
      const closingSpeed = (shipVx - bestVx) * ux + (shipVy - bestVy) * uy;

      // Estimate time-to-arrive
      let estTime: number;
      if (closingSpeed > 1) {
        estTime = dist / closingSpeed;
      } else {
        estTime = 2 * Math.sqrt(dist / accel);
      }

      // At close range, reduce lead time to avoid overshooting past the target.
      // Beyond 50k km: full lead intercept. Within 50k km: taper to near-zero.
      const leadFraction = Math.min(1, dist / 50_000);
      const leadTime = Math.min(estTime * 0.5 * leadFraction, MAX_LEAD_TIME);
      const interceptX = bestX + bestVx * leadTime;
      const interceptY = bestY + bestVy * leadTime;

      const bodies = getBodiesFromWorld(world);
      const safe = getSafeWaypoint(pos.x, pos.y, interceptX, interceptY, bodies);
      intent.moveToX = safe ? safe.x : interceptX;
      intent.moveToY = safe ? safe.y : interceptY;

      // Velocity matching: arrive at target's velocity + closing component.
      // Speed is range-dependent: fast approach when far away (to cover distance),
      // slow when inside missile range (to stay under rel-speed fire threshold),
      // very fast when out of missiles (rush to railgun range).
      const ml = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher);
      const missilesEmpty = !ml || ml.ammo <= 0;
      const missileMaxRange = ml?.maxRange ?? 50_000;
      const inMissileRange = dist <= missileMaxRange * 1.2;
      const closingDesired = missilesEmpty
        ? DESIRED_CLOSING_SPEED_BRAWL
        : (inMissileRange ? DESIRED_CLOSING_SPEED_MISSILE : DESIRED_CLOSING_SPEED);
      if (dist <= VELOCITY_MATCH_RANGE) {
        intent.matchVx = bestVx + ux * closingDesired;
        intent.matchVy = bestVy + uy * closingDesired;
      } else {
        intent.matchVx = undefined;
        intent.matchVy = undefined;
      }
    }
    intent.nextStrategicUpdate = gameTime + STRATEGIC_INTERVAL;
  }
}
