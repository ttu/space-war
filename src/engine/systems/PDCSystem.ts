import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Ship, PDC, Missile,
  COMPONENT,
} from '../components';

export class PDCSystem {
  constructor(private eventBus?: EventBus) {}

  update(world: World, dt: number, gameTime: number): void {
    const pdcShips = world.query(
      COMPONENT.Position,
      COMPONENT.Ship,
      COMPONENT.PDC,
    );
    const missiles = world.query(COMPONENT.Position, COMPONENT.Missile);
    const toRemove: EntityId[] = [];

    for (const shipId of pdcShips) {
      const ship = world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const pdc = world.getComponent<PDC>(shipId, COMPONENT.PDC)!;

      const sx = pos.x;
      const sy = pos.y;
      const faction = ship.faction;
      const rangeSq = pdc.range * pdc.range;
      const roundsThisTick = Math.floor(pdc.fireRate * dt);

      const hostileMissiles: { id: EntityId; distSq: number }[] = [];
      for (const missileId of missiles) {
        const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
        if (missile.launcherFaction === faction) continue;
        const mpos = world.getComponent<Position>(missileId, COMPONENT.Position)!;
        const dx = mpos.x - sx;
        const dy = mpos.y - sy;
        const distSq = dx * dx + dy * dy;
        if (distSq <= rangeSq) {
          hostileMissiles.push({ id: missileId, distSq });
        }
      }
      hostileMissiles.sort((a, b) => a.distSq - b.distSq);

      let roundsLeft = roundsThisTick;
      for (const { id: missileId } of hostileMissiles) {
        if (roundsLeft <= 0) break;
        const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile);
        if (!missile || missile.count <= 0) continue;
        missile.count -= 1;
        roundsLeft -= 1;
        this.eventBus?.emit({
          type: 'MissileIntercepted',
          time: gameTime,
          entityId: shipId,
          targetId: missileId,
          data: { faction },
        });
        if (missile.count <= 0) {
          toRemove.push(missileId);
        }
      }
    }

    for (const id of toRemove) {
      world.removeEntity(id);
    }
  }
}
