import { World, EntityId } from '../engine/types';
import { EventBus } from '../engine/core/EventBus';
import {
  Position, Velocity, Ship, Thruster, Selectable, Facing, ThermalSignature,
  NavigationOrder, RotationState, MissileLauncher, Missile, Railgun, Projectile,
  CelestialBody, COMPONENT,
} from '../engine/components';
import { computeBurnPlan, angleBetweenPoints } from '../engine/utils/TrajectoryCalculator';
import { computeLeadSolution, hitProbability } from '../engine/utils/FiringComputer';
import { getBodiesFromWorld, getSafeWaypoints } from '../engine/utils/PlanetAvoidance';
import { DANGER_ZONE_MULTIPLIER } from '../engine/constants';

/** Rounds per player "Fire railgun" + right-click (one leaves the ship each interval). */
const RAILGUN_BURST_SIZE = 5;
/** Rounds per AI railgun burst (same multi-shot stream as player). */
const AI_RAILGUN_BURST_SIZE = 4;
/** Seconds between each round in a burst (rounds leave the ship one by one). */
const RAILGUN_BURST_INTERVAL_SEC = 0.12;

interface PendingRailgunBurst {
  shipId: EntityId;
  targetId: EntityId;
  startTime: number;
  roundsTotal: number;
  roundsSpawned: number;
  dirX: number;
  dirY: number;
  projectileSpeed: number;
  damage: number;
  faction: string;
  rangeToTarget: number;
}

/**
 * Extract target's current acceleration vector from its NavigationOrder.
 * Returns {ax, ay} in km/s². Returns zero if the target isn't actively burning.
 */
function getTargetAcceleration(
  world: World,
  targetId: EntityId,
): { ax: number; ay: number } {
  const nav = world.getComponent<NavigationOrder>(targetId, COMPONENT.NavigationOrder);
  const thruster = world.getComponent<Thruster>(targetId, COMPONENT.Thruster);
  if (!nav || !thruster) return { ax: 0, ay: 0 };

  const phase = nav.phase;
  if (phase === 'accelerating') {
    const angle = nav.burnPlan.burnDirection;
    return { ax: Math.cos(angle) * thruster.maxThrust, ay: Math.sin(angle) * thruster.maxThrust };
  }
  if (phase === 'decelerating') {
    const angle = nav.burnPlan.flipAngle;
    return { ax: Math.cos(angle) * thruster.maxThrust, ay: Math.sin(angle) * thruster.maxThrust };
  }
  return { ax: 0, ay: 0 };
}

export class CommandHandler {
  private pendingRailgunBursts: PendingRailgunBurst[] = [];

  constructor(private world: World, private eventBus?: EventBus) {
    this.subscribeToAICommands();
  }

  private subscribeToAICommands(): void {
    if (!this.eventBus) return;

    this.eventBus.subscribe('AIMoveOrder', (event) => {
      const { targetX, targetY } = event.data as { targetX: number; targetY: number };
      this.issueMoveToForShip(event.entityId!, targetX, targetY);
    });

    this.eventBus.subscribe('AIFireMissile', (event) => {
      this.launchMissileFromShip(event.entityId!, event.targetId!, event.time);
    });

    this.eventBus.subscribe('AIFireRailgun', (event) => {
      this.fireRailgunFromShip(event.entityId!, event.targetId!, event.time);
    });
  }

