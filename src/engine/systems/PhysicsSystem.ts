import { World, EntityId } from '../types';
import { Position, Velocity, Thruster, CelestialBody, OrbitalPrimary, ShipSystems, COMPONENT } from '../components';
import { gravitationalAcceleration } from '../../utils/OrbitalMechanics';

export class PhysicsSystem {
  update(world: World, dt: number): void {
    // Build list of celestial bodies with entity ids (for moon primary lookup)
    const bodyEntities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    const bodies: { entityId: EntityId; x: number; y: number; mass: number; radius: number; bodyType: string }[] = [];
    for (const bodyId of bodyEntities) {
      const pos = world.getComponent<Position>(bodyId, COMPONENT.Position)!;
      const body = world.getComponent<CelestialBody>(bodyId, COMPONENT.CelestialBody)!;
      bodies.push({ entityId: bodyId, x: pos.x, y: pos.y, mass: body.mass, radius: body.radius, bodyType: body.bodyType });
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
    bodies: { entityId: EntityId; x: number; y: number; mass: number; radius: number; bodyType: string }[],
  ): void {
    const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity)!;
    const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster);
    const orbitalPrimary = world.getComponent<OrbitalPrimary>(entityId, COMPONENT.OrbitalPrimary);

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

    // Gravity rules:
    // - Moons (OrbitalPrimary): feel primary's gravity at own position (local orbit)
    //   + gravity from all other bodies at the PRIMARY's position (rides along with
    //   primary's stellar orbit without tidal forces destabilizing the moon)
    // - Other celestial bodies (planets): full n-body gravity from all other bodies
    // - Ships, missiles, projectiles: gravity from planets/moons but NOT stars
    //   (star gravity overwhelms ship thrust in compact systems)
    if (orbitalPrimary) {
      const primary = bodies.find((b) => b.entityId === orbitalPrimary.primaryId);
      if (primary) {
        // Local orbit: gravity from primary at moon's position
        const local = gravitationalAcceleration(pos.x, pos.y, primary.x, primary.y, primary.mass, primary.radius);
        vel.vx += local.ax * dt;
        vel.vy += local.ay * dt;
        // Ride-along: match primary's acceleration from all other bodies
        for (const body of bodies) {
          if (body.entityId === orbitalPrimary.primaryId || body.entityId === entityId) continue;
          const ride = gravitationalAcceleration(primary.x, primary.y, body.x, body.y, body.mass, body.radius);
          vel.vx += ride.ax * dt;
          vel.vy += ride.ay * dt;
        }
      }
    } else {
      const effectiveBodies = world.hasComponent(entityId, COMPONENT.CelestialBody)
        ? bodies.filter((b) => b.entityId !== entityId)
        : bodies.filter((b) => b.bodyType !== 'star');
      for (const body of effectiveBodies) {
        const { ax, ay } = gravitationalAcceleration(pos.x, pos.y, body.x, body.y, body.mass, body.radius);
        vel.vx += ax * dt;
        vel.vy += ay * dt;
      }
    }

    // Update position
    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;
  }
}
