import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { NavigationSystem } from '../../../src/engine/systems/NavigationSystem';
import { PhysicsSystem } from '../../../src/engine/systems/PhysicsSystem';
import {
  Position, Velocity, Thruster, Ship, NavigationOrder, RotationState,
  COMPONENT,
} from '../../../src/engine/components';
import { computeBurnPlan } from '../../../src/engine/utils/TrajectoryCalculator';
import { EntityId } from '../../../src/engine/types';

const DT = 0.1;
const MAX_TICKS = 30_000; // up to 3000 seconds of game time

interface SimResult {
  arrived: boolean;
  ticks: number;
  pathLength: number;
  minSpeedAtWaypoints: number[]; // sampled when ship passed each user waypoint within 200km
  maxSpeed: number;
}

function createShip(world: WorldImpl, x: number, y: number): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, { type: 'Position', x, y, prevX: x, prevY: y });
  world.addComponent<Velocity>(id, { type: 'Velocity', vx: 0, vy: 0 });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Test', hullClass: 'destroyer', faction: 'player', flagship: true,
  });
  // High thrust + fast rotation so tests run in a reasonable number of ticks.
  // Real ships are slower, but the qualitative behaviour we're testing
  // (no unnecessary braking, no detours) is the same.
  world.addComponent<Thruster>(id, {
    type: 'Thruster', maxThrust: 1.0, thrustAngle: 0, throttle: 0, rotationSpeed: 2.0,
  });
  world.addComponent<RotationState>(id, {
    type: 'RotationState', currentAngle: 0, targetAngle: 0, rotating: false,
  });
  return id;
}

/** Drives Navigation+Physics until ship arrives at the final destination or
 *  MAX_TICKS elapses. Returns timing, total path length, and speed samples. */
function simulate(
  world: WorldImpl,
  shipId: EntityId,
  finalDestination: { x: number; y: number },
  waypoints: { x: number; y: number }[],
): SimResult {
  const nav = new NavigationSystem();
  const physics = new PhysicsSystem();
  const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;

  let prevX = pos.x;
  let prevY = pos.y;
  let pathLength = 0;
  let maxSpeed = 0;
  // Track minimum speed observed within 200km of each user-clicked waypoint
  // — reveals "braking at waypoint" by recording how slow the ship got.
  const userWaypoints = [...waypoints, finalDestination];
  const minSpeedNearWp = userWaypoints.map(() => Number.POSITIVE_INFINITY);
  const reachedWp = userWaypoints.map(() => false);

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    nav.update(world, DT, tick * DT);
    physics.update(world, DT);

    const p = world.getComponent<Position>(shipId, COMPONENT.Position)!;
    const v = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    const speed = Math.hypot(v.vx, v.vy);
    pathLength += Math.hypot(p.x - prevX, p.y - prevY);
    prevX = p.x; prevY = p.y;
    if (speed > maxSpeed) maxSpeed = speed;

    for (let i = 0; i < userWaypoints.length; i++) {
      const wp = userWaypoints[i];
      const dist = Math.hypot(p.x - wp.x, p.y - wp.y);
      if (dist < 200 && speed < minSpeedNearWp[i]) minSpeedNearWp[i] = speed;
      if (dist < 200) reachedWp[i] = true;
    }

    // Arrival: NavigationOrder is removed once final destination reached.
    if (!world.hasComponent(shipId, COMPONENT.NavigationOrder)) {
      return { arrived: true, ticks: tick + 1, pathLength, minSpeedAtWaypoints: minSpeedNearWp, maxSpeed };
    }
  }
  return { arrived: false, ticks: MAX_TICKS, pathLength, minSpeedAtWaypoints: minSpeedNearWp, maxSpeed };
}

function setupOrder(
  world: WorldImpl,
  shipId: EntityId,
  destination: { x: number; y: number },
  extraWaypoints: { x: number; y: number }[],
): void {
  const pos = world.getComponent<Position>(shipId, COMPONENT.Position)!;
  const vel = world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
  const thruster = world.getComponent<Thruster>(shipId, COMPONENT.Thruster)!;

  // First user click is the "destination". Extra shift-clicks become waypoints.
  const burnPlan = computeBurnPlan(
    pos.x, pos.y, vel.vx, vel.vy,
    destination.x, destination.y,
    thruster.maxThrust,
  );
  world.addComponent<NavigationOrder>(shipId, {
    type: 'NavigationOrder',
    destinationX: destination.x,
    destinationY: destination.y,
    targetX: destination.x,
    targetY: destination.y,
    waypoints: extraWaypoints.map(w => ({ x: w.x, y: w.y })),
    phase: 'rotating',
    burnPlan,
    phaseStartTime: 0,
    arrivalThreshold: 100,
  });
}

