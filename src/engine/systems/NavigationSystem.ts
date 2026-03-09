import { World, EntityId } from '../types';
import {
  Position, Velocity, Thruster, NavigationOrder, RotationState,
  COMPONENT,
} from '../components';
import { shortestAngleDelta, normalizeAngle } from '../../game/TrajectoryCalculator';

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
        this.handleRotating(nav, rot, thruster, dt, gameTime);
        break;
      case 'accelerating':
        this.handleAccelerating(nav, rot, thruster, gameTime);
        break;
      case 'flipping':
        this.handleFlipping(nav, rot, thruster, dt, gameTime);
        break;
      case 'decelerating':
        this.handleDecelerating(nav, thruster);
        break;
      case 'arrived':
        thruster.throttle = 0;
        break;
    }
  }

  private handleRotating(
    nav: NavigationOrder, rot: RotationState, thruster: Thruster,
    dt: number, gameTime: number,
  ): void {
    thruster.throttle = 0;
    rot.targetAngle = nav.burnPlan.burnDirection;
    const rotated = this.rotateToward(rot, thruster.rotationSpeed, dt);

    if (rotated) {
      nav.phase = 'accelerating';
      nav.phaseStartTime = gameTime;
      rot.rotating = false;
    }
  }

  private handleAccelerating(
    nav: NavigationOrder, rot: RotationState, thruster: Thruster,
    gameTime: number,
  ): void {
    thruster.thrustAngle = nav.burnPlan.burnDirection;
    thruster.throttle = 1;
    rot.currentAngle = nav.burnPlan.burnDirection;

    const elapsed = gameTime - nav.phaseStartTime;
    if (elapsed >= nav.burnPlan.accelTime) {
      nav.phase = 'flipping';
      nav.phaseStartTime = gameTime;
      thruster.throttle = 0;
    }
  }

  private handleFlipping(
    nav: NavigationOrder, rot: RotationState, thruster: Thruster,
    dt: number, gameTime: number,
  ): void {
    thruster.throttle = 0;
    rot.targetAngle = nav.burnPlan.flipAngle;
    const rotated = this.rotateToward(rot, thruster.rotationSpeed, dt);

    if (rotated) {
      nav.phase = 'decelerating';
      nav.phaseStartTime = gameTime;
      rot.rotating = false;
    }
  }

  private handleDecelerating(
    nav: NavigationOrder, thruster: Thruster,
  ): void {
    thruster.thrustAngle = nav.burnPlan.flipAngle;
    thruster.throttle = 1;
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
