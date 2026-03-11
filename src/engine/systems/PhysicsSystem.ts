import { World, EntityId } from '../types';
import { Position, Velocity, Thruster, CelestialBody, OrbitalPrimary, ShipSystems, COMPONENT } from '../components';
import { gravitationalAcceleration } from '../../utils/OrbitalMechanics';

export class PhysicsSystem {
  update(world: World, dt: number): void {
    // Build list of celestial bodies with entity ids (for moon primary lookup)
    const bodyEntities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    const bodies: { entityId: EntityId; x: number; y: number; mass: number; radius: number }[] = [];
    for (const bodyId of bodyEntities) {
      const pos = world.getComponent<Position>(bodyId, COMPONENT.Position)!;
      const body = world.getComponent<CelestialBody>(bodyId, COMPONENT.CelestialBody)!;
      bodies.push({ entityId: bodyId, x: pos.x, y: pos.y, mass: body.mass, radius: body.radius });
    }

    // Update all entities with Position + Velocity
    const movableEntities = world.query(COMPONENT.Position, COMPONENT.Velocity);

    for (const entityId of movableEntities) {
      this.updateEntity(world, entityId, dt, bodies);
    }
  }

  private updateEntity(
    world: World,
    entityId: EntityId,
    dt: number,
    bodies: { entityId: EntityId; x: number; y: number; mass: number; radius: number }[],
  ): void {
    const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity)!;
    const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster);
    const orbitalPrimary = world.getComponent<OrbitalPrimary>(entityId, COMPONENT.OrbitalPrimary);

    // Moons only feel gravity from their primary; others feel all bodies
    const gravityBodies = orbitalPrimary
      ? bodies.filter((b) => b.entityId === orbitalPrimary.primaryId)
      : bodies;

    // Save previous position for interpolation
    pos.prevX = pos.x;
    pos.prevY = pos.y;

    // Apply thrust acceleration (scaled by engines health if ShipSystems present)
    if (thruster && thruster.throttle > 0) {
      let thrustMultiplier = 1;
      const systems = world.getComponent<ShipSystems>(entityId, COMPONENT.ShipSystems);
      if (systems && systems.engines.max > 0) {
        thrustMultiplier = systems.engines.current / systems.engines.max;
      }
      const accel = thruster.maxThrust * thruster.throttle * thrustMultiplier;
      vel.vx += Math.cos(thruster.thrustAngle) * accel * dt;
      vel.vy += Math.sin(thruster.thrustAngle) * accel * dt;
    }

    // Apply gravity from relevant celestial bodies
    for (const body of gravityBodies) {
      const { ax, ay } = gravitationalAcceleration(pos.x, pos.y, body.x, body.y, body.mass);
      vel.vx += ax * dt;
      vel.vy += ay * dt;
    }

    // Update position
    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;
  }
}