describe('NavigationSystem path quality', () => {
  it('reaches a single destination on a near-straight path', () => {
    const world = new WorldImpl();
    const shipId = createShip(world, 0, 0);
    setupOrder(world, shipId, { x: 100_000, y: 0 }, []);

    const result = simulate(world, shipId, { x: 100_000, y: 0 }, []);

    expect(result.arrived).toBe(true);
    expect(result.pathLength).toBeGreaterThan(99_000);
    expect(result.pathLength).toBeLessThan(105_000);
  });

  it('keeps cruise speed through a colinear waypoint chain', () => {
    // Three colinear waypoints: ship must not brake at intermediate ones.
    const world = new WorldImpl();
    const shipId = createShip(world, 0, 0);
    const wpA = { x: 60_000, y: 0 };
    const wp1 = { x: 120_000, y: 0 };
    const wp2 = { x: 180_000, y: 0 };
    setupOrder(world, shipId, wpA, [wp1, wp2]);

    const result = simulate(world, shipId, wp2, [wpA, wp1]);

    expect(result.arrived).toBe(true);
    // Path length within 1% of straight-line — no wandering.
    expect(result.pathLength).toBeLessThan(182_000);
    // Both intermediate waypoints should be passed at >70% of peak speed.
    expect(result.minSpeedAtWaypoints[0]).toBeGreaterThan(result.maxSpeed * 0.7);
    expect(result.minSpeedAtWaypoints[1]).toBeGreaterThan(result.maxSpeed * 0.7);
  });

  it('handles a right-angle turn without near-stopping at the corner', () => {
    // 0,0 → 80k,0 → 80k,80k. Sharp 90° turn at the middle waypoint.
    const world = new WorldImpl();
    const shipId = createShip(world, 0, 0);
    const wpA = { x: 80_000, y: 0 };
    const wpB = { x: 80_000, y: 80_000 };
    setupOrder(world, shipId, wpA, [wpB]);

    const result = simulate(world, shipId, wpB, [wpA]);

    expect(result.arrived).toBe(true);
    // Path length ≤ 1.4× polyline (some corner rounding is fine).
    expect(result.pathLength).toBeLessThan(160_000 * 1.4);
    // Corner speed at least 30% of cruise — no near-stop.
    expect(result.minSpeedAtWaypoints[0]).toBeGreaterThan(result.maxSpeed * 0.3);
  });

  it('takes a sensible path through an S-curve of 4 waypoints', () => {
    const world = new WorldImpl();
    const shipId = createShip(world, 0, 0);
    const dest = { x: 60_000, y: 0 };
    const wps = [
      { x: 120_000, y: 60_000 },
      { x: 180_000, y: 0 },
      { x: 240_000, y: 60_000 },
    ];
    const direct =
      Math.hypot(60_000, 0) +
      Math.hypot(60_000, 60_000) +
      Math.hypot(60_000, 60_000) +
      Math.hypot(60_000, 60_000);
    setupOrder(world, shipId, dest, wps);

    const result = simulate(world, shipId, wps[wps.length - 1], [dest, ...wps.slice(0, -1)]);

    expect(result.arrived).toBe(true);
    // Path within 1.6× polyline — wider arcs OK for three sharp turns,
    // looping not. The point of the bound is to catch ship-runs-away bugs.
    expect(result.pathLength).toBeLessThan(direct * 1.6);
    // Each fly-through waypoint should keep at least 25% of cruise speed.
    for (let i = 0; i < result.minSpeedAtWaypoints.length - 1; i++) {
      expect(result.minSpeedAtWaypoints[i]).toBeGreaterThan(result.maxSpeed * 0.25);
    }
  });

  it('does not significantly slow down when extra straight-line waypoints are added', () => {
    // Same start and end. With and without an intermediate waypoint exactly
    // on the line, ticks-to-arrive should be nearly equal — adding a waypoint
    // along the line shouldn't make the trip longer in time.
    const start = { x: 0, y: 0 };
    const end = { x: 200_000, y: 0 };
    const middle = { x: 100_000, y: 0 };

    const w1 = new WorldImpl();
    const ship1 = createShip(w1, start.x, start.y);
    setupOrder(w1, ship1, end, []);
    const direct = simulate(w1, ship1, end, []);

    const w2 = new WorldImpl();
    const ship2 = createShip(w2, start.x, start.y);
    setupOrder(w2, ship2, middle, [end]);
    const viaWaypoint = simulate(w2, ship2, end, [middle]);

    expect(direct.arrived).toBe(true);
    expect(viaWaypoint.arrived).toBe(true);
    // Adding one straight-line waypoint should add at most 10% to total time.
    expect(viaWaypoint.ticks).toBeLessThan(direct.ticks * 1.1);
  });
});
