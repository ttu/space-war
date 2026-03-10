import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { SensorSystem, LIGHT_SPEED } from '../../../src/engine/systems/SensorSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import {
  Position, Velocity, Ship, Thruster, ThermalSignature,
  SensorArray, ContactTracker,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId, GameEvent } from '../../../src/engine/types';

/** Helper: create a ship entity with all needed components */
function createShip(world: WorldImpl, opts: {
  x: number; y: number;
  vx?: number; vy?: number;
  faction: 'player' | 'enemy';
  name?: string;
  maxThrust?: number; throttle?: number;
  baseSignature?: number; thrustMultiplier?: number;
  sensorMaxRange?: number; sensorSensitivity?: number;
}): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Ship>(id, {
    type: 'Ship',
    name: opts.name ?? 'Test Ship',
    hullClass: 'cruiser',
    faction: opts.faction,
    flagship: false,
  });
  world.addComponent<Thruster>(id, {
    type: 'Thruster',
    maxThrust: opts.maxThrust ?? 0.1,
    thrustAngle: 0,
    throttle: opts.throttle ?? 0,
    rotationSpeed: 0.5,
  });
  world.addComponent<ThermalSignature>(id, {
    type: 'ThermalSignature',
    baseSignature: opts.baseSignature ?? 50,
    thrustMultiplier: opts.thrustMultiplier ?? 200,
  });
  if (opts.sensorMaxRange !== undefined) {
    world.addComponent<SensorArray>(id, {
      type: 'SensorArray',
      maxRange: opts.sensorMaxRange,
      sensitivity: opts.sensorSensitivity ?? 1e-12,
    });
  }
  return id;
}

function createContactTracker(world: WorldImpl, faction: 'player' | 'enemy'): EntityId {
  const id = world.createEntity();
  world.addComponent<ContactTracker>(id, {
    type: 'ContactTracker',
    faction,
    contacts: new Map(),
  });
  return id;
}

