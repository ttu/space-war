import { World, EntityId } from '../types';
import {
  Position,
  Velocity,
  Ship,
  Thruster,
  NavigationOrder,
  AIStrategicIntent,
  ContactTracker,
  MissileLauncher,
  Railgun,
  COMPONENT,
} from '../components';
import { CommandHandler } from '../../game/CommandHandler';
import { hitProbability } from '../../game/FiringComputer';

const MISSILE_RANGE_FRACTION = 0.85; // fire when within this fraction of maxRange
const MIN_RAILGUN_HIT_PROB = 0.2;

/**
 * Per-ship AI: executes strategic intent — issues move orders, launches missiles,
 * fires railguns, goes dark when disengaging. PDCs are handled by PDCSystem automatically.
 */
export class AITacticalSystem {
  constructor(private commandHandler: CommandHandler) {}

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
            this.commandHandler.issueMoveToForShip(shipId, intent.moveToX, intent.moveToY);
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
          this.commandHandler.issueMoveToForShip(shipId, intent.moveToX, intent.moveToY);
        }

        if (intent.targetId != null && world.hasComponent(intent.targetId, COMPONENT.Position)) {
          const distToTarget = this.getDistanceToTarget(world, shipId, intent.targetId, enemyTracker);
          if (distToTarget != null) {
            const launcher = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher);
            if (launcher && (launcher.integrity ?? 100) > 0 && launcher.ammo > 0) {
              const missileRange = launcher.maxRange * MISSILE_RANGE_FRACTION;
              if (distToTarget <= missileRange) {
                this.commandHandler.launchMissileFromShip(shipId, intent.targetId, gameTime);
              }
            }

            const railgun = world.getComponent<Railgun>(shipId, COMPONENT.Railgun);
            if (railgun && (railgun.integrity ?? 100) > 0) {
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
              if (distToTarget <= railgun.maxRange && prob >= MIN_RAILGUN_HIT_PROB) {
                this.commandHandler.fireRailgunFromShip(shipId, intent.targetId, gameTime);
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

  private getEnemyContactTracker(world: World): ContactTracker | undefined {
    const trackers = world.query(COMPONENT.ContactTracker);
    for (const id of trackers) {
      const t = world.getComponent<ContactTracker>(id, COMPONENT.ContactTracker)!;
      if (t.faction === 'enemy') return t;
    }
    return undefined;
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
