import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Projectile,
  COMPONENT,
} from '../components';

export class RailgunSystem {
  constructor(private eventBus?: EventBus) {}

  update(world: World, _dt: number, gameTime: number): void {
    const projectiles = world.query(COMPONENT.Position, COMPONENT.Projectile);
    const toRemove: EntityId[] = [];

    for (const projId of projectiles) {
      const pos = world.getComponent<Position>(projId, COMPONENT.Position)!;
      const proj = world.getComponent<Projectile>(projId, COMPONENT.Projectile)!;

      // Remove if projectile has exceeded its max range from spawn
      const travelDx = pos.x - proj.spawnX;
      const travelDy = pos.y - proj.spawnY;
      if (travelDx * travelDx + travelDy * travelDy > proj.maxRange * proj.maxRange) {
        toRemove.push(projId);
        continue;
      }

      const targetPos = world.getComponent<Position>(proj.targetId, COMPONENT.Position);
      if (!targetPos) {
        // Target destroyed — remove projectile
        toRemove.push(projId);
        continue;
      }

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
        continue;
      }

    }

    for (const id of toRemove) {
      world.removeEntity(id);
    }
  }
}
