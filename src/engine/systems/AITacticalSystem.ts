import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position,
  Velocity,
  Ship,
  Thruster,
  NavigationOrder,
  AIStrategicIntent,
  ContactTracker,
  MissileLauncher,
  Missile,
  Railgun,
  COMPONENT,
} from '../components';
import { hitProbability } from '../utils/FiringComputer';

const MISSILE_RANGE_FRACTION = 0.85; // fire when within this fraction of maxRange
/** Max relative speed (km/s) at which AI will fire missiles. Prevents wasting ammo during high-speed flybys. */
const MAX_MISSILE_REL_SPEED = 25;
/** AI only fires railgun when estimated hit probability is at least this (realistic chance to hit). */
const MIN_RAILGUN_HIT_PROB = 0.45;
/** AI only fires railguns when player is within this range (km) or player has missiles inbound at us. */
const RAILGUN_ENGAGE_NEAR_KM = 50_000;

/**
 * Per-ship AI: executes strategic intent — issues move orders, launches missiles,
 * fires railguns, goes dark when disengaging. PDCs are handled by PDCSystem automatically.
 */
export class AITacticalSystem {
  constructor(private eventBus: EventBus) {}

  update(world: World, _dt: number, gameTime: number): void {
    const enemyTracker = this.getEnemyContactTracker(world);
    const ships = world.query(
      COMPONENT.Ship,
      COMPONENT.Position,
      COMPONENT.Thruster,
      COMPONENT.AIStrategicIntent,
    );

    for (const shipId of ships) {
      const ship = world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'enemy') continue;

      const intent = world.getComponent<AIStrategicIntent>(shipId, COMPONENT.AIStrategicIntent)!;
      const thruster = world.getComponent<Thruster>(shipId, COMPONENT.Thruster)!;
      const nav = world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);

      if (intent.objective === 'disengage') {
        if (intent.moveToX != null && intent.moveToY != null) {
          const hasNav = world.hasComponent(shipId, COMPONENT.NavigationOrder);
          if (!hasNav) {
            this.emitMoveOrder(shipId, intent.moveToX, intent.moveToY, gameTime);
          }
        } else {
          world.removeComponent(shipId, COMPONENT.NavigationOrder);
          thruster.throttle = 0;
        }
        continue;
      }

