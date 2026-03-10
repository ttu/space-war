import { World, EntityId } from '../engine/types';
import { EventBus } from '../engine/core/EventBus';
import {
  Position, Velocity, Ship, Thruster, Selectable, Facing, ThermalSignature,
  NavigationOrder, RotationState, MissileLauncher, Missile,
  COMPONENT,
} from '../engine/components';
import { computeBurnPlan, angleBetweenPoints } from './TrajectoryCalculator';

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
}
