import { World, EntityId } from '../types';
import {
  Position, Velocity, Thruster, CelestialBody, StationKeeping, COMPONENT,
} from '../components';

interface BodyRef {
  entityId: EntityId;
  pos: Position;
  vel: Velocity;
  bodyType: CelestialBody['bodyType'];
  radius: number;
}

/** Anchor only to a planet/moon the ship is plausibly orbiting. Beyond this
 *  multiple of body radius the ship is in independent (likely heliocentric)
 *  motion — copying the body's velocity would drag it off its real orbit. */
const ANCHOR_RADIUS_MULTIPLIER = 30;

export class StationKeepingSystem {
  update(world: World, _dt: number): void {
    const bodyIds = world.query(COMPONENT.Position, COMPONENT.Velocity, COMPONENT.CelestialBody);
    if (bodyIds.length === 0) return;

    const bodies: BodyRef[] = [];
    for (const id of bodyIds) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(id, COMPONENT.Velocity)!;
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      bodies.push({ entityId: id, pos, vel, bodyType: body.bodyType, radius: body.radius });
    }

    const ships = world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Thruster, COMPONENT.StationKeeping,
    );

    for (const shipId of ships) {
      const sk = world.getComponent<StationKeeping>(shipId, COMPONENT.StationKeeping)!;
      if (!sk.enabled) continue;
      if (world.hasComponent(shipId, COMPONENT.NavigationOrder)) continue;

      const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
      const thruster = world.getComponent<Thruster>(shipId, COMPONENT.Thruster)!;

      const anchor = pickAnchor(pos, bodies);
      if (!anchor) continue;

      const bodyDx = anchor.pos.x - anchor.pos.prevX;
      const bodyDy = anchor.pos.y - anchor.pos.prevY;
      pos.x = pos.prevX + bodyDx;
      pos.y = pos.prevY + bodyDy;
      vel.vx = anchor.vel.vx;
      vel.vy = anchor.vel.vy;
      thruster.throttle = 0;
    }
  }
}

function pickAnchor(shipPos: Position, bodies: BodyRef[]): BodyRef | null {
  let nearest: BodyRef | null = null;
  let nearestD2 = Infinity;

  for (const b of bodies) {
    if (b.bodyType !== 'planet' && b.bodyType !== 'moon') continue;
    const dx = b.pos.x - shipPos.x;
    const dy = b.pos.y - shipPos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearest = b;
    }
  }

  if (!nearest) return null;
  const limit = nearest.radius * ANCHOR_RADIUS_MULTIPLIER;
  if (nearestD2 > limit * limit) return null;
  return nearest;
}