  /**
   * Call each fixed update to spawn the next round of any in-progress railgun bursts.
   * Rounds leave the ship one by one at the burst interval.
   */
  processPendingRailgunBursts(world: World, gameTime: number): void {
    const interval = RAILGUN_BURST_INTERVAL_SEC;
    for (let i = this.pendingRailgunBursts.length - 1; i >= 0; i--) {
      const b = this.pendingRailgunBursts[i];
      const nextSpawnTime = b.startTime + b.roundsSpawned * interval;
      if (b.roundsSpawned >= b.roundsTotal) {
        this.pendingRailgunBursts.splice(i, 1);
        continue;
      }
      const pos = world.getComponent<Position>(b.shipId, COMPONENT.Position);
      const railgun = world.getComponent<Railgun>(b.shipId, COMPONENT.Railgun);
      if (!pos || !railgun || railgun.ammo <= 0) {
        this.pendingRailgunBursts.splice(i, 1);
        continue;
      }
      if (gameTime < nextSpawnTime) continue;

      railgun.ammo -= 1;
      const projId = world.createEntity();
      world.addComponent<Position>(projId, {
        type: 'Position',
        x: pos.x, y: pos.y, prevX: pos.x, prevY: pos.y,
      });
      world.addComponent<Velocity>(projId, {
        type: 'Velocity',
        vx: b.dirX * b.projectileSpeed,
        vy: b.dirY * b.projectileSpeed,
      });
      world.addComponent<Projectile>(projId, {
        type: 'Projectile',
        shooterId: b.shipId,
        targetId: b.targetId,
        faction: b.faction as 'player' | 'enemy' | 'neutral',
        damage: b.damage,
        hitRadius: 0.5,
        spawnX: pos.x,
        spawnY: pos.y,
        maxRange: b.rangeToTarget * 2,
      });
      b.roundsSpawned += 1;
      if (b.roundsSpawned >= b.roundsTotal) {
        this.pendingRailgunBursts.splice(i, 1);
      }
    }
  }

  /** Issue a move-to order to all selected player ships. If none selected, issues to flagship or sole player ship.
   *  When append is true and ship already has a NavigationOrder, appends as a waypoint instead. */
  issueMoveTo(targetX: number, targetY: number, append = false): void {
    const ships = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Thruster, COMPONENT.Selectable,
    );

