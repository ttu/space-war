import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { AIStrategicSystem } from '../../../src/engine/systems/AIStrategicSystem';
import {
  Position,
  Ship,
  Hull,
  ContactTracker,
  AIStrategicIntent,
  DetectedContact,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId } from '../../../src/engine/types';

function createEnemyShip(
  world: WorldImpl,
  x: number,
  y: number,
  hullCurrent: number,
  hullMax: number,
): EntityId {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position',
    x,
    y,
    prevX: x,
    prevY: y,
  });
  world.addComponent(id, { type: 'Velocity', vx: 0, vy: 0 });
  world.addComponent(id, {
    type: 'Ship',
    name: 'Enemy',
    hullClass: 'cruiser',
    faction: 'enemy',
    flagship: false,
  });
  world.addComponent(id, {
    type: 'Hull',
    current: hullCurrent,
    max: hullMax,
    armor: 5,
  });
  world.addComponent(id, {
    type: 'AIStrategicIntent',
    objective: 'hold',
    nextStrategicUpdate: 0,
  });
  return id;
}

describe('AIStrategicSystem', () => {
  it('sets disengage and retreat point when hull is below threshold', () => {
    const world = new WorldImpl();
    const system = new AIStrategicSystem();

    const enemyId = createEnemyShip(world, 1000, 0, 30, 100);

    const trackerId = world.createEntity();
    const contacts = new Map<EntityId, DetectedContact>();
    const playerId = 'player-ship';
    contacts.set(playerId, {
      entityId: playerId,
      lastKnownX: 5000,
      lastKnownY: 0,
      lastKnownVx: 0,
      lastKnownVy: 0,
      detectionTime: 0,
      receivedTime: 0,
      signalStrength: 1,
      lost: false,
      lostTime: 0,
    });
    world.addComponent(trackerId, {
      type: 'ContactTracker',
      faction: 'enemy',
      contacts,
    });

    system.update(world, 0.016, 1);

    const intent = world.getComponent<AIStrategicIntent>(enemyId, COMPONENT.AIStrategicIntent)!;
    expect(intent.objective).toBe('disengage');
    expect(intent.moveToX).toBeDefined();
    expect(intent.moveToY).toBeDefined();
    expect(intent.nextStrategicUpdate).toBe(4);
  });

  it('sets engage with target when hull is healthy and contacts exist', () => {
    const world = new WorldImpl();
    const system = new AIStrategicSystem();

    const enemyId = createEnemyShip(world, 0, 0, 100, 100);
    const playerId = world.createEntity();
    world.addComponent(playerId, {
      type: 'Position',
      x: 10000,
      y: 0,
      prevX: 10000,
      prevY: 0,
    });
    world.addComponent(playerId, { type: 'Velocity', vx: 0, vy: 0 });

    const trackerId = world.createEntity();
    const contacts = new Map<EntityId, DetectedContact>();
    contacts.set(playerId, {
      entityId: playerId,
      lastKnownX: 10000,
      lastKnownY: 0,
      lastKnownVx: 0,
      lastKnownVy: 0,
      detectionTime: 0,
      receivedTime: 0,
      signalStrength: 1,
      lost: false,
      lostTime: 0,
    });
    world.addComponent(trackerId, {
      type: 'ContactTracker',
      faction: 'enemy',
      contacts,
    });

    system.update(world, 0.016, 1);

    const intent = world.getComponent<AIStrategicIntent>(enemyId, COMPONENT.AIStrategicIntent)!;
    expect(intent.objective).toBe('engage');
    expect(intent.targetId).toBe(playerId);
    expect(intent.moveToX).toBe(10000);
    expect(intent.moveToY).toBe(0);
  });

  it('sets hold when no contacts', () => {
    const world = new WorldImpl();
    const system = new AIStrategicSystem();

    const enemyId = createEnemyShip(world, 0, 0, 100, 100);

    const trackerId = world.createEntity();
    world.addComponent(trackerId, {
      type: 'ContactTracker',
      faction: 'enemy',
      contacts: new Map(),
    });

    system.update(world, 0.016, 1);

    const intent = world.getComponent<AIStrategicIntent>(enemyId, COMPONENT.AIStrategicIntent)!;
    expect(intent.objective).toBe('hold');
    expect(intent.targetId).toBeUndefined();
    expect(intent.moveToX).toBeUndefined();
    expect(intent.moveToY).toBeUndefined();
  });

  it('skips re-evaluation until nextStrategicUpdate', () => {
    const world = new WorldImpl();
    const system = new AIStrategicSystem();

    const enemyId = createEnemyShip(world, 0, 0, 100, 100);
    const intent = world.getComponent<AIStrategicIntent>(enemyId, COMPONENT.AIStrategicIntent)!;
    intent.objective = 'engage';
    intent.targetId = 'some-id';
    intent.nextStrategicUpdate = 10;

    const trackerId = world.createEntity();
    world.addComponent(trackerId, {
      type: 'ContactTracker',
      faction: 'enemy',
      contacts: new Map(),
    });

    system.update(world, 0.016, 2);

    expect(intent.objective).toBe('engage');
    expect(intent.targetId).toBe('some-id');
  });
});
