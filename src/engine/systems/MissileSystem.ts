import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Velocity, Facing, Thruster, ThermalSignature,
  Missile, ContactTracker,
  COMPONENT,
} from '../components';

export const DETONATION_RADIUS = 1; // km — direct hit required
const NAV_CONSTANT = 4; // proportional navigation gain
const BALLISTIC_TIMEOUT = 120; // seconds before removing fuel-depleted missiles

export class MissileSystem {
  /** Track when each missile went ballistic (entityId → gameTime) */
  private ballisticTimestamps: Map<EntityId, number> = new Map();

  constructor(private eventBus?: EventBus) {}

  update(world: World, dt: number, gameTime: number): void {
    const missileEntities = world.query(COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Missile);
    const toRemove: EntityId[] = [];

    for (const missileId of missileEntities) {
      const pos = world.getComponent<Position>(missileId, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(missileId, COMPONENT.Velocity)!;
      const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
      const facing = world.getComponent<Facing>(missileId, COMPONENT.Facing);

      // Update arming status based on distance from launch origin
      if (!missile.armed) {
        // Use prevX/prevY delta as proxy for distance traveled
        const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
        if (speed * dt > 0) {
          // Check distance from origin position (approximation using total displacement)
          const distFromStart = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
          if (distFromStart > missile.armingDistance) {
            missile.armed = true;
          }
        }
      }

      // Get target position data
      const targetData = this.getTargetData(world, missile, pos);

      // Update guidance mode
      if (missile.fuel <= 0) {
        missile.guidanceMode = 'ballistic';
      } else if (targetData.source === 'sensor' || targetData.source === 'seeker') {
        missile.guidanceMode = targetData.source;
      } else {
        missile.guidanceMode = 'ballistic';
      }

      // Apply guidance
      if (missile.guidanceMode !== 'ballistic' && missile.fuel > 0 && targetData.position) {
        this.applyProportionalNavigation(vel, facing, pos, targetData.position, targetData.velocity, missile, dt);
        missile.fuel = Math.max(0, missile.fuel - dt);
        // Re-check: if fuel just ran out, switch to ballistic
        if (missile.fuel <= 0) {
          missile.guidanceMode = 'ballistic';
        }
      }

      // Track ballistic timestamp for timeout removal
      if (missile.guidanceMode === 'ballistic' && missile.fuel <= 0) {
        if (!this.ballisticTimestamps.has(missileId)) {
          this.ballisticTimestamps.set(missileId, gameTime);
        }
        const ballisticStart = this.ballisticTimestamps.get(missileId)!;
        if (gameTime - ballisticStart > BALLISTIC_TIMEOUT) {
          toRemove.push(missileId);
          continue;
        }
      } else {
        this.ballisticTimestamps.delete(missileId);
      }

      // Check detonation against true target position
      if (missile.armed && targetData.truePosition) {
        const dx = pos.x - targetData.truePosition.x;
        const dy = pos.y - targetData.truePosition.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= DETONATION_RADIUS) {
          this.eventBus?.emit({
            type: 'MissileImpact',
            time: gameTime,
            entityId: missileId,
            targetId: missile.targetId,
            data: { missileCount: missile.count, faction: missile.launcherFaction },
          });
          toRemove.push(missileId);
          continue;
        }
      }
    }

    // Remove detonated/expired missiles
    for (const id of toRemove) {
      world.removeEntity(id);
      this.ballisticTimestamps.delete(id);
    }
  }

  private getTargetData(
    world: World, missile: Missile, missilePos: Position,
  ): TargetData {
    const result: TargetData = { source: 'none', position: null, velocity: null, truePosition: null };

    // Get true target position (for detonation check)
    const targetPos = world.getComponent<Position>(missile.targetId, COMPONENT.Position);
    if (targetPos) {
      result.truePosition = { x: targetPos.x, y: targetPos.y };
    }

    // Try faction sensors first (ContactTracker)
    const trackers = world.query(COMPONENT.ContactTracker);
    for (const trackerId of trackers) {
      const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
      if (tracker.faction !== missile.launcherFaction) continue;

      const contact = tracker.contacts.get(missile.targetId);
      if (contact && !contact.lost) {
        result.source = 'sensor';
        result.position = { x: contact.lastKnownX, y: contact.lastKnownY };
        result.velocity = { vx: contact.lastKnownVx, vy: contact.lastKnownVy };
        return result;
      }
    }

    // Try onboard seeker
    if (targetPos) {
      const dx = targetPos.x - missilePos.x;
      const dy = targetPos.y - missilePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= missile.seekerRange && distance > 1) {
        const thermal = world.getComponent<ThermalSignature>(missile.targetId, COMPONENT.ThermalSignature);
        const thruster = world.getComponent<Thruster>(missile.targetId, COMPONENT.Thruster);
        if (thermal) {
          const throttle = thruster?.throttle ?? 0;
          const effectiveSig = thermal.baseSignature + throttle * thermal.thrustMultiplier;
          const signalStrength = effectiveSig / (distance * distance);

          if (signalStrength > missile.seekerSensitivity) {
            result.source = 'seeker';
            result.position = { x: targetPos.x, y: targetPos.y };
            const targetVel = world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);
            result.velocity = targetVel ? { vx: targetVel.vx, vy: targetVel.vy } : null;
            return result;
          }
        }
      }
    }

    return result;
  }

  private applyProportionalNavigation(
    vel: Velocity,
    facing: Facing | undefined,
    missilePos: Position,
    targetPos: { x: number; y: number },
    targetVel: { vx: number; vy: number } | null,
    missile: Missile,
    dt: number,
  ): void {
    const dx = targetPos.x - missilePos.x;
    const dy = targetPos.y - missilePos.y;
    const range = Math.sqrt(dx * dx + dy * dy);
    if (range < 1) return;

    // Line of sight angle
    const losAngle = Math.atan2(dy, dx);

    // Relative velocity
    const relVx = (targetVel?.vx ?? 0) - vel.vx;
    const relVy = (targetVel?.vy ?? 0) - vel.vy;

    // Closing speed (negative = closing)
    const closingSpeed = -(relVx * dx + relVy * dy) / range;

    // LOS rotation rate
    const losRate = (dx * relVy - dy * relVx) / (range * range);

    // Proportional navigation: commanded acceleration perpendicular to LOS
    const commandAccel = NAV_CONSTANT * closingSpeed * losRate;

    // Convert to thrust angle: base direction is toward target, adjust by PN
    const thrustAngle = losAngle + Math.atan2(commandAccel * dt, missile.accel);

    // Apply thrust
    vel.vx += Math.cos(thrustAngle) * missile.accel * dt;
    vel.vy += Math.sin(thrustAngle) * missile.accel * dt;

    // Update facing to velocity direction
    if (facing) {
      facing.angle = Math.atan2(vel.vy, vel.vx);
    }
  }
}

interface TargetData {
  source: 'sensor' | 'seeker' | 'none';
  position: { x: number; y: number } | null;
  velocity: { vx: number; vy: number } | null;
  truePosition: { x: number; y: number } | null;
}
