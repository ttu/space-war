import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { MissileSystem, DETONATION_RADIUS } from '../../../src/engine/systems/MissileSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import {
  Position, Velocity, Ship, Thruster, ThermalSignature,
  Missile, ContactTracker, Facing,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId, GameEvent } from '../../../src/engine/types';

/** Helper: create a target ship */
function createTargetShip(world: WorldImpl, opts: {
  x: number; y: number;
  vx?: number; vy?: number;
  faction: 'player' | 'enemy';
  baseSignature?: number;
  thrustMultiplier?: number;
  throttle?: number;
}): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Target', hullClass: 'cruiser', faction: opts.faction, flagship: false,
  });
  world.addComponent<Thruster>(id, {
    type: 'Thruster', maxThrust: 0.1, thrustAngle: 0, throttle: opts.throttle ?? 0, rotationSpeed: 0.5,
  });
  world.addComponent<ThermalSignature>(id, {
    type: 'ThermalSignature',
    baseSignature: opts.baseSignature ?? 50,
    thrustMultiplier: opts.thrustMultiplier ?? 200,
  });
  return id;
}

/** Helper: create a missile salvo entity */
function createMissile(world: WorldImpl, opts: {
  x: number; y: number;
  vx?: number; vy?: number;
  targetId: EntityId;
  faction: 'player' | 'enemy';
  fuel?: number;
  count?: number;
  armed?: boolean;
  seekerRange?: number;
  seekerSensitivity?: number;
}): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Facing>(id, {
    type: 'Facing', angle: 0,
  });
  world.addComponent<ThermalSignature>(id, {
    type: 'ThermalSignature', baseSignature: 100, thrustMultiplier: 500,
  });
  world.addComponent<Missile>(id, {
    type: 'Missile',
    targetId: opts.targetId,
    launcherFaction: opts.faction,
    count: opts.count ?? 6,
    fuel: opts.fuel ?? 60,
    accel: 0.5,
    seekerRange: opts.seekerRange ?? 5_000,
    seekerSensitivity: opts.seekerSensitivity ?? 1e-8,
    guidanceMode: 'sensor',
    armed: opts.armed ?? true,
    armingDistance: 5,
  });
  return id;
}

function createContactTracker(world: WorldImpl, faction: 'player' | 'enemy'): EntityId {
  const id = world.createEntity();
  world.addComponent<ContactTracker>(id, {
    type: 'ContactTracker', faction, contacts: new Map(),
  });
  return id;
}

describe('MissileSystem', () => {
  it('should steer missile toward target using actual position', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 10_000, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
    });

    createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.guidanceMode).toBe('seeker');
    expect(missile.fuel).toBeLessThan(60);
  });

  it('should switch to seeker mode when target lost from sensors but in seeker range', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, {
      x: 3_000, y: 0, faction: 'enemy', throttle: 1.0,
    });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.guidanceMode).toBe('seeker');
  });

  it('should go ballistic when target has no position (e.g. destroyed)', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 100_000, y: 0, faction: 'enemy', throttle: 0 });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);
    const missileBefore = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missileBefore.guidanceMode).toBe('seeker');

    world.removeComponent(targetId, COMPONENT.Position);
    system.update(world, 0.1, 10.1);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.guidanceMode).toBe('ballistic');
  });

  it('should consume fuel each tick', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 10_000, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', fuel: 10,
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 10_000, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.fuel).toBeCloseTo(9.9, 5);
  });

  it('should go ballistic when fuel runs out', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 10_000, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', fuel: 0.05,
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 10_000, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.fuel).toBe(0);
    expect(missile.guidanceMode).toBe('ballistic');
  });

  it('should emit MissileImpact and remove missile on direct hit', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);
    const events: GameEvent[] = [];
    eventBus.subscribe('MissileImpact', (e) => events.push(e));

    const targetId = createTargetShip(world, { x: 0.5, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 0.5, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('MissileImpact');
    expect(events[0].targetId).toBe(targetId);
    expect(events[0].data.missileCount).toBe(6);
    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(false);
  });

  it('should remove fuel-depleted ballistic missiles after timeout', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 100_000, y: 0, faction: 'enemy', throttle: 0 });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', fuel: 0,
    });
    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    missile.guidanceMode = 'ballistic';

    createContactTracker(world, 'player');

    // First update — not yet timed out
    system.update(world, 0.1, 10.0);
    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(true);

    // After 120+ seconds
    system.update(world, 0.1, 131.0);
    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(false);
  });

  it('should not detonate unarmed missile', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);
    const events: GameEvent[] = [];
    eventBus.subscribe('MissileImpact', (e) => events.push(e));

    const targetId = createTargetShip(world, { x: 0.5, y: 0, faction: 'enemy' });
    createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', armed: false,
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 0.5, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    expect(events.length).toBe(0);
  });
});
