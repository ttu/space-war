import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Velocity, Projectile,
  COMPONENT,
} from '../components';

export class RailgunSystem {
  constructor(private eventBus?: EventBus) {}

  update(world: World, dt: number, gameTime: number): void {
    const projectiles = world.query(COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Projectile);
    const toRemove: EntityId[] = [];

    for (const projId of projectiles) {
      const pos = world.getComponent<Position>(projId, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(projId, COMPONENT.Velocity)!;
      const proj = world.getComponent<Projectile>(projId, COMPONENT.Projectile)!;

      pos.prevX = pos.x;
      pos.prevY = pos.y;
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;

      const targetPos = world.getComponent<Position>(proj.targetId, COMPONENT.Position);
      if (targetPos) {
        const dx = pos.x - targetPos.x;
        const dy = pos.y - targetPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= proj.hitRadius) {
          this.eventBus?.emit({
            type: 'RailgunHit',
            time: gameTime,
            entityId: projId,
            targetId: proj.targetId,
            data: { damage: proj.damage, faction: proj.faction },
          });
          toRemove.push(projId);
        }
      }
    }

    for (const id of toRemove) {
      world.removeEntity(id);
    }
  }
}
