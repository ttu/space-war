import { World, EntityId } from '../engine/types';
import { EventBus } from '../engine/core/EventBus';
import {
  Position, Velocity, Ship, Thruster, Selectable, Facing, ThermalSignature,
  NavigationOrder, RotationState, MissileLauncher, Missile, Railgun, Projectile,
  COMPONENT,
} from '../engine/components';
import { computeBurnPlan, angleBetweenPoints } from './TrajectoryCalculator';
import { computeLeadSolution, hitProbability } from './FiringComputer';

export class CommandHandler {
  constructor(private world: World, private eventBus?: EventBus) {}

  /** Issue a move-to order to all selected player ships. If none selected, issues to flagship or sole player ship. */
  issueMoveTo(targetX: number, targetY: number): void {
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

      const burnPlan = computeBurnPlan(
        pos.x, pos.y,
        vel.vx, vel.vy,
        targetX, targetY,
        thruster.maxThrust,
      );

      // Remove existing nav order if present
      if (this.world.hasComponent(id, COMPONENT.NavigationOrder)) {
        this.world.removeComponent(id, COMPONENT.NavigationOrder);
      }

      this.world.addComponent<NavigationOrder>(id, {
        type: 'NavigationOrder',
        targetX,
        targetY,
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

    const burnPlan = computeBurnPlan(
      pos.x, pos.y,
      vel.vx, vel.vy,
      targetX, targetY,
      thruster.maxThrust,
    );

    if (this.world.hasComponent(shipId, COMPONENT.NavigationOrder)) {
      this.world.removeComponent(shipId, COMPONENT.NavigationOrder);
    }

    this.world.addComponent<NavigationOrder>(shipId, {
      type: 'NavigationOrder',
      targetX,
      targetY,
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
    this.world.addComponent<Missile>(missileId, {
      type: 'Missile',
      targetId,
      launcherFaction: ship.faction,
      count: salvoSize,
      fuel: launcher.maxRange / (launcher.missileAccel * 100),
      accel: launcher.missileAccel,
      seekerRange: launcher.seekerRange,
      seekerSensitivity: launcher.seekerSensitivity,
      guidanceMode: 'sensor',
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
    if (gameTime - railgun.lastFiredTime < railgun.reloadTime) return false;

    const targetVx = targetVel?.vx ?? 0;
    const targetVy = targetVel?.vy ?? 0;
    const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
    const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;

    const solution = computeLeadSolution(
      pos.x, pos.y, vel.vx, vel.vy,
      targetPos.x, targetPos.y, targetVx, targetVy,
      railgun.projectileSpeed,
      railgun.maxRange,
    );
    if (!solution) return false;

    const range = Math.sqrt((targetPos.x - pos.x) ** 2 + (targetPos.y - pos.y) ** 2);
    const targetSpeed = Math.sqrt(targetVx * targetVx + targetVy * targetVy);
    const prob = hitProbability(range, targetSpeed, railgun.projectileSpeed, railgun.maxRange);

    const dirX = Math.cos(solution.fireAngle);
    const dirY = Math.sin(solution.fireAngle);
    const projId = this.world.createEntity();
    this.world.addComponent<Position>(projId, {
      type: 'Position', x: pos.x, y: pos.y, prevX: pos.x, prevY: pos.y,
    });
    this.world.addComponent<Velocity>(projId, {
      type: 'Velocity',
      vx: dirX * railgun.projectileSpeed,
      vy: dirY * railgun.projectileSpeed,
    });
    this.world.addComponent<Projectile>(projId, {
      type: 'Projectile',
      shooterId: shipId,
      targetId,
      faction: ship.faction,
      damage: railgun.damage,
      hitRadius: 0.5,
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

  /** Launch missile salvos from selected player ships at the target entity. */
  launchMissile(targetId: EntityId, gameTime: number): void {
    const selected = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Selectable, COMPONENT.MissileLauncher,
    );

    const targetPos = this.world.getComponent<Position>(targetId, COMPONENT.Position);
    if (!targetPos) return;

    for (const shipId of selected) {
      const sel = this.world.getComponent<Selectable>(shipId, COMPONENT.Selectable)!;
      if (!sel.selected) continue;

      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;

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
      this.world.addComponent<Missile>(missileId, {
        type: 'Missile',
        targetId,
        launcherFaction: ship.faction,
        count: salvoSize,
        fuel: launcher.maxRange / (launcher.missileAccel * 100),
        accel: launcher.missileAccel,
        seekerRange: launcher.seekerRange,
        seekerSensitivity: launcher.seekerSensitivity,
        guidanceMode: 'sensor',
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

  /** Fire railguns from selected player ships at the target entity (lead targeting). */
  fireRailgun(targetId: EntityId, gameTime: number): void {
    const selected = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Selectable, COMPONENT.Railgun,
    );

    const targetPos = this.world.getComponent<Position>(targetId, COMPONENT.Position);
    const targetVel = this.world.getComponent<Velocity>(targetId, COMPONENT.Velocity);
    if (!targetPos) return;

    const targetVx = targetVel?.vx ?? 0;
    const targetVy = targetVel?.vy ?? 0;

    for (const shipId of selected) {
      const sel = this.world.getComponent<Selectable>(shipId, COMPONENT.Selectable)!;
      if (!sel.selected) continue;

      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;

      const railgun = this.world.getComponent<Railgun>(shipId, COMPONENT.Railgun)!;
      if ((railgun.integrity ?? 100) <= 0) continue;
      if (gameTime - railgun.lastFiredTime < railgun.reloadTime) continue;

      const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;

      const solution = computeLeadSolution(
        pos.x, pos.y, vel.vx, vel.vy,
        targetPos.x, targetPos.y, targetVx, targetVy,
        railgun.projectileSpeed,
        railgun.maxRange,
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
        railgun.maxRange,
      );

      const dirX = Math.cos(solution.fireAngle);
      const dirY = Math.sin(solution.fireAngle);
      const projId = this.world.createEntity();
      this.world.addComponent<Position>(projId, {
        type: 'Position',
        x: pos.x, y: pos.y, prevX: pos.x, prevY: pos.y,
      });
      this.world.addComponent<Velocity>(projId, {
        type: 'Velocity',
        vx: dirX * railgun.projectileSpeed,
        vy: dirY * railgun.projectileSpeed,
      });
      this.world.addComponent<Projectile>(projId, {
        type: 'Projectile',
        shooterId: shipId,
        targetId,
        faction: ship.faction,
        damage: railgun.damage,
        hitRadius: 0.5,
      });

      railgun.lastFiredTime = gameTime;

      this.eventBus?.emit({
        type: 'RailgunFired',
        time: gameTime,
        entityId: shipId,
        targetId,
        data: { timeToImpact: solution.timeToImpact, hitProbability: prob },
      });
    }
  }
}
