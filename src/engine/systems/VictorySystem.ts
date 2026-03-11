/**
 * Win/loss condition checking. Emits VictoryAchieved when no enemy ships remain,
 * DefeatSuffered when no player ships remain. Call reset() when loading a new scenario.
 */

import { World } from '../types';
import { EventBus } from '../core/EventBus';
import { Ship, COMPONENT } from '../components';

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
    }
  }
}