describe('SensorSystem', () => {
  it('should detect an enemy ship within sensor range', () => {
    const world = new WorldImpl();
    const system = new SensorSystem();

    // Player sensor ship
    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    // Enemy with full thrust (high signature)
    createShip(world, {
      x: 100_000, y: 0, faction: 'enemy',
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });

    const trackerId = createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    expect(tracker.contacts.size).toBe(1);
  });

  it('should NOT detect a dark ship beyond max sensor range', () => {
    const world = new WorldImpl();
    const system = new SensorSystem();

    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    // Enemy going dark beyond max range
    createShip(world, {
      x: 600_000, y: 0, faction: 'enemy',
      throttle: 0, baseSignature: 50, thrustMultiplier: 200,
    });

    const trackerId = createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    expect(tracker.contacts.size).toBe(0);
  });

  it('should apply light-speed delay to contact position', () => {
    const world = new WorldImpl();
    const system = new SensorSystem();

    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    // Enemy moving at 2 km/s to the right, 100k km away
    const enemyId = createShip(world, {
      x: 100_000, y: 0, faction: 'enemy',
      vx: 2.0, vy: 0,
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });

    const trackerId = createContactTracker(world, 'player');
    const gameTime = 100.0;
    system.update(world, 0.1, gameTime);

    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    const contact = tracker.contacts.get(enemyId)!;

    // Light delay = 100000 / 299792 ≈ 0.3336 seconds
    const expectedDelay = 100_000 / LIGHT_SPEED;
    // Delayed position = current - velocity * delay
    const expectedX = 100_000 - 2.0 * expectedDelay;

    expect(contact.lastKnownX).toBeCloseTo(expectedX, 1);
    expect(contact.lastKnownY).toBeCloseTo(0, 1);
    expect(contact.receivedTime).toBeCloseTo(gameTime, 5);
    expect(contact.detectionTime).toBeCloseTo(gameTime - expectedDelay, 2);
  });

  it('should mark contact as lost when no longer detectable', () => {
    const world = new WorldImpl();
    const system = new SensorSystem();

    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    const enemyId = createShip(world, {
      x: 100_000, y: 0, faction: 'enemy',
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });

    const trackerId = createContactTracker(world, 'player');

    // First tick: detected
    system.update(world, 0.1, 10.0);
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    expect(tracker.contacts.size).toBe(1);
    expect(tracker.contacts.get(enemyId)!.lost).toBe(false);

    // Move enemy beyond max sensor range
    const pos = world.getComponent<Position>(enemyId, COMPONENT.Position)!;
    pos.x = 600_000;

    // Second tick: lost
    system.update(world, 0.1, 20.0);
    expect(tracker.contacts.get(enemyId)!.lost).toBe(true);
    expect(tracker.contacts.get(enemyId)!.lostTime).toBe(20.0);
  });

  it('should remove lost contacts after timeout', () => {
    const world = new WorldImpl();
    const system = new SensorSystem(30); // 30s timeout

    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    const enemyId = createShip(world, {
      x: 100_000, y: 0, faction: 'enemy',
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });

    const trackerId = createContactTracker(world, 'player');

    // Detect then lose
    system.update(world, 0.1, 10.0);
    const pos = world.getComponent<Position>(enemyId, COMPONENT.Position)!;
    pos.x = 600_000;
    system.update(world, 0.1, 20.0);

    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    expect(tracker.contacts.has(enemyId)).toBe(true);

    // After timeout
    system.update(world, 0.1, 51.0); // 51 - 20 = 31 > 30s timeout
    expect(tracker.contacts.has(enemyId)).toBe(false);
  });

  it('should detect thrusting ship but not dark ship at same range', () => {
    const world = new WorldImpl();
    const system = new SensorSystem();

    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 5e-9,
    });
    // Ship going dark at moderate range
    const darkShip = createShip(world, {
      x: 200_000, y: 0, faction: 'enemy',
      throttle: 0, baseSignature: 50, thrustMultiplier: 200,
    });
    // Ship thrusting at same range
    const thrustingShip = createShip(world, {
      x: 200_000, y: 1000, faction: 'enemy',
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });

    const trackerId = createContactTracker(world, 'player');
    system.update(world, 0.1, 10.0);

    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;

    // Dark ship: 50 / (200000^2) = 1.25e-9 < 5e-9 → NOT detected
    expect(tracker.contacts.has(darkShip)).toBe(false);
    // Thrusting ship: 250 / (200000^2) = 6.25e-9 > 5e-9 → detected
    expect(tracker.contacts.has(thrustingShip)).toBe(true);
  });

  it('should use best sensor from multiple friendly ships', () => {
    const world = new WorldImpl();
    const system = new SensorSystem();

    // Far sensor with low sensitivity
    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-8,
    });
    // Close sensor with high sensitivity
    createShip(world, {
      x: 80_000, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    // Enemy at 100k — close sensor is only 20k away
    createShip(world, {
      x: 100_000, y: 0, faction: 'enemy',
      throttle: 0, baseSignature: 50, thrustMultiplier: 200,
    });

    const trackerId = createContactTracker(world, 'player');
    system.update(world, 0.1, 10.0);

    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    // Close sensor: 50 / (20000^2) = 50/4e8 = 1.25e-7 > 1e-12 → detected
    expect(tracker.contacts.size).toBe(1);
  });

  it('should handle enemy faction detecting player ships', () => {
    const world = new WorldImpl();
    const system = new SensorSystem();

    // Player ship (target)
    createShip(world, {
      x: 0, y: 0, faction: 'player',
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });
    // Enemy sensor ship
    createShip(world, {
      x: 50_000, y: 0, faction: 'enemy',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });

    const trackerId = createContactTracker(world, 'enemy');
    system.update(world, 0.1, 10.0);

    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    expect(tracker.contacts.size).toBe(1);
  });

  it('should emit ShipDetected event when new contact appears', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new SensorSystem(30, eventBus);
    const events: GameEvent[] = [];
    eventBus.subscribe('ShipDetected', (e) => events.push(e));

    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    createShip(world, {
      x: 100_000, y: 0, faction: 'enemy',
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });
    createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('ShipDetected');
  });

  it('should emit ShipLostContact event when contact is lost', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new SensorSystem(30, eventBus);
    const events: GameEvent[] = [];
    eventBus.subscribe('ShipLostContact', (e) => events.push(e));

    createShip(world, {
      x: 0, y: 0, faction: 'player',
      sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
    });
    const enemyId = createShip(world, {
      x: 100_000, y: 0, faction: 'enemy',
      throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
    });
    createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    // Move beyond range
    const pos = world.getComponent<Position>(enemyId, COMPONENT.Position)!;
    pos.x = 600_000;
    system.update(world, 0.1, 20.0);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('ShipLostContact');
  });
});
