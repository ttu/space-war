import { World, EntityId, GameEvent } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Hull, ShipSystems, PDC, Railgun, MissileLauncher, Missile,
  COMPONENT,
} from '../components';

const DAMAGE_PER_MISSILE = 15;

interface PendingRailgunHit {
  targetId: EntityId;
  damage: number;
  time: number;
}

interface PendingMissileImpact {
  targetId: EntityId;
  missileCount: number;
  time: number;
}

export class DamageSystem {
  private pendingRailgunHits: PendingRailgunHit[] = [];
  private pendingMissileImpacts: PendingMissileImpact[] = [];

  constructor(private eventBus: EventBus) {
    this.eventBus.subscribe('RailgunHit', (event: GameEvent) => {
      if (event.targetId) {
        this.pendingRailgunHits.push({
          targetId: event.targetId,
          damage: (event.data?.damage as number) ?? 0,
          time: event.time,
        });
      }
    });

    this.eventBus.subscribe('MissileImpact', (event: GameEvent) => {
      if (event.targetId) {
        this.pendingMissileImpacts.push({
          targetId: event.targetId,
          missileCount: (event.data?.missileCount as number) ?? 1,
          time: event.time,
        });
      }
    });
  }

  /**
   * Process queued RailgunHit and MissileImpact events.
   * Call after weapon systems in the game loop.
   */
  processHitEvents(world: World): void {
    for (const hit of this.pendingRailgunHits) {
      this.applyRailgunHit(world, hit.targetId, hit.damage, hit.time);
    }
    this.pendingRailgunHits.length = 0;

    for (const impact of this.pendingMissileImpacts) {
      this.applyMissileImpact(world, impact.targetId, impact.missileCount, impact.time);
    }
    this.pendingMissileImpacts.length = 0;
  }

  private applyRailgunHit(world: World, targetId: EntityId, damage: number, gameTime: number): void {
    const missile = world.getComponent<Missile>(targetId, COMPONENT.Missile);
    if (missile) {
      world.removeEntity(targetId);
      this.eventBus.emit({
        type: 'MissileIntercepted',
        time: gameTime,
        targetId,
        data: {},
      });
      return;
    }

    const hull = world.getComponent<Hull>(targetId, COMPONENT.Hull);
    if (!hull) return;

    this.applyHullDamage(world, targetId, hull, damage, gameTime);
  }

  private applyMissileImpact(world: World, targetId: EntityId, missileCount: number, gameTime: number): void {
    const hull = world.getComponent<Hull>(targetId, COMPONENT.Hull);
    if (!hull) return;

    const damage = DAMAGE_PER_MISSILE * missileCount;
    this.applyHullDamage(world, targetId, hull, damage, gameTime);
  }

  private applyHullDamage(world: World, targetId: EntityId, hull: Hull, damage: number, gameTime: number): void {
    const effective = Math.max(1, Math.floor(damage - hull.armor));
    hull.current = Math.max(0, hull.current - effective);

    // Optional subsystem damage (e.g. 30% chance to also hit a system)
    const systems = world.getComponent<ShipSystems>(targetId, COMPONENT.ShipSystems);
    if (systems && Math.random() < 0.3) {
      this.applySubsystemDamage(world, targetId, systems, effective, gameTime);
    }

    if (hull.current <= 0) {
      this.eventBus.emit({
        type: 'ShipDestroyed',
        time: gameTime,
        targetId,
        data: {},
      });
      world.removeEntity(targetId);
    }
  }

  private applySubsystemDamage(
    world: World,
    entityId: EntityId,
    systems: ShipSystems,
    amount: number,
    gameTime: number,
  ): void {
    const subsystems: ('reactor' | 'engines' | 'sensors')[] = ['reactor', 'engines', 'sensors'];
    const which = subsystems[Math.floor(Math.random() * subsystems.length)];
    const sub = systems[which];
    sub.current = Math.max(0, sub.current - amount);
    this.eventBus.emit({
      type: 'SystemDamaged',
      time: gameTime,
      entityId,
      data: { system: which, current: sub.current, max: sub.max },
    });

    // Optionally damage a random weapon (25% chance when damaging subsystems)
    if (Math.random() < 0.25) {
      this.damageRandomWeapon(world, entityId, amount);
    }
  }

  private damageRandomWeapon(world: World, entityId: EntityId, amount: number): void {
    const pdc = world.getComponent<PDC>(entityId, COMPONENT.PDC);
    const railgun = world.getComponent<Railgun>(entityId, COMPONENT.Railgun);
    const launcher = world.getComponent<MissileLauncher>(entityId, COMPONENT.MissileLauncher);
    const weapons: Array<{ integrity?: number }> = [];
    if (pdc) weapons.push(pdc);
    if (railgun) weapons.push(railgun);
    if (launcher) weapons.push(launcher);
    const withHealth = weapons.filter((w) => (w.integrity ?? 100) > 0);
    if (withHealth.length === 0) return;
    const w = withHealth[Math.floor(Math.random() * withHealth.length)];
    const prev = w.integrity ?? 100;
    w.integrity = Math.max(0, prev - amount);
  }
}
