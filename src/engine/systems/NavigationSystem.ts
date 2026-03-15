import { World, EntityId } from '../types';
import {
  Position, Velocity, Thruster, Facing, NavigationOrder, RotationState,
  CelestialBody, COMPONENT,
} from '../components';
import { shortestAngleDelta, normalizeAngle, computeBurnPlan } from '../../game/TrajectoryCalculator';
import { getBodiesFromWorld, getSafeWaypoints, segmentPassesThroughInterior } from '../../game/PlanetAvoidance';
import { circularOrbitSpeed } from '../../utils/OrbitalMechanics';

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

    // Sustained orbit phase: maintain circular orbit around target body
    if (nav.phase === 'orbiting' && nav.orbitTargetId != null && nav.orbitRadius != null) {
      this.updateOrbit(world, entityId, pos, vel, thruster, nav, rot, dt);
      return;
    }

    // Track moving orbit target: update destination to follow the planet
    if (nav.orbitTargetId != null && nav.orbitRadius != null) {
      const orbitPos = world.getComponent<Position>(nav.orbitTargetId, COMPONENT.Position);
      if (orbitPos) {
        const dx = pos.x - orbitPos.x;
        const dy = pos.y - orbitPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dist > 0 ? dx / dist : 1;
        const ny = dist > 0 ? dy / dist : 0;
        nav.destinationX = orbitPos.x + nx * nav.orbitRadius;
        nav.destinationY = orbitPos.y + ny * nav.orbitRadius;
        // If not currently detouring around another body, also update immediate target
        const atDestination =
          Math.abs(nav.targetX - nav.destinationX) < nav.arrivalThreshold * 2 ||
          (Math.abs(nav.targetX - nav.destinationX) < 1 && Math.abs(nav.targetY - nav.destinationY) < 1);
        if (atDestination) {
          nav.targetX = nav.destinationX;
          nav.targetY = nav.destinationY;
        }
      }
    }

    // In-flight course correction: avoid planets.
    // (1) Emergency: ship within caution radius of a body — must escape.
    // (2) Path check: any remaining path segment passes through a body's danger zone.
    // Uses dangerRadius (not planning radius) to avoid over-correcting pre-planned avoidance paths.
    const bodies = getBodiesFromWorld(world);
    let needCorrection = false;

    // Build remaining path segments: ship → target → waypoints → destination
    const pathPoints = [
      { x: pos.x, y: pos.y },
      { x: nav.targetX, y: nav.targetY },
      ...nav.waypoints,
      { x: nav.destinationX, y: nav.destinationY },
    ];

    for (const body of bodies) {
      // Skip avoidance for the orbit target body itself
      if (nav.orbitTargetId != null) {
        const orbitPos = world.getComponent<Position>(nav.orbitTargetId, COMPONENT.Position);
        if (orbitPos && Math.abs(body.x - orbitPos.x) < 1 && Math.abs(body.y - orbitPos.y) < 1) continue;
      }
      // Emergency: within caution radius
      const distToBody = Math.sqrt((pos.x - body.x) ** 2 + (pos.y - body.y) ** 2);
      if (distToBody < body.cautionRadius) {
        needCorrection = true;
        break;
      }
      // Check all remaining path segments against danger zone (tighter than planning radius)
      for (let i = 0; i < pathPoints.length - 1; i++) {
        if (segmentPassesThroughInterior(
          pathPoints[i].x, pathPoints[i].y,
          pathPoints[i + 1].x, pathPoints[i + 1].y,
          body.x, body.y, body.dangerRadius,
        )) {
          needCorrection = true;
          break;
        }
      }
      if (needCorrection) break;
    }
    if (needCorrection) {
      // Exclude orbit target from avoidance bodies for re-routing too
      const avoidBodies = nav.orbitTargetId != null
        ? bodies.filter(b => {
          const orbitPos = world.getComponent<Position>(nav.orbitTargetId!, COMPONENT.Position);
          return !orbitPos || Math.abs(b.x - orbitPos.x) >= 1 || Math.abs(b.y - orbitPos.y) >= 1;
        })
        : bodies;
      const waypoints = getSafeWaypoints(pos.x, pos.y, nav.destinationX, nav.destinationY, avoidBodies);
      if (waypoints.length > 0) {
        nav.targetX = waypoints[0].x;
        nav.targetY = waypoints[0].y;
        nav.waypoints = waypoints.slice(1).map(w => ({ x: w.x, y: w.y }));
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

    // Determine if the current target is intermediate (not the final stop)
    const atDestination =
      Math.abs(nav.targetX - nav.destinationX) < 1 &&
      Math.abs(nav.targetY - nav.destinationY) < 1;
    const isIntermediate = !atDestination || nav.waypoints.length > 0;

    // For intermediate waypoints: fly through (distance only, no speed check)
    // For final destination: stop (distance + speed check)
    if (isIntermediate && distToTarget < nav.arrivalThreshold) {
      if (atDestination && nav.waypoints.length > 0) {
        // Advance to next user waypoint
        const next = nav.waypoints.shift()!;
        nav.destinationX = next.x;
        nav.destinationY = next.y;
        nav.targetX = next.x;
        nav.targetY = next.y;
      } else if (nav.waypoints.length > 0) {
        // Arrived at an avoidance waypoint — advance to next queued waypoint
        const next = nav.waypoints.shift()!;
        nav.targetX = next.x;
        nav.targetY = next.y;
      } else {
        // Arrived at last avoidance waypoint — advance target to destination
        nav.targetX = nav.destinationX;
        nav.targetY = nav.destinationY;
      }
      nav.burnPlan = computeBurnPlan(
        pos.x, pos.y, vel.vx, vel.vy,
        nav.targetX, nav.targetY, thruster.maxThrust,
      );
      nav.phase = 'accelerating';
      return;
    }

    // For orbit orders, check arrival relative to the planet (which is moving)
    if (!isIntermediate && nav.orbitTargetId != null && nav.orbitRadius != null) {
      const orbitPos = world.getComponent<Position>(nav.orbitTargetId, COMPONENT.Position);
      const orbitVel = world.getComponent<Velocity>(nav.orbitTargetId, COMPONENT.Velocity);
      if (orbitPos) {
        const distToPlanet = Math.sqrt((pos.x - orbitPos.x) ** 2 + (pos.y - orbitPos.y) ** 2);
        // Close enough to orbit radius? Use relative speed to planet for arrival check.
        const relVx = vel.vx - (orbitVel?.vx ?? 0);
        const relVy = vel.vy - (orbitVel?.vy ?? 0);
        const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
        if (distToPlanet < nav.orbitRadius * 1.5 && relSpeed < ARRIVAL_SPEED_THRESHOLD * 4) {
          nav.phase = 'orbiting';
          return;
        }
      }
    }

    if (!isIntermediate && distToTarget < nav.arrivalThreshold && speed < ARRIVAL_SPEED_THRESHOLD) {
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
    // For intermediate waypoints, scale speed based on the turn angle at the waypoint.
    // turnFactor: 1 = straight ahead (full speed), 0 = U-turn (must nearly stop).
    const stoppingSpeed = Math.sqrt(2 * thruster.maxThrust * effectiveDist);
    let maxApproachSpeed: number;
    if (isIntermediate) {
      const nextX = (atDestination && nav.waypoints.length > 0) ? nav.waypoints[0].x : nav.destinationX;
      const nextY = (atDestination && nav.waypoints.length > 0) ? nav.waypoints[0].y : nav.destinationY;
      // Direction from current target to next target
      const toNextX = nextX - nav.targetX;
      const toNextY = nextY - nav.targetY;
      const toNextLen = Math.sqrt(toNextX * toNextX + toNextY * toNextY);
      if (toNextLen > 1) {
        // cos(turn angle) via dot product of approach dir and next-leg dir
        const cosAngle = (dirX * toNextX + dirY * toNextY) / toNextLen;
        // turnFactor: 1 for straight, 0 for U-turn
        const turnFactor = (1 + cosAngle) / 2;
        // Blend: gentle turns → maintain speed, sharp turns → slow to redirect
        maxApproachSpeed = stoppingSpeed + turnFactor * Math.max(0, speed - stoppingSpeed);
      } else {
        maxApproachSpeed = stoppingSpeed;
      }
    } else {
      maxApproachSpeed = stoppingSpeed;
    }

    // Desired velocity: toward target at approach speed
    // For orbit orders, include the planet's velocity so we match it on arrival
    let baseVx = 0;
    let baseVy = 0;
    if (nav.orbitTargetId != null) {
      const orbitVel = world.getComponent<Velocity>(nav.orbitTargetId, COMPONENT.Velocity);
      if (orbitVel) { baseVx = orbitVel.vx; baseVy = orbitVel.vy; }
    }
    const desiredVx = baseVx + dirX * maxApproachSpeed;
    const desiredVy = baseVy + dirY * maxApproachSpeed;

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
      // Rotate toward desired direction — apply partial thrust along current facing
      // to avoid drifting off-course while turning (prevents spiraling paths)
      const cosAlign = Math.cos(angleDelta);
      if (cosAlign > 0) {
        thruster.thrustAngle = rot.currentAngle;
        thruster.throttle = cosAlign;
      } else {
        thruster.throttle = 0;
      }
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

  /**
   * Maintain sustained circular orbit around the target body.
   * Computes desired orbital velocity (tangential) and corrects drift with thrust.
   */
  private updateOrbit(
    world: World, entityId: EntityId,
    pos: Position, vel: Velocity, thruster: Thruster,
    nav: NavigationOrder, rot: RotationState, dt: number,
  ): void {
    const targetPos = world.getComponent<Position>(nav.orbitTargetId!, COMPONENT.Position);
    const targetVel = world.getComponent<Velocity>(nav.orbitTargetId!, COMPONENT.Velocity);
    const targetBody = world.getComponent<CelestialBody>(nav.orbitTargetId!, COMPONENT.CelestialBody);
    if (!targetPos || !targetBody) {
      // Target destroyed or missing — stop orbiting
      this.arrive(world, entityId, thruster);
      return;
    }

    const orbitRadius = nav.orbitRadius!;
    const orbSpeed = circularOrbitSpeed(targetBody.mass, orbitRadius);

    // Planet velocity (planets orbit the star, so they move)
    const pvx = targetVel?.vx ?? 0;
    const pvy = targetVel?.vy ?? 0;

    // Vector from planet center to ship (relative)
    const rx = pos.x - targetPos.x;
    const ry = pos.y - targetPos.y;
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist < 1) return;

    // Radial unit vector (outward from planet)
    const radX = rx / dist;
    const radY = ry / dist;

    // Tangential unit vector (counter-clockwise)
    const tanX = -radY;
    const tanY = radX;

    // Desired position: on orbit circle at current angular position
    const desiredX = targetPos.x + radX * orbitRadius;
    const desiredY = targetPos.y + radY * orbitRadius;

    // Desired velocity: planet velocity + tangential orbital velocity + radial correction
    const radialError = dist - orbitRadius;
    // Gentle radial correction proportional to drift
    const radialCorrection = -radialError * 0.05;

    const desiredVx = pvx + tanX * orbSpeed + radX * radialCorrection;
    const desiredVy = pvy + tanY * orbSpeed + radY * radialCorrection;

    // Delta-v needed
    const dvx = desiredVx - vel.vx;
    const dvy = desiredVy - vel.vy;
    const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);

    if (dvMag < 0.01) {
      thruster.throttle = 0;
      // Update destination to track planet movement
      nav.destinationX = desiredX;
      nav.destinationY = desiredY;
      nav.targetX = desiredX;
      nav.targetY = desiredY;
      return;
    }

    const desiredAngle = normalizeAngle(Math.atan2(dvy, dvx));
    const angleDelta = Math.abs(shortestAngleDelta(rot.currentAngle, desiredAngle));

    if (angleDelta > ALIGNMENT_THRESHOLD) {
      thruster.throttle = 0;
      rot.targetAngle = desiredAngle;
      this.rotateToward(rot, thruster.rotationSpeed, dt);
    } else {
      // Thrust to correct, but limit to avoid overshooting
      thruster.thrustAngle = desiredAngle;
      thruster.throttle = Math.min(1, dvMag / (thruster.maxThrust * dt));
      rot.currentAngle = desiredAngle;
    }

    // Update destination to track planet movement
    nav.destinationX = desiredX;
    nav.destinationY = desiredY;
    nav.targetX = desiredX;
    nav.targetY = desiredY;

    // Sync Facing
    const facing = world.getComponent<Facing>(entityId, COMPONENT.Facing);
    if (facing) facing.angle = rot.currentAngle;
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
