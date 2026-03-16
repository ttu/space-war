import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import { Position, Hull, CelestialBody, COMPONENT } from '../components';
import { DANGER_ZONE_MULTIPLIER } from '../constants';

/** Hull damage per tick at the inner edge of the danger zone (surface). */
const MAX_DAMAGE_PER_TICK = 8;

export class CollisionSystem {
  constructor(private eventBus: EventBus) {}

  update(world: World): void {
    // Collect celestial bodies
    const bodyEntities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    const bodies: { id: EntityId; x: number; y: number; radius: number; name: string }[] = [];
    for (const id of bodyEntities) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      bodies.push({ id, x: pos.x, y: pos.y, radius: body.radius, name: body.name });
    }

    // Check all entities with Position + Velocity (ships, missiles, projectiles)
    const movableEntities = world.query(COMPONENT.Position, COMPONENT.Velocity);
    const toRemove: EntityId[] = [];

    for (const entityId of movableEntities) {
      // Skip celestial bodies themselves
      if (world.hasComponent(entityId, COMPONENT.CelestialBody)) continue;
      if (toRemove.includes(entityId)) continue;

      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;

      for (const body of bodies) {
        const dx = pos.x - body.x;
        const dy = pos.y - body.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dangerRadius = body.radius * DANGER_ZONE_MULTIPLIER;

        if (dist <= body.radius) {
          // Inside surface — instant destruction
          this.eventBus.emit({
            type: 'CelestialCollision',
            time: 0,
            entityId,
            data: { bodyName: body.name, collision: 'impact' },
          });
          toRemove.push(entityId);
          break;
        } else if (dist <= dangerRadius) {
          // In danger zone
          const hull = world.getComponent<Hull>(entityId, COMPONENT.Hull);
          if (hull) {
            // Ships take gradual damage — linear from MAX at surface to 0 at edge
            const proximity = 1 - (dist - body.radius) / (dangerRadius - body.radius);
            const damage = Math.ceil(MAX_DAMAGE_PER_TICK * proximity);
            hull.current = Math.max(0, hull.current - damage);

            if (hull.current <= 0) {
              this.eventBus.emit({
                type: 'CelestialCollision',
                time: 0,
                entityId,
                data: { bodyName: body.name, collision: 'atmosphere' },
              });
              toRemove.push(entityId);
              break;
            }
          } else {
            // Missiles/projectiles — instant destruction in danger zone
            this.eventBus.emit({
              type: 'CelestialCollision',
              time: 0,
              entityId,
              data: { bodyName: body.name, collision: 'atmosphere' },
            });
            toRemove.push(entityId);
            break;
          }
        }
      }
    }

    // Remove destroyed entities
    for (const id of toRemove) {
      world.removeEntity(id);
    }
  }
}
