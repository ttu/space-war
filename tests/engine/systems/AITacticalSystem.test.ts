import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { AITacticalSystem } from '../../../src/engine/systems/AITacticalSystem';
import { CommandHandler } from '../../../src/game/CommandHandler';
import {
  Position,
  Velocity,
  Ship,
  Thruster,
  Hull,
  NavigationOrder,
  AIStrategicIntent,
  ContactTracker,
  MissileLauncher,
  Railgun,
  DetectedContact,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId } from '../../../src/engine/types';

function createEnemyShipWithWeapons(
  world: WorldImpl,
  x: number,
  y: number,
  intent: AIStrategicIntent,
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
  world.addComponent(id, { type: 'Hull', current: 100, max: 100, armor: 5 });
  world.addComponent(id, {
    type: 'Thruster',
    maxThrust: 0.5,
    thrustAngle: 0,
    throttle: 0,
    rotationSpeed: Math.PI / 2,
  });
  world.addComponent(id, {
    type: 'RotationState',
    currentAngle: 0,
    targetAngle: 0,
    rotating: false,
  });
  world.addComponent(id, intent);
  world.addComponent(id, {
    type: 'MissileLauncher',
    salvoSize: 2,
    reloadTime: 5,
    lastFiredTime: -10,
    maxRange: 5000,
    missileAccel: 2,
    ammo: 10,
    seekerRange: 500,
    seekerSensitivity: 0.1,
  });
  world.addComponent(id, {
    type: 'Railgun',
    projectileSpeed: 100,
    maxRange: 1000,
    reloadTime: 2,
    lastFiredTime: 0,
    damage: 20,
    ammo: 50,
    maxAmmo: 50,
  });
  return id;
}

describe('AITacticalSystem', () => {
  it('issues move order when disengage and no nav order', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const commandHandler = new CommandHandler(world, eventBus);
    const system = new AITacticalSystem(eventBus);

    const enemyId = createEnemyShipWithWeapons(world, 0, 0, {
      type: 'AIStrategicIntent',
      objective: 'disengage',
      moveToX: 5000,
      moveToY: 0,
      nextStrategicUpdate: 10,
    });

    system.update(world, 0.016, 1);

    const nav = world.getComponent<NavigationOrder>(enemyId, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    expect(nav!.targetX).toBe(5000);
    expect(nav!.targetY).toBe(0);
  });

  it('does not overwrite retreat nav order when disengage and already has nav', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const commandHandler = new CommandHandler(world, eventBus);
    const system = new AITacticalSystem(eventBus);

    const enemyId = createEnemyShipWithWeapons(world, 0, 0, {
      type: 'AIStrategicIntent',
      objective: 'disengage',
      moveToX: 5000,
      moveToY: 0,
      nextStrategicUpdate: 10,
    });

    commandHandler.issueMoveToForShip(enemyId, 5000, 0);
    const navBefore = world.getComponent<NavigationOrder>(enemyId, COMPONENT.NavigationOrder)!;

    system.update(world, 0.016, 1);

    const navAfter = world.getComponent<NavigationOrder>(enemyId, COMPONENT.NavigationOrder);
    expect(navAfter).toBeDefined();
    expect(navAfter!.targetX).toBe(navBefore.targetX);
    expect(navAfter!.targetY).toBe(navBefore.targetY);
  });

  it('issues move toward target when engage and no nav order', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const commandHandler = new CommandHandler(world, eventBus);
    const system = new AITacticalSystem(eventBus);

    const playerId = world.createEntity();
    world.addComponent(playerId, {
      type: 'Position',
      x: 2000,
      y: 0,
      prevX: 2000,
      prevY: 0,
    });
    world.addComponent(playerId, { type: 'Velocity', vx: 0, vy: 0 });

    const trackerId = world.createEntity();
    const contacts = new Map<EntityId, DetectedContact>();
    contacts.set(playerId, {
      entityId: playerId,
      lastKnownX: 2000,
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

    const enemyId = createEnemyShipWithWeapons(world, 0, 0, {
      type: 'AIStrategicIntent',
      objective: 'engage',
      targetId: playerId,
      moveToX: 2000,
      moveToY: 0,
      nextStrategicUpdate: 10,
    });

    system.update(world, 0.016, 1);

    const nav = world.getComponent<NavigationOrder>(enemyId, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    expect(nav!.targetX).toBe(2000);
    expect(nav!.targetY).toBe(0);
  });

  it('launches missile when engage, in range, and target exists', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const commandHandler = new CommandHandler(world, eventBus);
    const system = new AITacticalSystem(eventBus);

    const playerId = world.createEntity();
    world.addComponent(playerId, {
      type: 'Position',
      x: 500,
      y: 0,
      prevX: 500,
      prevY: 0,
    });
    world.addComponent(playerId, { type: 'Velocity', vx: 0, vy: 0 });

    const trackerId = world.createEntity();
    const contacts = new Map<EntityId, DetectedContact>();
    contacts.set(playerId, {
      entityId: playerId,
      lastKnownX: 500,
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

    const enemyId = createEnemyShipWithWeapons(world, 0, 0, {
      type: 'AIStrategicIntent',
      objective: 'engage',
      targetId: playerId,
      moveToX: 500,
      moveToY: 0,
      nextStrategicUpdate: 10,
    });

    const missilesBefore = world.query(COMPONENT.Missile).length;
    system.update(world, 0.016, 1);
    const missilesAfter = world.query(COMPONENT.Missile).length;

    expect(missilesAfter).toBe(missilesBefore + 1);
  });
});
