import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Velocity, Ship, Thruster, ThermalSignature,
  SensorArray, ContactTracker, DetectedContact, ShipSystems,
  CelestialBody,
  COMPONENT, Faction,
} from '../components';

export const LIGHT_SPEED = 299_792; // km/s

export class SensorSystem {
  constructor(
    private eventBus?: EventBus,
  ) {}

  update(world: World, _dt: number, gameTime: number): void {
    const occludingBodies = this.getOccludingBodies(world);
    const trackerEntities = world.query(COMPONENT.ContactTracker);

    for (const trackerEntityId of trackerEntities) {
      const tracker = world.getComponent<ContactTracker>(trackerEntityId, COMPONENT.ContactTracker)!;
      this.updateFaction(world, tracker, gameTime, occludingBodies);
    }
  }

  private updateFaction(world: World, tracker: ContactTracker, gameTime: number, occludingBodies: OccludingBody[]): void {
    const sensorShips = this.getSensorShips(world, tracker.faction);
    const targets = this.getTargetShips(world, tracker.faction);
    const detectedThisTick = new Set<EntityId>();

    for (const target of targets) {
      const bestDetection = this.getBestDetection(sensorShips, target, occludingBodies);

      if (bestDetection) {
        detectedThisTick.add(target.entityId);

        const isNew = !tracker.contacts.has(target.entityId);

        const lightDelay = bestDetection.distance / LIGHT_SPEED;
        const delayedX = target.pos.x - target.vel.vx * lightDelay;
        const delayedY = target.pos.y - target.vel.vy * lightDelay;

        // Back-calculate velocity at detection time (consistent with delayed position)
        const delayedVx = target.vel.vx - target.ax * lightDelay;
        const delayedVy = target.vel.vy - target.ay * lightDelay;

        const contact: DetectedContact = {
          entityId: target.entityId,
          lastKnownX: delayedX,
          lastKnownY: delayedY,
          lastKnownVx: delayedVx,
          lastKnownVy: delayedVy,
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

    // Mark undetected contacts as lost (persist indefinitely for estimation)
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

      // Compute current acceleration vector for light-delay velocity correction
      let ax = 0;
      let ay = 0;
      if (thruster && thruster.throttle > 0) {
        const accel = thruster.maxThrust * thruster.throttle;
        ax = Math.cos(thruster.thrustAngle) * accel;
        ay = Math.sin(thruster.thrustAngle) * accel;
      }

      result.push({ entityId, pos, vel, thermal, throttle, ax, ay });
    }
    return result;
  }

  private getBestDetection(
    sensorShips: SensorShipData[],
    target: TargetShipData,
    occludingBodies: OccludingBody[],
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

      // Check line-of-sight occlusion
      let blocked = false;
      for (const body of occludingBodies) {
        if (SensorSystem.isLineBlockedByCircle(
          sensor.pos.x, sensor.pos.y,
          target.pos.x, target.pos.y,
          body.x, body.y,
          body.radius,
        )) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const signalStrength = effectiveSignature / (distance * distance);

      if (signalStrength > sensor.effectiveSensitivity) {
        if (!bestSignal || signalStrength > bestSignal.signalStrength) {
          bestSignal = { signalStrength, distance };
        }
      }
    }

    return bestSignal;
  }

  private getOccludingBodies(world: World): OccludingBody[] {
    const entities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    const result: OccludingBody[] = [];
    for (const id of entities) {
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      if (body.bodyType !== 'star' && body.bodyType !== 'planet' && body.bodyType !== 'moon') continue;
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      result.push({ x: pos.x, y: pos.y, radius: body.radius });
    }
    return result;
  }

  /** Returns true if the line segment from A to B is blocked by the circle (center, radius). */
  private static isLineBlockedByCircle(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    radius: number,
  ): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const fx = ax - cx;
    const fy = ay - cy;

    const segLenSq = dx * dx + dy * dy;
    if (segLenSq < 1) return false; // degenerate segment

    // Skip if either endpoint is inside the body (e.g. ship orbiting close to moon)
    if (fx * fx + fy * fy < radius * radius) return false;
    const gx = bx - cx;
    const gy = by - cy;
    if (gx * gx + gy * gy < radius * radius) return false;

    // Parameter t for closest point on line to circle center, clamped to [0,1]
    const t = Math.max(0, Math.min(1, -(fx * dx + fy * dy) / segLenSq));

    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const distSq = (closestX - cx) * (closestX - cx) + (closestY - cy) * (closestY - cy);

    return distSq < radius * radius;
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
  ax: number;  // current acceleration x (km/s²) for light-delay velocity correction
  ay: number;  // current acceleration y (km/s²)
}

interface OccludingBody {
  x: number;
  y: number;
  radius: number;
}
