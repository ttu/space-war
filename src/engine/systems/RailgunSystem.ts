import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Projectile,
  COMPONENT,
} from '../components';

/**
 * Minimum distance from point (tx, ty) to the segment from (ax, ay) to (bx, by).
 * Used to detect projectiles passing through targets in one tick (tunneling).
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
  if (vv <= 1e-20) return Math.sqrt(wx * wx + wy * wy);
  let t = (wx * vx + wy * vy) / vv;
  if (t <= 0) return Math.sqrt(wx * wx + wy * wy);
  if (t >= 1) return Math.sqrt((tx - bx) ** 2 + (ty - by) ** 2);
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  return Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
}

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

      // Check hit using both current distance AND segment from previous position.
      // Projectiles travel ~10 km/tick (100 km/s * 0.1s) but hitRadius is 0.5 km,
      // so point-only checks miss most hits (tunneling).
      const prevX = pos.prevX ?? pos.x;
      const prevY = pos.prevY ?? pos.y;
      const distSegment = pointToSegmentDistance(prevX, prevY, pos.x, pos.y, targetPos.x, targetPos.y);
      if (distSegment <= proj.hitRadius) {
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
