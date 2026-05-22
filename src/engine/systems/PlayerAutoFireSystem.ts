import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position,
  Velocity,
  Ship,
  ContactTracker,
  MissileLauncher,
  Railgun,
  COMPONENT,
} from '../components';
import { hitProbability } from '../utils/FiringComputer';

const MIN_RAILGUN_HIT_PROB = 0.4;
const MISSILE_RANGE_FRACTION = 0.85;
const MAX_MISSILE_REL_SPEED = 40;

/**
 * Auto-fires player railguns at the nearest enemy in range with good hit probability.
 * Missiles are auto-fired when a target is closing within effective range.
 * PDC is already automatic via PDCSystem.
 */
export class PlayerAutoFireSystem {
  constructor(private eventBus: EventBus) {}

  update(world: World, _dt: number, gameTime: number): void {
    const tracker = this.getPlayerTracker(world);
    if (!tracker || tracker.contacts.size === 0) return;

    const ships = world.query(COMPONENT.Ship, COMPONENT.Position, COMPONENT.Velocity);
    for (const shipId of ships) {
      const ship = world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;

      const railgun = world.getComponent<Railgun>(shipId, COMPONENT.Railgun);
      const launcher = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher);
      if (!railgun && !launcher) continue;

      const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
      const target = this.findBestTarget(world, pos, vel, tracker);
      if (!target) continue;

      if (railgun && (railgun.integrity ?? 100) > 0 && railgun.ammo > 0
          && gameTime - railgun.lastFiredTime >= railgun.reloadTime) {
        const tVel = world.getComponent<Velocity>(target.id, COMPONENT.Velocity);
        const tSpeed = Math.hypot(tVel?.vx ?? 0, tVel?.vy ?? 0);
        const prob = hitProbability(target.dist, tSpeed, railgun.projectileSpeed, railgun.maxRange);
        if (prob >= MIN_RAILGUN_HIT_PROB) {
          this.eventBus.emit({
            type: 'AIFireRailgun',
            time: gameTime,
            entityId: shipId,
            targetId: target.id,
            data: {},
          });
        }
      }

      if (launcher && (launcher.integrity ?? 100) > 0 && launcher.ammo > 0
          && gameTime - launcher.lastFiredTime >= launcher.reloadTime) {
        const effectiveRange = launcher.maxRange * MISSILE_RANGE_FRACTION;
        if (target.dist <= effectiveRange && target.relSpeed <= MAX_MISSILE_REL_SPEED && target.closing >= 0) {
          this.eventBus.emit({
            type: 'AIFireMissile',
            time: gameTime,
            entityId: shipId,
            targetId: target.id,
            data: {},
          });
        }
      }
    }
  }

  private getPlayerTracker(world: World): ContactTracker | undefined {
    const trackers = world.query(COMPONENT.ContactTracker);
    for (const id of trackers) {
      const t = world.getComponent<ContactTracker>(id, COMPONENT.ContactTracker)!;
      if (t.faction === 'player') return t;
    }
    return undefined;
  }

  private findBestTarget(
    world: World,
    pos: Position,
    vel: Velocity,
    tracker: ContactTracker,
  ): { id: EntityId; dist: number; relSpeed: number; closing: number } | null {
    let best: { id: EntityId; dist: number; relSpeed: number; closing: number } | null = null;
    for (const [id, contact] of tracker.contacts) {
      if (contact.lost) continue;
      if (!world.hasComponent(id, COMPONENT.Position)) continue;
      const dx = contact.lastKnownX - pos.x;
      const dy = contact.lastKnownY - pos.y;
      const dist = Math.hypot(dx, dy);
      if (best && dist >= best.dist) continue;
      const relVx = vel.vx - contact.lastKnownVx;
      const relVy = vel.vy - contact.lastKnownVy;
      const relSpeed = Math.hypot(relVx, relVy);
      // Positive when shooter is closing on target. dx/dy point from shooter to
      // target; relV is shooter-minus-target velocity, so a closing approach
      // means relV projected along dx/dy is positive.
      const closing = dist > 0 ? (relVx * dx + relVy * dy) / dist : 0;
      best = { id, dist, relSpeed, closing };
    }
    return best;
  }
}
