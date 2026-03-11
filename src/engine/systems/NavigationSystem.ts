import { World, EntityId } from '../types';
import {
  Position, Velocity, Thruster, Facing, NavigationOrder, RotationState,
  COMPONENT,
} from '../components';
import { shortestAngleDelta, normalizeAngle, computeBurnPlan } from '../../game/TrajectoryCalculator';
import { getBodiesFromWorld, getSafeWaypoint, segmentPassesThroughInterior } from '../../game/PlanetAvoidance';

const ALIGNMENT_THRESHOLD = 0.05; // radians — close enough to "aligned"
const ARRIVAL_SPEED_THRESHOLD = 0.5; // km/s — slow enough to consider stopped

export class NavigationSystem {
  update(world: World, dt: number, gameTime: number): void {
    const entities = world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Thruster,
      COMPONENT.NavigationOrder, COMPONENT.RotationState,
    );

    for (const entityId of entities) {
      this.updateEntity(world, entityId, dt, gameTime);
    }
  }

  private updateEntity(
    world: World, entityId: EntityId, dt: number, _gameTime: number,
  ): void {
    const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity)!;
    const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster)!;
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder)!;
    const rot = world.getComponent<RotationState>(entityId, COMPONENT.RotationState)!;

    // In-flight course correction: avoid planets. (1) If within caution radius of any body, escape early.
    // (2) If path to current target passes through a body's interior, re-route to a safe waypoint.
    const bodies = getBodiesFromWorld(world);
    let needCorrection = false;
    for (const body of bodies) {
      const distToBody = Math.sqrt((pos.x - body.x) ** 2 + (pos.y - body.y) ** 2);
      if (distToBody < body.cautionRadius) {
        needCorrection = true;
        break;
      }
      if (segmentPassesThroughInterior(pos.x, pos.y, nav.targetX, nav.targetY, body.x, body.y, body.radius)) {
        needCorrection = true;
        break;
      }
    }
    if (needCorrection) {
      const safe = getSafeWaypoint(pos.x, pos.y, nav.targetX, nav.targetY, bodies);
      if (safe != null) {
        nav.targetX = safe.x;
        nav.targetY = safe.y;
        nav.burnPlan = computeBurnPlan(
          pos.x, pos.y,
          vel.vx, vel.vy,
          nav.targetX, nav.targetY,
          thruster.maxThrust,
        );
      }
    }

    // Check arrival: close to target and slow enough
    const dx = nav.targetX - pos.x;
    const dy = nav.targetY - pos.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);

    if (distToTarget < nav.arrivalThreshold && speed < ARRIVAL_SPEED_THRESHOLD) {
      this.arrive(world, entityId, thruster);
      return;
    }

    // Proportional navigation guidance:
    // Compute desired velocity (toward target, at speed that allows stopping at target)
    // Then thrust to correct the difference between current and desired velocity.
    const dirX = dx / distToTarget;
    const dirY = dy / distToTarget;

    // Maximum approach speed: the speed from which we can stop in the remaining distance
    // v = sqrt(2 * a * d), with a safety margin for rotation time
    const rotationTime = Math.PI / thruster.rotationSpeed;
    const rotationBuffer = speed * rotationTime * 0.5;
    const effectiveDist = Math.max(0, distToTarget - rotationBuffer);
    const maxApproachSpeed = Math.sqrt(2 * thruster.maxThrust * effectiveDist);

    // Desired velocity: toward target at approach speed
    const desiredVx = dirX * maxApproachSpeed;
    const desiredVy = dirY * maxApproachSpeed;

    // Delta-v: correction needed
    const dvx = desiredVx - vel.vx;
    const dvy = desiredVy - vel.vy;
    const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);

    if (dvMag < 0.01) {
      // On track, coast
      thruster.throttle = 0;
      nav.phase = 'accelerating';
      return;
    }

    // Desired thrust direction
    const desiredAngle = normalizeAngle(Math.atan2(dvy, dvx));

    // Update burn plan for projection rendering
    nav.burnPlan.burnDirection = desiredAngle;
    nav.burnPlan.flipAngle = normalizeAngle(desiredAngle + Math.PI);

    // Check if we need to rotate to the desired thrust direction
    const angleDelta = Math.abs(shortestAngleDelta(rot.currentAngle, desiredAngle));

    if (angleDelta > ALIGNMENT_THRESHOLD) {
      // Rotate toward desired direction — no thrust during rotation
      thruster.throttle = 0;
      rot.targetAngle = desiredAngle;
      this.rotateToward(rot, thruster.rotationSpeed, dt);
      nav.phase = 'rotating';
    } else {
      // Aligned — thrust!
      thruster.thrustAngle = desiredAngle;
      thruster.throttle = 1;
      rot.currentAngle = desiredAngle;

      // Determine phase for display: are we speeding up or slowing down?
      const velTowardTarget = vel.vx * dirX + vel.vy * dirY;
      nav.phase = velTowardTarget > maxApproachSpeed * 0.9 ? 'decelerating' : 'accelerating';
    }

    // Sync Facing component if present
    const facing = world.getComponent<Facing>(entityId, COMPONENT.Facing);
    if (facing) {
      facing.angle = rot.currentAngle;
    }
  }

  private arrive(world: World, entityId: EntityId, thruster: Thruster): void {
    thruster.throttle = 0;
    world.removeComponent(entityId, COMPONENT.NavigationOrder);
  }

  /**
   * Rotate currentAngle toward targetAngle at given speed.
   * Returns true if aligned (within threshold).
   */
  private rotateToward(rot: RotationState, speed: number, dt: number): boolean {
    const delta = shortestAngleDelta(rot.currentAngle, rot.targetAngle);
    const absDelta = Math.abs(delta);

    if (absDelta < ALIGNMENT_THRESHOLD) {
      rot.currentAngle = normalizeAngle(rot.targetAngle);
      rot.rotating = false;
      return true;
    }

    const step = speed * dt;
    if (step >= absDelta) {
      rot.currentAngle = normalizeAngle(rot.targetAngle);
      rot.rotating = false;
      return true;
    }

    rot.currentAngle = normalizeAngle(rot.currentAngle + Math.sign(delta) * step);
    rot.rotating = true;
    return false;
  }
}
