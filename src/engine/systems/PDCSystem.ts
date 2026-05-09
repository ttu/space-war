import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Velocity, Ship, PDC, Missile,
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

      if ((pdc.integrity ?? 100) <= 0) continue;

      const sx = pos.x;
      const sy = pos.y;
      const faction = ship.faction;
      const rangeSq = pdc.range * pdc.range;
      const roundsThisTick = Math.floor(pdc.fireRate * dt);

      const shipVel = world.getComponent<Velocity>(shipId, COMPONENT.Velocity);
      const svx = shipVel?.vx ?? 0;
      const svy = shipVel?.vy ?? 0;
      const integrityFactor = (pdc.integrity ?? 100) / 100;

      const hostileMissiles: { id: EntityId; distSq: number; closingSpeed: number }[] = [];
      for (const missileId of missiles) {
        const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
        if (missile.launcherFaction === faction) continue;
        const mpos = world.getComponent<Position>(missileId, COMPONENT.Position)!;
        const dx = mpos.x - sx;
        const dy = mpos.y - sy;
        const distSq = dx * dx + dy * dy;
        if (distSq <= rangeSq) {
          const mvel = world.getComponent<Velocity>(missileId, COMPONENT.Velocity);
          const rvx = (mvel?.vx ?? 0) - svx;
          const rvy = (mvel?.vy ?? 0) - svy;
          const closingSpeed = Math.sqrt(rvx * rvx + rvy * rvy);
          hostileMissiles.push({ id: missileId, distSq, closingSpeed });
        }
      }
      hostileMissiles.sort((a, b) => a.distSq - b.distSq);

      let roundsLeft = roundsThisTick;
      for (const { id: missileId, closingSpeed } of hostileMissiles) {
        if (roundsLeft <= 0) break;
        const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile);
        if (!missile || missile.count <= 0) continue;

        const baseAccuracy = 0.85;
        const closingSpeedPenalty = Math.min(0.3, closingSpeed / 100);
        const hitChance = Math.max(0, baseAccuracy * integrityFactor - closingSpeedPenalty);

        const startedRoundsLeft = roundsLeft;
        // Fire multiple rounds at this salvo until it's destroyed or we run out
        while (roundsLeft > 0 && missile.count > 0) {
          roundsLeft -= 1;
          if (Math.random() < hitChance) {
            missile.count -= 1;
            this.eventBus?.emit({
              type: 'MissileIntercepted',
              time: gameTime,
              entityId: shipId,
              targetId: missileId,
              data: { faction },
            });
          }
        }
        if (roundsLeft < startedRoundsLeft) {
          this.eventBus?.emit({
            type: 'PDCFiring',
            time: gameTime,
            entityId: shipId,
            targetId: missileId,
            data: { faction },
          });
        }
        if (missile.count <= 0) {
          toRemove.push(missileId);
        }
      }

      // Anti-ship strafe with leftover rounds. Picks the nearest hostile
      // ship inside shipRange — close-range chip damage to harass disabled
      // or hull-stripped enemies, never the primary kill weapon.
      if (roundsLeft > 0 && (pdc.shipRange ?? 0) > 0) {
        const shipRangeSq = pdc.shipRange! * pdc.shipRange!;
        const allShips = world.query(COMPONENT.Position, COMPONENT.Ship);
        let nearestEnemy: { id: EntityId; dist: number; closingSpeed: number } | null = null;
        for (const otherId of allShips) {
          if (otherId === shipId) continue;
          const otherShip = world.getComponent<Ship>(otherId, COMPONENT.Ship)!;
          if (otherShip.faction === faction) continue;
          const opos = world.getComponent<Position>(otherId, COMPONENT.Position)!;
          const dx = opos.x - sx;
          const dy = opos.y - sy;
          const distSq = dx * dx + dy * dy;
          if (distSq > shipRangeSq) continue;
          if (nearestEnemy && distSq >= nearestEnemy.dist * nearestEnemy.dist) continue;
          const ovel = world.getComponent<Velocity>(otherId, COMPONENT.Velocity);
          const rvx = (ovel?.vx ?? 0) - svx;
          const rvy = (ovel?.vy ?? 0) - svy;
          nearestEnemy = {
            id: otherId,
            dist: Math.sqrt(distSq),
            closingSpeed: Math.sqrt(rvx * rvx + rvy * rvy),
          };
        }
        if (nearestEnemy) {
          // Drop-off with range and target speed; PDCs aren't precision weapons
          // at km-scale ranges. Roughly 25–60% per round at typical ranges.
          const rangeFactor = 1 - nearestEnemy.dist / pdc.shipRange!;
          const speedPenalty = Math.min(0.4, nearestEnemy.closingSpeed / 200);
          const hitChance = Math.max(0.05, 0.6 * integrityFactor * rangeFactor - speedPenalty);
          let hits = 0;
          while (roundsLeft > 0) {
            roundsLeft -= 1;
            if (Math.random() < hitChance) hits += 1;
          }
          if (hits > 0) {
            this.eventBus?.emit({
              type: 'PDCHit',
              time: gameTime,
              entityId: shipId,
              targetId: nearestEnemy.id,
              data: { damage: hits * pdc.damagePerHit, hits, faction },
            });
          }
          this.eventBus?.emit({
            type: 'PDCFiring',
            time: gameTime,
            entityId: shipId,
            targetId: nearestEnemy.id,
            data: { faction },
          });
        }
      }
    }

    for (const id of toRemove) {
      world.removeEntity(id);
    }
  }
}
