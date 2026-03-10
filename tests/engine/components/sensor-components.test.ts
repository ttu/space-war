import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import {
  SensorArray,
  ContactTracker,
  COMPONENT,
} from '../../../src/engine/components';

describe('Sensor Components', () => {
  it('should add SensorArray to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const sensor: SensorArray = {
      type: 'SensorArray',
      maxRange: 500_000,
      sensitivity: 1e-12,
    };
    world.addComponent(id, sensor);
    const retrieved = world.getComponent<SensorArray>(id, COMPONENT.SensorArray);
    expect(retrieved).toBeDefined();
    expect(retrieved!.maxRange).toBe(500_000);
    expect(retrieved!.sensitivity).toBe(1e-12);
  });

  it('should add ContactTracker to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const tracker: ContactTracker = {
      type: 'ContactTracker',
      faction: 'player',
      contacts: new Map(),
    };
    world.addComponent(id, tracker);
    const retrieved = world.getComponent<ContactTracker>(id, COMPONENT.ContactTracker);
    expect(retrieved).toBeDefined();
    expect(retrieved!.faction).toBe('player');
    expect(retrieved!.contacts.size).toBe(0);
  });

  it('should store DetectedContact in ContactTracker', () => {
    const tracker: ContactTracker = {
      type: 'ContactTracker',
      faction: 'player',
      contacts: new Map(),
    };
    tracker.contacts.set('e_5', {
      entityId: 'e_5',
      lastKnownX: 100,
      lastKnownY: 200,
      lastKnownVx: 1.0,
      lastKnownVy: -0.5,
      detectionTime: 10.0,
      receivedTime: 10.3,
      signalStrength: 0.005,
      lost: false,
      lostTime: 0,
    });
    expect(tracker.contacts.get('e_5')!.lastKnownX).toBe(100);
    expect(tracker.contacts.get('e_5')!.lost).toBe(false);
  });
});
