/**
 * Win/loss condition checking. Emits VictoryAchieved when no enemy ships remain,
 * DefeatSuffered when no player ships remain. Call reset() when loading a new scenario.
 */

import { World } from '../types';
import { EventBus } from '../core/EventBus';
import { Ship, Position, ObjectiveZone, COMPONENT } from '../components';

export class VictorySystem {
  private victoryEmitted = false;
  private defeatEmitted = false;

  constructor(private eventBus: EventBus) {}

  /** Call when loading a new scenario so victory/defeat can trigger again. */
  reset(): void {
    this.victoryEmitted = false;
    this.defeatEmitted = false;
  }

  update(world: World, gameTime: number): void {
    const shipIds = world.query(COMPONENT.Ship);
    let playerCount = 0;
    let enemyCount = 0;
    for (const id of shipIds) {
      const ship = world.getComponent<Ship>(id, COMPONENT.Ship);
      if (!ship) continue;
      if (ship.faction === 'player') playerCount++;
      else if (ship.faction === 'enemy') enemyCount++;
    }

    if (!this.defeatEmitted && playerCount === 0) {
      this.defeatEmitted = true;
      this.eventBus.emit({
        type: 'DefeatSuffered',
        time: gameTime,
        data: {},
      });
      return;
    }

    if (!this.victoryEmitted && enemyCount === 0 && playerCount > 0) {
      this.victoryEmitted = true;
      this.eventBus.emit({
        type: 'VictoryAchieved',
        time: gameTime,
        data: {},
      });
      return;
    }

    // Check objective zones
    if (!this.victoryEmitted) {
      const zoneIds = world.query(COMPONENT.ObjectiveZone, COMPONENT.Position);
      for (const zoneId of zoneIds) {
        const zone = world.getComponent<ObjectiveZone>(zoneId, COMPONENT.ObjectiveZone)!;
        const zonePos = world.getComponent<Position>(zoneId, COMPONENT.Position)!;
        const shipIds2 = world.query(COMPONENT.Ship, COMPONENT.Position);
        let count = 0;
        for (const sid of shipIds2) {
          const s = world.getComponent<Ship>(sid, COMPONENT.Ship)!;
          if (s.faction !== zone.faction) continue;
          const sp = world.getComponent<Position>(sid, COMPONENT.Position)!;
          const dx = sp.x - zonePos.x;
          const dy = sp.y - zonePos.y;
          if (dx * dx + dy * dy <= zone.radius * zone.radius) count++;
        }
        if (count >= zone.requiredCount) {
          this.victoryEmitted = true;
          this.eventBus.emit({ type: 'VictoryAchieved', time: gameTime, data: {} });
          return;
        }
      }
    }
  }
}
