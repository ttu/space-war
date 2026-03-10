import { World, EntityId } from '../types';
import {
  Position, Velocity, Thruster, Facing, NavigationOrder, RotationState,
  COMPONENT,
} from '../components';
import { shortestAngleDelta, normalizeAngle } from '../../game/TrajectoryCalculator';

const ALIGNMENT_THRESHOLD = 0.05; // radians — close enough to "aligned"
const ARRIVAL_SPEED_THRESHOLD = 0.5; // km/s — slow enough to consider stopped
const FLIP_MARGIN = 1.15; // flip slightly early to avoid overshoot

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
    world: World, entityId: EntityId, dt: number, gameTime: number,
  ): void {
    const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity)!;
    const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster)!;
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder)!;
    const rot = world.getComponent<RotationState>(entityId, COMPONENT.RotationState)!;

    // Check arrival: close to target and slow enough
    const dx = nav.targetX - pos.x;
    const dy = nav.targetY - pos.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);

    if (distToTarget < nav.arrivalThreshold && speed < ARRIVAL_SPEED_THRESHOLD) {
      this.arrive(world, entityId, thruster);
      return;
    }

    switch (nav.phase) {
      case 'rotating':
        this.handleRotating(nav, pos, vel, rot, thruster, dt, gameTime);
        break;
      case 'accelerating':
        this.handleAccelerating(nav, pos, vel, rot, thruster, distToTarget, speed, gameTime);
        break;
      case 'flipping':
        this.handleFlipping(nav, vel, rot, thruster, dt, gameTime);
        break;
      case 'decelerating':
        this.handleDecelerating(nav, pos, vel, rot, thruster, distToTarget, speed, gameTime);
        break;
      case 'arrived':
        thruster.throttle = 0;
        break;
    }

    // Sync Facing component if present
    const facing = world.getComponent<Facing>(entityId, COMPONENT.Facing);
    if (facing) {
      facing.angle = rot.currentAngle;
    }
  }

  private handleRotating(
    nav: NavigationOrder, pos: Position, _vel: Velocity,
    rot: RotationState, thruster: Thruster,
    dt: number, gameTime: number,
  ): void {
    thruster.throttle = 0;

    // Continuously recalculate burn direction from current state (ship drifts during rotation)
    const dx = nav.targetX - pos.x;
    const dy = nav.targetY - pos.y;
    nav.burnPlan.burnDirection = normalizeAngle(Math.atan2(dy, dx));
    nav.burnPlan.flipAngle = normalizeAngle(nav.burnPlan.burnDirection + Math.PI);

    rot.targetAngle = nav.burnPlan.burnDirection;
    const rotated = this.rotateToward(rot, thruster.rotationSpeed, dt);

    if (rotated) {
      nav.phase = 'accelerating';
      nav.phaseStartTime = gameTime;
      rot.rotating = false;
    }
  }

  private handleAccelerating(
    nav: NavigationOrder, pos: Position, _vel: Velocity,
    rot: RotationState, thruster: Thruster,
    distToTarget: number, speed: number, gameTime: number,
  ): void {
    // Continuously update thrust direction toward target
    const dx = nav.targetX - pos.x;
    const dy = nav.targetY - pos.y;
    const dirToTarget = normalizeAngle(Math.atan2(dy, dx));

    nav.burnPlan.burnDirection = dirToTarget;
    nav.burnPlan.flipAngle = normalizeAngle(dirToTarget + Math.PI);

    thruster.thrustAngle = dirToTarget;
    thruster.throttle = 1;
    rot.currentAngle = dirToTarget;

    // Dynamic flip decision: compare stopping distance to remaining distance
    const stoppingDist = (speed * speed) / (2 * thruster.maxThrust);

    if (stoppingDist * FLIP_MARGIN >= distToTarget) {
      nav.phase = 'flipping';
      nav.phaseStartTime = gameTime;
      thruster.throttle = 0;
    }
  }

  private handleFlipping(
    nav: NavigationOrder, vel: Velocity,
    rot: RotationState, thruster: Thruster,
    dt: number, gameTime: number,
  ): void {
    thruster.throttle = 0;

    // Flip to retrograde (opposite current velocity) to cancel all velocity components
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
    if (speed > 0.01) {
      const retrograde = normalizeAngle(Math.atan2(-vel.vy, -vel.vx));
      nav.burnPlan.flipAngle = retrograde;
    }

    rot.targetAngle = nav.burnPlan.flipAngle;
    const rotated = this.rotateToward(rot, thruster.rotationSpeed, dt);

    if (rotated) {
      nav.phase = 'decelerating';
      nav.phaseStartTime = gameTime;
      rot.rotating = false;
    }
  }

  private handleDecelerating(
    nav: NavigationOrder, pos: Position, vel: Velocity,
    rot: RotationState, thruster: Thruster,
    distToTarget: number, speed: number, gameTime: number,
  ): void {
    // Thrust retrograde (opposite to velocity) to cancel all velocity components
    if (speed > 0.01) {
      const retrograde = normalizeAngle(Math.atan2(-vel.vy, -vel.vx));
      thruster.thrustAngle = retrograde;
      rot.currentAngle = retrograde;
    }
    thruster.throttle = 1;

    // If we overshot or velocity is now pointing away from target and we're slow,
    // switch back to accelerating toward target
    if (speed < ARRIVAL_SPEED_THRESHOLD * 2 && distToTarget > nav.arrivalThreshold * 2) {
      const dx = nav.targetX - pos.x;
      const dy = nav.targetY - pos.y;
      nav.burnPlan.burnDirection = normalizeAngle(Math.atan2(dy, dx));
      nav.burnPlan.flipAngle = normalizeAngle(nav.burnPlan.burnDirection + Math.PI);
      nav.phase = 'rotating';
      nav.phaseStartTime = gameTime;
      thruster.throttle = 0;
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