      if (intent.objective === 'engage') {
        const hasNav = nav != null && nav.phase !== 'arrived';
        if (!hasNav && intent.moveToX != null && intent.moveToY != null) {
          this.emitMoveOrder(shipId, intent.moveToX, intent.moveToY, gameTime, intent.matchVx, intent.matchVy);
        }

        if (intent.targetId != null && world.hasComponent(intent.targetId, COMPONENT.Position)) {
          const distToTarget = this.getDistanceToTarget(world, shipId, intent.targetId, enemyTracker);
          if (distToTarget != null) {
            const launcher = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher);
            if (launcher && (launcher.integrity ?? 100) > 0 && launcher.ammo > 0) {
              const missileRange = launcher.maxRange * MISSILE_RANGE_FRACTION;
              // Don't fire missiles during high-speed flybys or when relative speed is too high
              const closingSpeed = this.getClosingSpeed(world, shipId, intent.targetId);
              const relSpeed = this.getRelativeSpeed(world, shipId, intent.targetId);
              if (distToTarget <= missileRange && closingSpeed >= 0 && relSpeed <= MAX_MISSILE_REL_SPEED) {
                this.emitFireMissile(shipId, intent.targetId, gameTime);
              }
            }

            const railgun = world.getComponent<Railgun>(shipId, COMPONENT.Railgun);
            if (railgun && (railgun.integrity ?? 100) > 0 && railgun.ammo > 0) {
              const mayFireRailgun =
                this.hasIncomingPlayerMissiles(world, shipId) ||
                (distToTarget <= RAILGUN_ENGAGE_NEAR_KM);
              if (mayFireRailgun) {
                const targetVel = world.getComponent<Velocity>(intent.targetId, COMPONENT.Velocity);
                const targetVx = targetVel?.vx ?? 0;
                const targetVy = targetVel?.vy ?? 0;
                const targetSpeed = Math.sqrt(targetVx * targetVx + targetVy * targetVy);
                const prob = hitProbability(
                  distToTarget,
                  targetSpeed,
                  railgun.projectileSpeed,
                  railgun.maxRange,
                );
                if (prob >= MIN_RAILGUN_HIT_PROB && gameTime - railgun.lastFiredTime >= railgun.reloadTime) {
                  this.emitFireRailgun(shipId, intent.targetId, gameTime);
                }
              }
            }
          }
        }
      }

      if (intent.objective === 'hold') {
        thruster.throttle = nav ? thruster.throttle : 0;
      }
    }
  }

  private emitMoveOrder(
    shipId: EntityId, targetX: number, targetY: number, gameTime: number,
    matchVx?: number, matchVy?: number,
  ): void {
    this.eventBus.emit({
      type: 'AIMoveOrder',
      time: gameTime,
      entityId: shipId,
      data: { targetX, targetY, matchVx, matchVy },
    });
  }

  private emitFireMissile(shipId: EntityId, targetId: EntityId, gameTime: number): void {
    this.eventBus.emit({
      type: 'AIFireMissile',
      time: gameTime,
      entityId: shipId,
      targetId,
      data: {},
    });
  }

  private emitFireRailgun(shipId: EntityId, targetId: EntityId, gameTime: number): void {
    this.eventBus.emit({
      type: 'AIFireRailgun',
      time: gameTime,
      entityId: shipId,
      targetId,
      data: {},
    });
  }

  /** True if any player-launched missile is targeting this ship. */
  private hasIncomingPlayerMissiles(world: World, shipId: EntityId): boolean {
    const missiles = world.query(COMPONENT.Missile);
    for (const mid of missiles) {
      const missile = world.getComponent<Missile>(mid, COMPONENT.Missile)!;
      if (missile.launcherFaction !== 'player') continue;
      if (missile.targetId === shipId) return true;
    }
    return false;
  }

  private getEnemyContactTracker(world: World): ContactTracker | undefined {
    const trackers = world.query(COMPONENT.ContactTracker);
    for (const id of trackers) {
      const t = world.getComponent<ContactTracker>(id, COMPONENT.ContactTracker)!;
      if (t.faction === 'enemy') return t;
    }
    return undefined;
  }

  /** Total relative speed between ship and target (km/s). */
  private getRelativeSpeed(world: World, shipId: EntityId, targetId: EntityId): number {
    const vel = world.getComponent<Velocity>(shipId, COMPONENT.Velocity);
    const targetVel = world.getComponent<Velocity>(targetId, COMPONENT.Velocity);
    const dvx = (vel?.vx ?? 0) - (targetVel?.vx ?? 0);
    const dvy = (vel?.vy ?? 0) - (targetVel?.vy ?? 0);
    return Math.sqrt(dvx * dvx + dvy * dvy);
  }

  /** Positive = closing on target, negative = moving away. */
  private getClosingSpeed(world: World, shipId: EntityId, targetId: EntityId): number {
    const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(shipId, COMPONENT.Velocity);
    const targetPos = world.getComponent<Position>(targetId, COMPONENT.Position);
    const targetVel = world.getComponent<Velocity>(targetId, COMPONENT.Velocity);
    if (!targetPos) return 0;
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return 0;
    const relVx = (vel?.vx ?? 0) - (targetVel?.vx ?? 0);
    const relVy = (vel?.vy ?? 0) - (targetVel?.vy ?? 0);
    // Positive when closing (relative velocity points toward target)
    return (relVx * dx + relVy * dy) / dist;
  }

  private getDistanceToTarget(
    world: World,
    shipId: EntityId,
    targetId: EntityId,
    tracker: ContactTracker | undefined,
  ): number | null {
    const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;
    let tx: number;
    let ty: number;
    if (tracker) {
      const contact = tracker.contacts.get(targetId);
      if (contact && !contact.lost) {
        tx = contact.lastKnownX;
        ty = contact.lastKnownY;
      } else {
        const targetPos = world.getComponent<Position>(targetId, COMPONENT.Position);
        if (!targetPos) return null;
        tx = targetPos.x;
        ty = targetPos.y;
      }
    } else {
      const targetPos = world.getComponent<Position>(targetId, COMPONENT.Position);
      if (!targetPos) return null;
      tx = targetPos.x;
      ty = targetPos.y;
    }
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
