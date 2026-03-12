import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Hull, ShipSystems, PDC, Railgun, MissileLauncher, Missile,
  COMPONENT,
} from '../components';

const DAMAGE_PER_MISSILE = 15;

export class DamageSystem {
  private lastProcessedIndex = 0;

  constructor(private eventBus: EventBus) {}

  /**
   * Process RailgunHit and MissileImpact events from the event bus since last call.
   * Call after weapon systems in the game loop.
   */
  processHitEvents(world: World): void {
    const history = this.eventBus.getHistory();
    for (let i = this.lastProcessedIndex; i < history.length; i++) {
      const e = history[i];
      if (e.type === 'RailgunHit' && e.targetId) {
        this.applyRailgunHit(world, e.targetId, (e.data?.damage as number) ?? 0, e.time);
      } else if (e.type === 'MissileImpact' && e.targetId) {
        const count = (e.data?.missileCount as number) ?? 1;
        this.applyMissileImpact(world, e.targetId, count);
      }
    }
    this.lastProcessedIndex = history.length;
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

    this.applyHullDamage(world, targetId, hull, damage);
  }

  private applyMissileImpact(world: World, targetId: EntityId, missileCount: number): void {
    const hull = world.getComponent<Hull>(targetId, COMPONENT.Hull);
    if (!hull) return;

    const damage = DAMAGE_PER_MISSILE * missileCount;
    this.applyHullDamage(world, targetId, hull, damage);
  }

  private applyHullDamage(world: World, targetId: EntityId, hull: Hull, damage: number): void {
    const effective = Math.max(1, Math.floor(damage - hull.armor));
    hull.current = Math.max(0, hull.current - effective);

    // Optional subsystem damage (e.g. 30% chance to also hit a system)
    const systems = world.getComponent<ShipSystems>(targetId, COMPONENT.ShipSystems);
    if (systems && Math.random() < 0.3) {
      this.applySubsystemDamage(world, targetId, systems, effective);
    }

    if (hull.current <= 0) {
      this.eventBus.emit({
        type: 'ShipDestroyed',
        time: 0,
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
  ): void {
    const subsystems: ('reactor' | 'engines' | 'sensors')[] = ['reactor', 'engines', 'sensors'];
    const which = subsystems[Math.floor(Math.random() * subsystems.length)];
    const sub = systems[which];
    sub.current = Math.max(0, sub.current - amount);
    this.eventBus.emit({
      type: 'SystemDamaged',
      time: 0,
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
