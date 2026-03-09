import { World } from '../engine/types';
import {
  Position, Velocity, Ship, Thruster, Selectable,
  NavigationOrder, RotationState, COMPONENT,
} from '../engine/components';
import { computeBurnPlan, angleBetweenPoints } from './TrajectoryCalculator';

export class CommandHandler {
  constructor(private world: World) {}

  /** Issue a move-to order to all selected player ships. */
  issueMoveTo(targetX: number, targetY: number): void {
    const ships = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Thruster, COMPONENT.Selectable,
    );

    for (const id of ships) {
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (!sel.selected) continue;

      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;

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

      // Cancel current thrust
      thruster.throttle = 0;
    }
  }
}
