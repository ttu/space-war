import { World, EntityId } from '../types';
import {
  Position, Velocity, Thruster, CelestialBody, StationKeeping, COMPONENT,
} from '../components';

interface BodyRef {
  entityId: EntityId;
  pos: Position;
  vel: Velocity;
  bodyType: CelestialBody['bodyType'];
}

export class StationKeepingSystem {
  update(world: World, _dt: number): void {
    const bodyIds = world.query(COMPONENT.Position, COMPONENT.Velocity, COMPONENT.CelestialBody);
    if (bodyIds.length === 0) return;

    const bodies: BodyRef[] = [];
    for (const id of bodyIds) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(id, COMPONENT.Velocity)!;
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      bodies.push({ entityId: id, pos, vel, bodyType: body.bodyType });
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
  let nearestPlanetary: BodyRef | null = null;
  let nearestPlanetaryD2 = Infinity;
  let nearestAny: BodyRef | null = null;
  let nearestAnyD2 = Infinity;

  for (const b of bodies) {
    const dx = b.pos.x - shipPos.x;
    const dy = b.pos.y - shipPos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestAnyD2) {
      nearestAnyD2 = d2;
      nearestAny = b;
    }
    if ((b.bodyType === 'planet' || b.bodyType === 'moon') && d2 < nearestPlanetaryD2) {
      nearestPlanetaryD2 = d2;
      nearestPlanetary = b;
    }
  }

  if (nearestAny && nearestAnyD2 * 25 < nearestPlanetaryD2) {
    return nearestAny;
  }
  return nearestPlanetary ?? nearestAny;
}