    const toCommand: EntityId[] = [];
    let flagshipId: EntityId | null = null;
    const playerShips: EntityId[] = [];

    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      playerShips.push(id);
      if (ship.flagship) flagshipId = id;
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (sel.selected) toCommand.push(id);
    }

    if (toCommand.length === 0) {
      if (flagshipId !== null) toCommand.push(flagshipId);
      else if (playerShips.length === 1) toCommand.push(playerShips[0]);
    }

    for (const id of toCommand) {
      // Append mode: if ship already has a nav order, add as waypoint
      if (append && this.world.hasComponent(id, COMPONENT.NavigationOrder)) {
        const nav = this.world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
        nav.waypoints.push({ x: targetX, y: targetY });
        continue;
      }

      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(id, COMPONENT.Velocity)!;
      const thruster = this.world.getComponent<Thruster>(id, COMPONENT.Thruster)!;

      const bodies = getBodiesFromWorld(this.world);
      const avoidanceWaypoints = getSafeWaypoints(pos.x, pos.y, targetX, targetY, bodies);
      const effectiveX = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].x : targetX;
      const effectiveY = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].y : targetY;

      const burnPlan = computeBurnPlan(
        pos.x, pos.y,
        vel.vx, vel.vy,
        effectiveX, effectiveY,
        thruster.maxThrust,
      );

      // Remove existing nav order if present
      if (this.world.hasComponent(id, COMPONENT.NavigationOrder)) {
        this.world.removeComponent(id, COMPONENT.NavigationOrder);
      }

      // Remaining avoidance waypoints go into the waypoint queue
      const queuedWaypoints = avoidanceWaypoints.slice(1).map(w => ({ x: w.x, y: w.y }));

      this.world.addComponent<NavigationOrder>(id, {
        type: 'NavigationOrder',
        destinationX: targetX,
        destinationY: targetY,
        targetX: effectiveX,
        targetY: effectiveY,
        waypoints: queuedWaypoints,
        phase: 'rotating',
        burnPlan,
        phaseStartTime: 0,
        arrivalThreshold: 100,
      });

      // Ensure RotationState exists
      if (!this.world.hasComponent(id, COMPONENT.RotationState)) {
        const currentAngle = angleBetweenPoints(0, 0, vel.vx, vel.vy);
        this.world.addComponent<RotationState>(id, {
          type: 'RotationState',
          currentAngle: currentAngle || 0,
          targetAngle: burnPlan.burnDirection,
          rotating: false,
        });
      } else {
        const rot = this.world.getComponent<RotationState>(id, COMPONENT.RotationState)!;
        rot.targetAngle = burnPlan.burnDirection;
      }

      thruster.throttle = 0;
    }
  }

  /**
   * Issue a move-to order for a single ship (used by AI). No faction or selection check.
   */
  issueMoveToForShip(shipId: EntityId, targetX: number, targetY: number): void {
    const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position);
    const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity);
    const thruster = this.world.getComponent<Thruster>(shipId, COMPONENT.Thruster);
    if (!pos || !vel || !thruster) return;

    const bodies = getBodiesFromWorld(this.world);
    const avoidanceWaypoints = getSafeWaypoints(pos.x, pos.y, targetX, targetY, bodies);
    const effectiveX = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].x : targetX;
    const effectiveY = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].y : targetY;

    const burnPlan = computeBurnPlan(
      pos.x, pos.y,
      vel.vx, vel.vy,
      effectiveX, effectiveY,
      thruster.maxThrust,
    );

    if (this.world.hasComponent(shipId, COMPONENT.NavigationOrder)) {
      this.world.removeComponent(shipId, COMPONENT.NavigationOrder);
    }

    const queuedWaypoints = avoidanceWaypoints.slice(1).map(w => ({ x: w.x, y: w.y }));

    this.world.addComponent<NavigationOrder>(shipId, {
      type: 'NavigationOrder',
      destinationX: targetX,
      destinationY: targetY,
      targetX: effectiveX,
      targetY: effectiveY,
      waypoints: queuedWaypoints,
      phase: 'rotating',
      burnPlan,
      phaseStartTime: 0,
      arrivalThreshold: 100,
    });

    if (!this.world.hasComponent(shipId, COMPONENT.RotationState)) {
      const currentAngle = angleBetweenPoints(0, 0, vel.vx, vel.vy);
      this.world.addComponent<RotationState>(shipId, {
        type: 'RotationState',
        currentAngle: currentAngle || 0,
        targetAngle: burnPlan.burnDirection,
        rotating: false,
      });
    } else {
      const rot = this.world.getComponent<RotationState>(shipId, COMPONENT.RotationState)!;
      rot.targetAngle = burnPlan.burnDirection;
    }
    thruster.throttle = 0;
  }

  /**
   * Issue an orbit order for selected player ships around a celestial body.
   * Ships navigate to the orbit radius then enter sustained circular orbit.
   */
  issueOrbitTo(planetId: EntityId): void {
    const planetPos = this.world.getComponent<Position>(planetId, COMPONENT.Position);
    const planetBody = this.world.getComponent<CelestialBody>(planetId, COMPONENT.CelestialBody);
    if (!planetPos || !planetBody) return;

    const orbitRadius = planetBody.radius * DANGER_ZONE_MULTIPLIER * 1.3;

    const ships = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Thruster, COMPONENT.Selectable,
    );

    const toCommand: EntityId[] = [];
    let flagshipId: EntityId | null = null;
    const playerShips: EntityId[] = [];

    for (const id of ships) {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      playerShips.push(id);
      if (ship.flagship) flagshipId = id;
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (sel.selected) toCommand.push(id);
    }

    if (toCommand.length === 0) {
      if (flagshipId !== null) toCommand.push(flagshipId);
      else if (playerShips.length === 1) toCommand.push(playerShips[0]);
    }

    for (const id of toCommand) {
      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(id, COMPONENT.Velocity)!;
      const thruster = this.world.getComponent<Thruster>(id, COMPONENT.Thruster)!;

      // Compute approach point: closest point on orbit circle to the ship
      const dx = pos.x - planetPos.x;
      const dy = pos.y - planetPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;
      const targetX = planetPos.x + nx * orbitRadius;
      const targetY = planetPos.y + ny * orbitRadius;

      // Exclude the orbit target planet from avoidance — we're heading toward it
      const bodies = getBodiesFromWorld(this.world).filter(b => {
        const dx = b.x - planetPos.x;
        const dy = b.y - planetPos.y;
        return Math.sqrt(dx * dx + dy * dy) > 1;
      });
      const avoidanceWaypoints = getSafeWaypoints(pos.x, pos.y, targetX, targetY, bodies);
      const effectiveX = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].x : targetX;
      const effectiveY = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].y : targetY;

      const burnPlan = computeBurnPlan(
        pos.x, pos.y,
        vel.vx, vel.vy,
        effectiveX, effectiveY,
        thruster.maxThrust,
      );

      if (this.world.hasComponent(id, COMPONENT.NavigationOrder)) {
        this.world.removeComponent(id, COMPONENT.NavigationOrder);
      }

      const queuedOrbitWaypoints = avoidanceWaypoints.slice(1).map(w => ({ x: w.x, y: w.y }));

      this.world.addComponent<NavigationOrder>(id, {
        type: 'NavigationOrder',
        destinationX: targetX,
        destinationY: targetY,
        targetX: effectiveX,
        targetY: effectiveY,
        waypoints: queuedOrbitWaypoints,
        phase: 'rotating',
        burnPlan,
        phaseStartTime: 0,
        arrivalThreshold: 100,
        orbitTargetId: planetId,
        orbitRadius,
      });

      if (!this.world.hasComponent(id, COMPONENT.RotationState)) {
        const currentAngle = angleBetweenPoints(0, 0, vel.vx, vel.vy);
        this.world.addComponent<RotationState>(id, {
          type: 'RotationState',
          currentAngle: currentAngle || 0,
          targetAngle: burnPlan.burnDirection,
          rotating: false,
        });
      } else {
        const rot = this.world.getComponent<RotationState>(id, COMPONENT.RotationState)!;
        rot.targetAngle = burnPlan.burnDirection;
      }

      thruster.throttle = 0;
    }
  }

  /**
   * Launch one salvo from a single ship at target (used by AI). Returns true if launched.
   */
  launchMissileFromShip(shipId: EntityId, targetId: EntityId, gameTime: number): boolean {
    const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship);
    const launcher = this.world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher);
    const targetPos = this.world.getComponent<Position>(targetId, COMPONENT.Position);
    if (!ship || !launcher || !targetPos) return false;
    if ((launcher.integrity ?? 100) <= 0) return false;
    if (launcher.lastFiredTime > 0 && gameTime - launcher.lastFiredTime < launcher.reloadTime) return false;
    const salvoSize = Math.min(launcher.salvoSize, launcher.ammo);
    if (salvoSize <= 0) return false;

    const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
    const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0 ? dx / dist : 1;
    const dirY = dist > 0 ? dy / dist : 0;

    const missileId = this.world.createEntity();
    const launchBoost = 0.5;
    this.world.addComponent<Position>(missileId, {
      type: 'Position', x: pos.x, y: pos.y, prevX: pos.x, prevY: pos.y,
    });
    this.world.addComponent<Velocity>(missileId, {
      type: 'Velocity',
      vx: vel.vx + dirX * launchBoost,
      vy: vel.vy + dirY * launchBoost,
    });
    this.world.addComponent<Facing>(missileId, {
      type: 'Facing', angle: Math.atan2(dirY, dirX),
    });
    this.world.addComponent<ThermalSignature>(missileId, {
      type: 'ThermalSignature', baseSignature: 100, thrustMultiplier: 500,
    });
    const missileFuel = launcher.maxRange / (launcher.missileAccel * 100);
    this.world.addComponent<Missile>(missileId, {
      type: 'Missile',
      targetId,
      launcherFaction: ship.faction,
      count: salvoSize,
      fuel: missileFuel,
      totalFuel: missileFuel,
      accel: launcher.missileAccel,
      seekerRange: launcher.seekerRange,
      seekerSensitivity: launcher.seekerSensitivity,
      guidanceMode: 'sensor',
      phase: 'boost',
      armed: false,
      armingDistance: 5,
    });
    this.world.addComponent<Selectable>(missileId, {
      type: 'Selectable', selected: false,
    });

    launcher.ammo -= salvoSize;
    launcher.lastFiredTime = gameTime;
    this.eventBus?.emit({
      type: 'MissileLaunched',
      time: gameTime,
      entityId: shipId,
      targetId,
      data: { salvoSize, faction: ship.faction },
    });
    return true;
  }

  /**
   * Fire railgun from a single ship at target (used by AI). Returns true if fired.
   */
  fireRailgunFromShip(shipId: EntityId, targetId: EntityId, gameTime: number): boolean {
    const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship);
    const railgun = this.world.getComponent<Railgun>(shipId, COMPONENT.Railgun);
    const targetPos = this.world.getComponent<Position>(targetId, COMPONENT.Position);
    const targetVel = this.world.getComponent<Velocity>(targetId, COMPONENT.Velocity);
    if (!ship || !railgun || !targetPos) return false;
    if ((railgun.integrity ?? 100) <= 0) return false;
    if (railgun.ammo <= 0) return false;
    if (gameTime - railgun.lastFiredTime < railgun.reloadTime) return false;

    const targetVx = targetVel?.vx ?? 0;
    const targetVy = targetVel?.vy ?? 0;
    const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
    const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;
    const { ax: targetAx, ay: targetAy } = getTargetAcceleration(this.world, targetId);

    const solution = computeLeadSolution(
      pos.x, pos.y, vel.vx, vel.vy,
      targetPos.x, targetPos.y, targetVx, targetVy,
      railgun.projectileSpeed,
      undefined, // no max range limit
      targetAx, targetAy,
    );
    if (!solution) return false;

    const range = Math.sqrt((targetPos.x - pos.x) ** 2 + (targetPos.y - pos.y) ** 2);
    const targetSpeed = Math.sqrt(targetVx * targetVx + targetVy * targetVy);
    const prob = hitProbability(range, targetSpeed, railgun.projectileSpeed, Infinity);

    const dirX = Math.cos(solution.fireAngle);
    const dirY = Math.sin(solution.fireAngle);
    const roundsTotal = Math.min(AI_RAILGUN_BURST_SIZE, railgun.ammo);
    if (roundsTotal <= 0) return false;

    this.pendingRailgunBursts.push({
      shipId,
      targetId,
      startTime: gameTime,
      roundsTotal,
      roundsSpawned: 0,
      dirX,
      dirY,
      projectileSpeed: railgun.projectileSpeed,
      damage: railgun.damage,
      faction: ship.faction,
      rangeToTarget: range,
    });
    railgun.lastFiredTime = gameTime;
    this.eventBus?.emit({
      type: 'RailgunFired',
      time: gameTime,
      entityId: shipId,
      targetId,
      data: { timeToImpact: solution.timeToImpact, hitProbability: prob },
    });
    return true;
  }

  /** Launch missile salvos from selected player ships at the target entity.
   * If none selected, uses flagship or all player ships with launcher (same fallback as move). */
  launchMissile(targetId: EntityId, gameTime: number): void {
    const candidates = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Selectable, COMPONENT.MissileLauncher,
    );

    const toLaunch: EntityId[] = [];
    let flagshipId: EntityId | null = null;
    const playerWithMl: EntityId[] = [];

    for (const shipId of candidates) {
      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      playerWithMl.push(shipId);
      if (ship.flagship) flagshipId = shipId;
      const sel = this.world.getComponent<Selectable>(shipId, COMPONENT.Selectable)!;
      if (sel.selected) toLaunch.push(shipId);
    }

    if (toLaunch.length === 0) {
      if (flagshipId !== null) toLaunch.push(flagshipId);
      else if (playerWithMl.length > 0) toLaunch.push(...playerWithMl);
    }

    const targetPos = this.world.getComponent<Position>(targetId, COMPONENT.Position);
    if (!targetPos) return;

    for (const shipId of toLaunch) {
      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;

      const launcher = this.world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher)!;

      if ((launcher.integrity ?? 100) <= 0) continue;

      // Check reload cooldown
      if (launcher.lastFiredTime > 0 && gameTime - launcher.lastFiredTime < launcher.reloadTime) continue;

      const salvoSize = Math.min(launcher.salvoSize, launcher.ammo);
      if (salvoSize <= 0) continue;

      const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;

      // Direction to target
      const dx = targetPos.x - pos.x;
      const dy = targetPos.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dirX = dist > 0 ? dx / dist : 1;
      const dirY = dist > 0 ? dy / dist : 0;

      // Create missile entity — inherits ship velocity + small initial boost
      const missileId = this.world.createEntity();
      const launchBoost = 0.5; // km/s initial kick
      this.world.addComponent<Position>(missileId, {
        type: 'Position', x: pos.x, y: pos.y, prevX: pos.x, prevY: pos.y,
      });
      this.world.addComponent<Velocity>(missileId, {
        type: 'Velocity',
        vx: vel.vx + dirX * launchBoost,
        vy: vel.vy + dirY * launchBoost,
      });
      this.world.addComponent<Facing>(missileId, {
        type: 'Facing', angle: Math.atan2(dirY, dirX),
      });
      this.world.addComponent<ThermalSignature>(missileId, {
        type: 'ThermalSignature', baseSignature: 100, thrustMultiplier: 500,
      });
      const missileFuel = launcher.maxRange / (launcher.missileAccel * 100);
      this.world.addComponent<Missile>(missileId, {
        type: 'Missile',
        targetId,
        launcherFaction: ship.faction,
        count: salvoSize,
        fuel: missileFuel,
        totalFuel: missileFuel,
        accel: launcher.missileAccel,
        seekerRange: launcher.seekerRange,
        seekerSensitivity: launcher.seekerSensitivity,
        guidanceMode: 'sensor',
        phase: 'boost',
        armed: false,
        armingDistance: 5,
      });
      this.world.addComponent<Selectable>(missileId, {
        type: 'Selectable', selected: false,
      });

      // Decrement ammo, update fire time
      launcher.ammo -= salvoSize;
      launcher.lastFiredTime = gameTime;

      this.eventBus?.emit({
        type: 'MissileLaunched',
        time: gameTime,
        entityId: shipId,
        targetId,
        data: { salvoSize, faction: ship.faction },
      });
    }
  }

  /**
   * Delete a waypoint or destination from a ship's navigation order.
   * waypointIndex: -1 = destination (promotes next waypoint), 0+ = waypoints[i].
   * Returns true if something was deleted.
   */
  deleteWaypoint(shipId: EntityId, waypointIndex: number): boolean {
    const nav = this.world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
    if (!nav || nav.phase === 'arrived') return false;

    if (waypointIndex === -1) {
      // Deleting destination — promote next waypoint or remove order entirely
      if (nav.waypoints.length > 0) {
        const next = nav.waypoints.shift()!;
        nav.destinationX = next.x;
        nav.destinationY = next.y;
        nav.targetX = next.x;
        nav.targetY = next.y;
      } else {
        this.world.removeComponent(shipId, COMPONENT.NavigationOrder);
      }
      return true;
    }

    // Deleting an intermediate waypoint
    if (waypointIndex >= 0 && waypointIndex < nav.waypoints.length) {
      nav.waypoints.splice(waypointIndex, 1);
      return true;
    }
    return false;
  }

  /**
   * Move a waypoint or destination to a new position (used during drag).
   * waypointIndex: -1 = destination, 0+ = waypoints[i].
   */
  moveWaypoint(shipId: EntityId, waypointIndex: number, x: number, y: number): void {
    const nav = this.world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
    if (!nav) return;

    if (waypointIndex === -1) {
      nav.destinationX = x;
      nav.destinationY = y;
      nav.targetX = x;
      nav.targetY = y;
    } else {
      const wp = nav.waypoints[waypointIndex];
      if (wp) { wp.x = x; wp.y = y; }
    }
  }

  /**
   * Recompute burn plan after a destination drag. Recalculates avoidance waypoints.
   */
  recomputeAfterDrag(shipId: EntityId): void {
    const nav = this.world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
    if (!nav) return;
    const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position);
    const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity);
    const thruster = this.world.getComponent<Thruster>(shipId, COMPONENT.Thruster);
    if (!pos || !vel || !thruster) return;

    const bodies = getBodiesFromWorld(this.world);
    const avoidanceWaypoints = getSafeWaypoints(pos.x, pos.y, nav.destinationX, nav.destinationY, bodies);
    const effectiveX = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].x : nav.destinationX;
    const effectiveY = avoidanceWaypoints.length > 0 ? avoidanceWaypoints[0].y : nav.destinationY;
    nav.targetX = effectiveX;
    nav.targetY = effectiveY;
    nav.burnPlan = computeBurnPlan(pos.x, pos.y, vel.vx, vel.vy, effectiveX, effectiveY, thruster.maxThrust);
  }

  /** Fire railguns from selected player ships at the target entity (lead targeting).
   * If none selected, uses flagship or all player ships with railgun (same fallback as move).
   * Emits OrderFeedback when no shots fired (no ships or out of range). */
  fireRailgun(targetId: EntityId, gameTime: number): void {
    const candidates = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Selectable, COMPONENT.Railgun,
    );

    const toFire: EntityId[] = [];
    let flagshipId: EntityId | null = null;
    const playerWithRg: EntityId[] = [];

    for (const shipId of candidates) {
      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      playerWithRg.push(shipId);
      if (ship.flagship) flagshipId = shipId;
      const sel = this.world.getComponent<Selectable>(shipId, COMPONENT.Selectable)!;
      if (sel.selected) toFire.push(shipId);
    }

    if (toFire.length === 0) {
      if (flagshipId !== null) toFire.push(flagshipId);
      else if (playerWithRg.length > 0) toFire.push(...playerWithRg);
    }

    const targetPos = this.world.getComponent<Position>(targetId, COMPONENT.Position);
    const targetVel = this.world.getComponent<Velocity>(targetId, COMPONENT.Velocity);
    if (!targetPos) return;

    const targetVx = targetVel?.vx ?? 0;
    const targetVy = targetVel?.vy ?? 0;
    const { ax: targetAx, ay: targetAy } = getTargetAcceleration(this.world, targetId);

    let fired = 0;
    for (const shipId of toFire) {
      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;

      const railgun = this.world.getComponent<Railgun>(shipId, COMPONENT.Railgun)!;
      if ((railgun.integrity ?? 100) <= 0) continue;
      if (railgun.ammo <= 0) continue;
      if (gameTime - railgun.lastFiredTime < railgun.reloadTime) continue;

      const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;

      const solution = computeLeadSolution(
        pos.x, pos.y, vel.vx, vel.vy,
        targetPos.x, targetPos.y, targetVx, targetVy,
        railgun.projectileSpeed,
        undefined, // no max range limit — fire at any distance
        targetAx, targetAy,
      );
      if (!solution) continue;

      const range = Math.sqrt(
        (targetPos.x - pos.x) ** 2 + (targetPos.y - pos.y) ** 2,
      );
      const targetSpeed = Math.sqrt(targetVx * targetVx + targetVy * targetVy);
      const prob = hitProbability(
        range,
        targetSpeed,
        railgun.projectileSpeed,
        Infinity, // no range cap for probability
      );

      const dirX = Math.cos(solution.fireAngle);
      const dirY = Math.sin(solution.fireAngle);

      this.pendingRailgunBursts.push({
        shipId,
        targetId,
        startTime: gameTime,
        roundsTotal: RAILGUN_BURST_SIZE,
        roundsSpawned: 0,
        dirX,
        dirY,
        projectileSpeed: railgun.projectileSpeed,
        damage: railgun.damage,
        faction: ship.faction,
        rangeToTarget: range,
      });

      railgun.lastFiredTime = gameTime;
      fired += 1;

      this.eventBus?.emit({
        type: 'RailgunFired',
        time: gameTime,
        entityId: shipId,
        targetId,
        data: { timeToImpact: solution.timeToImpact, hitProbability: prob },
      });
    }

    if (fired === 0 && this.eventBus) {
      const reason =
        toFire.length === 0
          ? 'No ships with railgun.'
          : 'No firing solution (target unreachable).';
      this.eventBus.emit({
        type: 'OrderFeedback',
        time: gameTime,
        data: { message: `Railgun: ${reason}` },
      });
    }
  }
}
