import type { World, EntityId } from '../engine/types';
import {
  Position,
  Velocity,
  Ship,
  ContactTracker,
  MissileLauncher,
  Railgun,
  COMPONENT,
} from '../engine/components';
import { hitProbability } from '../engine/utils/FiringComputer';
import type { CommandHandler } from '../game/CommandHandler';

const MIN_RAILGUN_PROB = 0.35;
const MISSILE_RANGE_FRACTION = 0.9;
const MAX_MISSILE_REL_SPEED = 40;
const REFRESH_GAME_SECONDS = 3;

interface Recommendation {
  key: string;
  shipId: EntityId;
  targetId: EntityId;
  text: string;
  type: 'railgun' | 'missile';
  prob: number;
}

/**
 * Shows AI fire-order recommendations for player ships. Player can approve
 * each with "Fire" or ignore. Updated on a throttled game-time interval.
 */
export class AdvisorPanel {
  private root: HTMLElement;
  private list: HTMLElement;
  private lastRefreshTime = -999;

  constructor(
    container: HTMLElement,
    private world: World,
    private commandHandler: CommandHandler,
    private getGameTime: () => number,
    private getPlayerTracker: () => ContactTracker | undefined,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'advisor-panel';
    this.root.className = 'advisor-panel';

    const header = document.createElement('div');
    header.className = 'advisor-panel-header';
    header.textContent = 'Tactical Advisor';
    this.root.appendChild(header);

    this.list = document.createElement('div');
    this.list.className = 'advisor-list';
    this.root.appendChild(this.list);

    container.appendChild(this.root);
  }

  update(): void {
    const t = this.getGameTime();
    if (t - this.lastRefreshTime < REFRESH_GAME_SECONDS) return;
    this.lastRefreshTime = t;
    this.rebuild(t);
  }

  private rebuild(gameTime: number): void {
    const tracker = this.getPlayerTracker();
    if (!tracker || tracker.contacts.size === 0) {
      this.list.textContent = '';
      return;
    }

    const recs = this.computeRecommendations(tracker, gameTime);

    this.list.textContent = '';
    if (recs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'advisor-empty';
      empty.textContent = 'No fire opportunities in range.';
      this.list.appendChild(empty);
      return;
    }

    for (const rec of recs) {
      const row = document.createElement('div');
      row.className = 'advisor-row';

      const msg = document.createElement('span');
      msg.className = 'advisor-msg';
      msg.textContent = rec.text;
      row.appendChild(msg);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'advisor-fire-btn';
      btn.textContent = 'Fire';
      btn.title = `Execute: ${rec.text}`;
      btn.addEventListener('click', () => this.execute(rec, gameTime));
      row.appendChild(btn);

      this.list.appendChild(row);
    }
  }

  private execute(rec: Recommendation, gameTime: number): void {
    if (rec.type === 'railgun') {
      this.commandHandler.fireRailgunFromShip(rec.shipId, rec.targetId, gameTime);
    } else {
      this.commandHandler.launchMissileFromShip(rec.shipId, rec.targetId, gameTime);
    }
    // Force a refresh so the executed recommendation disappears
    this.lastRefreshTime = -999;
  }

  private computeRecommendations(tracker: ContactTracker, gameTime: number): Recommendation[] {
    const recs: Recommendation[] = [];
    const ships = this.world.query(COMPONENT.Ship, COMPONENT.Position, COMPONENT.Velocity);

    for (const shipId of ships) {
      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;

      const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;

      const best = this.findBestTarget(pos, vel, tracker);
      if (!best) continue;

      const targetName = this.getShipName(best.id) ?? 'Unknown';

      const railgun = this.world.getComponent<Railgun>(shipId, COMPONENT.Railgun);
      if (railgun && (railgun.integrity ?? 100) > 0 && railgun.ammo > 0) {
        const tVel = this.world.getComponent<Velocity>(best.id, COMPONENT.Velocity);
        const tSpeed = Math.hypot(tVel?.vx ?? 0, tVel?.vy ?? 0);
        const prob = hitProbability(best.dist, tSpeed, railgun.projectileSpeed, railgun.maxRange);
        if (prob >= MIN_RAILGUN_PROB) {
          const pct = Math.round(prob * 100);
          const ready = gameTime - railgun.lastFiredTime >= railgun.reloadTime;
          recs.push({
            key: `rg-${shipId}-${best.id}`,
            shipId,
            targetId: best.id,
            type: 'railgun',
            prob,
            text: `${ship.name} → ${targetName} [Railgun ${pct}%${ready ? '' : ' reloading'}]`,
          });
        }
      }

      const launcher = this.world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher);
      if (launcher && (launcher.integrity ?? 100) > 0 && launcher.ammo > 0) {
        const effectiveRange = launcher.maxRange * MISSILE_RANGE_FRACTION;
        if (best.dist <= effectiveRange && best.relSpeed <= MAX_MISSILE_REL_SPEED && best.closing >= 0) {
          const rangePct = Math.round((1 - best.dist / effectiveRange) * 80 + 20);
          const ready = gameTime - launcher.lastFiredTime >= launcher.reloadTime;
          recs.push({
            key: `ml-${shipId}-${best.id}`,
            shipId,
            targetId: best.id,
            type: 'missile',
            prob: rangePct / 100,
            text: `${ship.name} → ${targetName} [Missiles ~${rangePct}%${ready ? '' : ' reloading'}]`,
          });
        }
      }
    }

    // Sort by hit probability descending, cap at 6
    return recs.sort((a, b) => b.prob - a.prob).slice(0, 6);
  }

  private findBestTarget(
    pos: Position,
    vel: Velocity,
    tracker: ContactTracker,
  ): { id: EntityId; dist: number; relSpeed: number; closing: number } | null {
    let best: { id: EntityId; dist: number; relSpeed: number; closing: number } | null = null;
    for (const [id, contact] of tracker.contacts) {
      if (contact.lost) continue;
      if (!this.world.hasComponent(id, COMPONENT.Position)) continue;
      const dx = contact.lastKnownX - pos.x;
      const dy = contact.lastKnownY - pos.y;
      const dist = Math.hypot(dx, dy);
      if (best && dist >= best.dist) continue;
      const relVx = vel.vx - contact.lastKnownVx;
      const relVy = vel.vy - contact.lastKnownVy;
      const relSpeed = Math.hypot(relVx, relVy);
      const closing = dist > 0 ? (relVx * dx + relVy * dy) / dist : 0;
      best = { id, dist, relSpeed, closing };
    }
    return best;
  }

  private getShipName(entityId: EntityId): string | null {
    const ship = this.world.getComponent<Ship>(entityId, COMPONENT.Ship);
    return ship?.name ?? null;
  }
}
