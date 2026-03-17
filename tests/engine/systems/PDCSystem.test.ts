import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { PDCSystem } from '../../../src/engine/systems/PDCSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import {
  Position, Velocity, Ship, Missile, PDC, Facing, ThermalSignature,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId } from '../../../src/engine/types';

function createShipWithPDC(
  world: WorldImpl,
  opts: { x: number; y: number; faction: 'player' | 'enemy'; pdcRange?: number },
): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, { type: 'Velocity', vx: 0, vy: 0 });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Defender', hullClass: 'cruiser', faction: opts.faction, flagship: true,
  });
  world.addComponent<PDC>(id, {
    type: 'PDC',
    range: opts.pdcRange ?? 5,
    fireRate: 100,
    lastFiredTime: 0,
    damagePerHit: 1,
  });
  return id;
}

function createMissile(
  world: WorldImpl,
  opts: {
    x: number; y: number;
    targetId: EntityId;
    faction: 'player' | 'enemy';
    count?: number;
  },
): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, { type: 'Velocity', vx: 0, vy: 0 });
  world.addComponent<Facing>(id, { type: 'Facing', angle: 0 });
  world.addComponent<ThermalSignature>(id, {
    type: 'ThermalSignature', baseSignature: 100, thrustMultiplier: 500,
  });
  world.addComponent<Missile>(id, {
    type: 'Missile',
    targetId: opts.targetId,
    launcherFaction: opts.faction,
    count: opts.count ?? 3,
    fuel: 60,
    totalFuel: 60,
    accel: 0.5,
    seekerRange: 5_000,
    seekerSensitivity: 1e-8,
    guidanceMode: 'sensor',
    phase: 'boost',
    armed: true,
    armingDistance: 5,
    hitProbability: 0,
  });
  return id;
}

describe('PDCSystem', () => {
  it('decrements missile count when PDC engages hostile missile in range', () => {
    const world = new WorldImpl();
    const events: string[] = [];
    const eventBus = new EventBusImpl();
    eventBus.subscribe('MissileIntercepted', () => events.push('hit'));
    const system = new PDCSystem(eventBus);

    const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
    createMissile(world, {
      x: 3, y: 0, targetId: defenderId, faction: 'enemy', count: 50,
    });

    system.update(world, 0.1, 1.0);

    // With 10 rounds (fireRate=100, dt=0.1) and ~85% accuracy, expect some hits
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(10);
  });

  it('removes missile entity when count reaches zero and emits MissileIntercepted', () => {
    // With 100 rounds (fireRate=100, dt=1.0) and ~85% accuracy, 1 missile will certainly be hit
    const world = new WorldImpl();
    const events: { type: string; targetId?: EntityId }[] = [];
    const eventBus = new EventBusImpl();
    eventBus.subscribe('MissileIntercepted', (e) => events.push({ type: e.type, targetId: e.targetId }));

    const system = new PDCSystem(eventBus);
    const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
    const missileId = createMissile(world, {
      x: 2, y: 0, targetId: defenderId, faction: 'enemy', count: 1,
    });

    // Multiple ticks to ensure the single missile is hit (statistically near-certain)
    for (let i = 0; i < 5; i++) {
      system.update(world, 1.0, 1.0 + i);
    }

    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(false);
    expect(events.some((e) => e.type === 'MissileIntercepted')).toBe(true);
  });

  it('does not engage missiles that are friendly (same faction as PDC ship)', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new PDCSystem(eventBus);

    const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
    const missileId = createMissile(world, {
      x: 3, y: 0, targetId: defenderId, faction: 'player', count: 2,
    });

    system.update(world, 0.5, 1.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.count).toBe(2);
  });

  it('has reduced accuracy against fast-closing missiles', () => {
    // Run many trials to verify statistical hit rate
    const trials = 500;
    let totalKills = 0;
    for (let i = 0; i < trials; i++) {
      const world = new WorldImpl();
      const system = new PDCSystem();

      const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
      // Ship stationary
      world.getComponent<Velocity>(defenderId, COMPONENT.Velocity)!.vx = 0;

      const missileId = createMissile(world, {
        x: 3, y: 0, targetId: defenderId, faction: 'enemy', count: 10,
      });
      // Missile approaching at 80 km/s (high closing speed → lower accuracy)
      const mvel = world.getComponent<Velocity>(missileId, COMPONENT.Velocity)!;
      mvel.vx = -80;

      system.update(world, 0.1, 1.0);

      const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile);
      totalKills += missile ? (10 - missile.count) : 10;
    }

    const avgKills = totalKills / trials;
    // With 80 km/s closing speed: hitChance ≈ 0.85 * 1.0 - min(0.3, 80/100) = 0.85 - 0.24 = 0.61
    // Expected: ~6.1 kills out of 10 rounds. Should be well below 10 (the old 100% rate).
    expect(avgKills).toBeGreaterThan(3);   // not zero — PDCs still work
    expect(avgKills).toBeLessThan(9);      // noticeably below 100%
  });

  it('has higher accuracy against slow-closing missiles', () => {
    const trials = 500;
    let totalKills = 0;

    for (let i = 0; i < trials; i++) {
      const world = new WorldImpl();
      const system = new PDCSystem();

      const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
      const missileId = createMissile(world, {
        x: 3, y: 0, targetId: defenderId, faction: 'enemy', count: 10,
      });
      // Missile approaching at only 5 km/s
      const mvel = world.getComponent<Velocity>(missileId, COMPONENT.Velocity)!;
      mvel.vx = -5;

      system.update(world, 0.1, 1.0);

      const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile);
      totalKills += missile ? (10 - missile.count) : 10;
    }

    const avgKills = totalKills / trials;
    // With 5 km/s: hitChance ≈ 0.85 - 0.015 = 0.835 → ~8.35 kills out of 10
    expect(avgKills).toBeGreaterThan(7);
  });

  it('has reduced accuracy when PDC integrity is low', () => {
    const trials = 500;
    let totalKills = 0;

    for (let i = 0; i < trials; i++) {
      const world = new WorldImpl();
      const system = new PDCSystem();

      const defenderId = createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 10 });
      // Set PDC integrity to 30%
      world.getComponent<PDC>(defenderId, COMPONENT.PDC)!.integrity = 30;

      const missileId = createMissile(world, {
        x: 3, y: 0, targetId: defenderId, faction: 'enemy', count: 10,
      });
      // Stationary missile (0 closing speed)
      system.update(world, 0.1, 1.0);

      const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile);
      totalKills += missile ? (10 - missile.count) : 10;
    }

    const avgKills = totalKills / trials;
    // hitChance ≈ 0.85 * 0.3 - 0 = 0.255 → ~2.55 kills out of 10
    expect(avgKills).toBeGreaterThan(1);
    expect(avgKills).toBeLessThan(5);
  });

  it('does not engage missiles outside PDC range', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new PDCSystem(eventBus);

    createShipWithPDC(world, { x: 0, y: 0, faction: 'player', pdcRange: 5 });
    const missileId = createMissile(world, {
      x: 100, y: 0, targetId: 'dummy', faction: 'enemy', count: 2,
    });

    system.update(world, 0.5, 1.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.count).toBe(2);
  });
});
