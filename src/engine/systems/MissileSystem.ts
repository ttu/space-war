import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Velocity, Facing,
  Missile, ContactTracker,
  COMPONENT,
} from '../components';
import { missileHitProbability } from '../utils/FiringComputer';

export const DETONATION_RADIUS = 5; // km — proximity detonation (includes margin for gravity and discretization)
const NAV_CONSTANT = 4; // proportional navigation gain
const BALLISTIC_TIMEOUT = 120; // seconds before removing fuel-depleted missiles
const FUEL_RESERVE_FRACTION = 0.35; // fraction of total fuel reserved for terminal maneuvers
const TERMINAL_RANGE_SECONDS = 15; // enter terminal phase when estimated time-to-intercept is this many seconds
const COAST_THRUST_FRACTION = 0.3; // fraction of max thrust used for mid-course corrections during coast

/**
 * Minimum distance from point (tx, ty) to the segment from (ax, ay) to (bx, by).
 * Used to detect missile passing through target in one tick (tunneling).
 */
function pointToSegmentDistance(
  ax: number, ay: number,
  bx: number, by: number,
  tx: number, ty: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = tx - ax;
  const wy = ty - ay;
  const vv = vx * vx + vy * vy;
  const c1 = wx * vx + wy * vy;
  if (vv <= 1e-20) return Math.sqrt(wx * wx + wy * wy);
  let t = c1 / vv;
  if (t <= 0) return Math.sqrt(wx * wx + wy * wy);
  if (t >= 1) return Math.sqrt((tx - bx) ** 2 + (ty - by) ** 2);
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  return Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
}

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

      // Update fuel phase
      this.updatePhase(missile, vel, pos, targetData);

      // Apply guidance — full thrust during boost/terminal, reduced corrections during coast
      const canBurn = missile.guidanceMode !== 'ballistic'
        && missile.fuel > 0
        && targetData.position;

      if (canBurn) {
        const thrustFraction = missile.phase === 'coast' ? COAST_THRUST_FRACTION : 1.0;
        this.applyProportionalNavigation(vel, facing, pos, targetData.position!, targetData.velocity, missile, dt, thrustFraction);
        missile.fuel = Math.max(0, missile.fuel - dt * thrustFraction);
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

      // Update pre-computed hit probability
      if (targetData.truePosition) {
        const targetVelData = world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);
        missile.hitProbability = missileHitProbability(
          pos.x, pos.y,
          vel.vx, vel.vy,
          missile.accel, missile.fuel, missile.seekerRange,
          targetData.truePosition.x, targetData.truePosition.y,
          targetVelData?.vx ?? 0, targetVelData?.vy ?? 0,
        );
      } else {
        missile.hitProbability = 0;
      }

      // Check detonation: current position within radius OR path this tick passed through target.
      // We run after Physics so segment (prevX, prevY)->(x,y) is the actual path flown (includes gravity).
      if (missile.armed && targetData.truePosition) {
        const tx = targetData.truePosition.x;
        const ty = targetData.truePosition.y;
        const dx = pos.x - tx;
        const dy = pos.y - ty;
        const distNow = Math.sqrt(dx * dx + dy * dy);
        const prevX = pos.prevX ?? pos.x;
        const prevY = pos.prevY ?? pos.y;
        const distSegment = pointToSegmentDistance(prevX, prevY, pos.x, pos.y, tx, ty);
        if (distNow <= DETONATION_RADIUS || distSegment <= DETONATION_RADIUS) {
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

  /**
   * Manage fuel phases: boost → coast → terminal.
   * - Boost: burn to build closing speed, stop when fuel hits reserve threshold
   * - Coast: drift on momentum, no fuel consumed
   * - Terminal: re-engage thrust for final intercept maneuvers
   */
  private updatePhase(
    missile: Missile,
    vel: Velocity,
    missilePos: Position,
    targetData: TargetData,
  ): void {
    const reserveFuel = missile.totalFuel * FUEL_RESERVE_FRACTION;

    if (missile.phase === 'boost') {
      // Transition to coast when fuel drops to reserve level
      if (missile.fuel <= reserveFuel) {
        missile.phase = 'terminal'; // not enough to coast, go straight to terminal
      } else if (missile.fuel <= missile.totalFuel - reserveFuel) {
        // Boost budget (totalFuel - reserve) is spent — we used our boost allocation
        // This shouldn't happen since we check reserveFuel first, but as a safeguard
        missile.phase = 'coast';
      } else if (targetData.position) {
        // Check if we have good closing speed — can coast early
        const dx = targetData.position.x - missilePos.x;
        const dy = targetData.position.y - missilePos.y;
        const range = Math.sqrt(dx * dx + dy * dy);
        const relVx = (targetData.velocity?.vx ?? 0) - vel.vx;
        const relVy = (targetData.velocity?.vy ?? 0) - vel.vy;
        const closingSpeed = -(relVx * dx + relVy * dy) / (range || 1);

        // Coast once we're closing fast and used at least half the boost budget
        const boostBudget = missile.totalFuel - reserveFuel;
        const boostUsed = missile.totalFuel - missile.fuel;
        if (closingSpeed > 0.5 * missile.accel * boostBudget && boostUsed > boostBudget * 0.3) {
          missile.phase = 'coast';
        }
      }
    }

    if (missile.phase === 'coast' && targetData.position) {
      const dx = targetData.position.x - missilePos.x;
      const dy = targetData.position.y - missilePos.y;
      const range = Math.sqrt(dx * dx + dy * dy);
      const relVx = (targetData.velocity?.vx ?? 0) - vel.vx;
      const relVy = (targetData.velocity?.vy ?? 0) - vel.vy;
      const closingSpeed = -(relVx * dx + relVy * dy) / (range || 1);

      // Enter terminal phase based on time-to-intercept
      const timeToIntercept = closingSpeed > 0 ? range / closingSpeed : Infinity;
      if (timeToIntercept <= TERMINAL_RANGE_SECONDS || range < missile.seekerRange) {
        missile.phase = 'terminal';
      }
    }
  }

  private getTargetData(
    world: World, missile: Missile, _missilePos: Position,
  ): TargetData {
    const result: TargetData = { source: 'none', position: null, velocity: null, truePosition: null };

    // Get true target position (for detonation check)
    const targetPos = world.getComponent<Position>(missile.targetId, COMPONENT.Position);
    if (targetPos) {
      result.truePosition = { x: targetPos.x, y: targetPos.y };
    }

    // Use actual target position for guidance whenever target exists — otherwise we guide
    // toward stale sensor data and never get within seeker range of the real target.
    if (targetPos) {
      result.source = 'seeker';
      result.position = { x: targetPos.x, y: targetPos.y };
      const targetVel = world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);
      result.velocity = targetVel ? { vx: targetVel.vx, vy: targetVel.vy } : null;
      return result;
    }

    // Fall back to faction sensors only when target has no position (e.g. destroyed)
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
    thrustFraction: number = 1.0,
  ): void {
    const dx = targetPos.x - missilePos.x;
    const dy = targetPos.y - missilePos.y;
    const range = Math.sqrt(dx * dx + dy * dy);
    if (range < 1) return;

    // Actual LOS angle (pure PN — no prediction needed, PN naturally creates collision course)
    const losAngle = Math.atan2(dy, dx);

    // Relative velocity (target - missile)
    const relVx = (targetVel?.vx ?? 0) - vel.vx;
    const relVy = (targetVel?.vy ?? 0) - vel.vy;

    // Closing speed (positive = closing)
    const closingSpeed = -(relVx * dx + relVy * dy) / range;

    // LOS rotation rate
    const losRate = (dx * relVy - dy * relVx) / (range * range);

    const effectiveAccel = missile.accel * thrustFraction;

    let thrustAngle: number;
    if (closingSpeed < 0.5) {
      // Not closing — pure pursuit toward target to build closing speed
      thrustAngle = losAngle;
    } else {
      // True Proportional Navigation: use |closingSpeed| to prevent sign reversal
      // when transitioning from closing to receding (avoids steering away from target).
      const commandAccel = NAV_CONSTANT * Math.abs(closingSpeed) * losRate;
      const perpRatio = Math.max(-0.9, Math.min(0.9, commandAccel / effectiveAccel));
      thrustAngle = losAngle + Math.asin(perpRatio);
    }

    // Apply thrust
    vel.vx += Math.cos(thrustAngle) * effectiveAccel * dt;
    vel.vy += Math.sin(thrustAngle) * effectiveAccel * dt;

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
