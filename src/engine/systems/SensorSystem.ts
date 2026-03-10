import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Velocity, Ship, Thruster, ThermalSignature,
  SensorArray, ContactTracker, DetectedContact, ShipSystems,
  COMPONENT, Faction,
} from '../components';

export const LIGHT_SPEED = 299_792; // km/s

export class SensorSystem {
  constructor(
    private lostContactTimeout: number = 30,
    private eventBus?: EventBus,
  ) {}

  update(world: World, _dt: number, gameTime: number): void {
    const trackerEntities = world.query(COMPONENT.ContactTracker);

    for (const trackerEntityId of trackerEntities) {
      const tracker = world.getComponent<ContactTracker>(trackerEntityId, COMPONENT.ContactTracker)!;
      this.updateFaction(world, tracker, gameTime);
    }
  }

  private updateFaction(world: World, tracker: ContactTracker, gameTime: number): void {
    const sensorShips = this.getSensorShips(world, tracker.faction);
    const targets = this.getTargetShips(world, tracker.faction);
    const detectedThisTick = new Set<EntityId>();

    for (const target of targets) {
      const bestDetection = this.getBestDetection(sensorShips, target);

      if (bestDetection) {
        detectedThisTick.add(target.entityId);

        const isNew = !tracker.contacts.has(target.entityId);

        const lightDelay = bestDetection.distance / LIGHT_SPEED;
        const delayedX = target.pos.x - target.vel.vx * lightDelay;
        const delayedY = target.pos.y - target.vel.vy * lightDelay;

        const contact: DetectedContact = {
          entityId: target.entityId,
          lastKnownX: delayedX,
          lastKnownY: delayedY,
          lastKnownVx: target.vel.vx,
          lastKnownVy: target.vel.vy,
          detectionTime: gameTime - lightDelay,
          receivedTime: gameTime,
          signalStrength: bestDetection.signalStrength,
          lost: false,
          lostTime: 0,
        };

        tracker.contacts.set(target.entityId, contact);

        if (isNew && this.eventBus) {
          this.eventBus.emit({
            type: 'ShipDetected',
            time: gameTime,
            entityId: target.entityId,
            data: { faction: tracker.faction },
          });
        }
      }
    }

    // Mark undetected contacts as lost, remove expired ones
    for (const [entityId, contact] of tracker.contacts) {
      if (!detectedThisTick.has(entityId)) {
        if (!contact.lost) {
          contact.lost = true;
          contact.lostTime = gameTime;
          if (this.eventBus) {
            this.eventBus.emit({
              type: 'ShipLostContact',
              time: gameTime,
              entityId,
              data: { faction: tracker.faction },
            });
          }
        } else if (gameTime - contact.lostTime > this.lostContactTimeout) {
          tracker.contacts.delete(entityId);
        }
      }
    }
  }

  private getSensorShips(world: World, faction: Faction): SensorShipData[] {
    const entities = world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.SensorArray);
    const result: SensorShipData[] = [];

    for (const entityId of entities) {
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship)!;
      if (ship.faction !== faction) continue;

      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const sensor = world.getComponent<SensorArray>(entityId, COMPONENT.SensorArray)!;
      const systems = world.getComponent<ShipSystems>(entityId, COMPONENT.ShipSystems);

      let effectiveMaxRange = sensor.maxRange;
      let effectiveSensitivity = sensor.sensitivity;
      if (systems && systems.sensors.max > 0) {
        const factor = systems.sensors.current / systems.sensors.max;
        effectiveMaxRange = sensor.maxRange * factor;
        effectiveSensitivity = sensor.sensitivity / factor; // damaged = less sensitive (higher threshold)
      }

      result.push({ entityId, pos, sensor, effectiveMaxRange, effectiveSensitivity });
    }
    return result;
  }

  private getTargetShips(world: World, faction: Faction): TargetShipData[] {
    const entities = world.query(COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship, COMPONENT.ThermalSignature);
    const result: TargetShipData[] = [];

    for (const entityId of entities) {
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship)!;
      if (ship.faction === faction) continue;

      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity)!;
      const thermal = world.getComponent<ThermalSignature>(entityId, COMPONENT.ThermalSignature)!;
      const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster);
      const throttle = thruster?.throttle ?? 0;

      result.push({ entityId, pos, vel, thermal, throttle });
    }
    return result;
  }

  private getBestDetection(
    sensorShips: SensorShipData[],
    target: TargetShipData,
  ): { signalStrength: number; distance: number } | null {
    const effectiveSignature = target.thermal.baseSignature +
      target.throttle * target.thermal.thrustMultiplier;

    let bestSignal: { signalStrength: number; distance: number } | null = null;

    for (const sensor of sensorShips) {
      const dx = target.pos.x - sensor.pos.x;
      const dy = target.pos.y - sensor.pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > sensor.effectiveMaxRange) continue;
      if (distance < 1) continue; // avoid division by zero

      const signalStrength = effectiveSignature / (distance * distance);

      if (signalStrength > sensor.effectiveSensitivity) {
        if (!bestSignal || signalStrength > bestSignal.signalStrength) {
          bestSignal = { signalStrength, distance };
        }
      }
    }

    return bestSignal;
  }
}

interface SensorShipData {
  entityId: EntityId;
  pos: Position;
  sensor: SensorArray;
  effectiveMaxRange: number;
  effectiveSensitivity: number;
}

interface TargetShipData {
  entityId: EntityId;
  pos: Position;
  vel: Velocity;
  thermal: ThermalSignature;
  throttle: number;
}
