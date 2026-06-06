import type { World, EntityId } from '../engine/types';
import {
  Position,
  Velocity,
  Ship,
  ContactTracker,
  MissileLauncher,
  Railgun,
  ShipSystems,
  COMPONENT,
} from '../engine/components';
import { hitProbability } from '../engine/utils/FiringComputer';
import type { CommandHandler } from '../game/CommandHandler';

const MIN_RAILGUN_PROB = 0.35;
const MISSILE_RANGE_FRACTION = 0.9;
const MAX_MISSILE_REL_SPEED = 100;
const REFRESH_GAME_SECONDS = 3;
/** Show approach ETA warning when contact enters range within this many game seconds. */
const APPROACH_WARN_SECONDS = 300;

interface Recommendation {
  key: string;
  shipId: EntityId;
  targetId: EntityId;
  text: string;
  type: 'railgun' | 'missile';
  prob: number;
}

interface StatusItem {
  text: string;
  kind: 'warn' | 'info' | 'muted';
}

function formatDist(d: number): string {
  if (d >= 1_000_000) return `${(d / 1_000_000).toFixed(1)}M km`;
  if (d >= 1000) return `${Math.round(d / 1000)}k km`;
  return `${Math.round(d)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * Shows AI fire-order recommendations for player ships. Player can approve
 * each with "Fire" or ignore. Updated on a throttled game-time interval.
 *
 * When no fire opportunities exist, shows situational status:
 * - Distance and approach rate to nearest contact with ETA to weapon range
 * - Weapons expended / damaged summary
 * - Ship system damage summary
 *
 * Urgent approach warnings also appear alongside active fire recommendations.
 */
export class AdvisorPanel {
  private root: HTMLElement;
  private list: HTMLElement;
  private lastRefreshTime = -999;
  private hadRecsLastUpdate = false;

  constructor(
    container: HTMLElement,
    private world: World,
    private commandHandler: CommandHandler,
    private getGameTime: () => number,
    private getPlayerTracker: () => ContactTracker | undefined,
    private onFireOpportunity?: () => void,
    private getMissileVolley?: () => number,
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

  reset(): void {
    this.lastRefreshTime = -999;
    this.hadRecsLastUpdate = false;
    this.list.textContent = '';
  }

  update(): void {
    const t = this.getGameTime();
    if (t - this.lastRefreshTime < REFRESH_GAME_SECONDS) return;
    this.lastRefreshTime = t;
    this.rebuild(t);
  }

  private rebuild(gameTime: number): void {
    this.list.textContent = '';

    const tracker = this.getPlayerTracker();
    if (!tracker || tracker.contacts.size === 0) return;

    const recs = this.computeRecommendations(tracker, gameTime);
    const status = this.computeStatusItems(tracker, gameTime);

    if (recs.length > 0 && !this.hadRecsLastUpdate) {
      this.onFireOpportunity?.();
    }
    this.hadRecsLastUpdate = recs.length > 0;

    // Fire recommendations
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

    // Status items: show all when no recs, only urgent warnings alongside recs
    const statusToShow = recs.length === 0
      ? status
      : status.filter(s => s.kind === 'warn');

    if (recs.length === 0 && statusToShow.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'advisor-empty';
      empty.textContent = 'No fire opportunities in range.';
      this.list.appendChild(empty);
      return;
    }

    if (recs.length > 0 && statusToShow.length > 0) {
      const div = document.createElement('div');
      div.className = 'advisor-divider';
      this.list.appendChild(div);
    }

    for (const item of statusToShow) {
      const el = document.createElement('div');
      el.className = `advisor-status advisor-status-${item.kind}`;
      el.textContent = item.text;
      this.list.appendChild(el);
    }
  }

  private execute(rec: Recommendation, gameTime: number): void {
    if (rec.type === 'railgun') {
      this.commandHandler.fireRailgunFromShip(rec.shipId, rec.targetId, gameTime);
    } else {
      const volleyCount = this.getMissileVolley?.() ?? 1;
      this.commandHandler.launchMissileFromShip(rec.shipId, rec.targetId, gameTime, volleyCount);
    }
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
        if (best.dist <= effectiveRange && best.relSpeed <= MAX_MISSILE_REL_SPEED) {
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

    return recs.sort((a, b) => b.prob - a.prob).slice(0, 6);
  }

  private computeStatusItems(tracker: ContactTracker, _gameTime: number): StatusItem[] {
    const items: StatusItem[] = [];

    // Gather player ship data
    const ships = this.world.query(COMPONENT.Ship, COMPONENT.Position, COMPONENT.Velocity);
    const playerShips: {
      name: string;
      pos: Position;
      vel: Velocity;
      railgun: Railgun | undefined;
      launcher: MissileLauncher | undefined;
      systems: ShipSystems | undefined;
    }[] = [];

    for (const shipId of ships) {
      const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      playerShips.push({
        name: ship.name,
        pos: this.world.getComponent<Position>(shipId, COMPONENT.Position)!,
        vel: this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!,
        railgun: this.world.getComponent<Railgun>(shipId, COMPONENT.Railgun) ?? undefined,
        launcher: this.world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher) ?? undefined,
        systems: this.world.getComponent<ShipSystems>(shipId, COMPONENT.ShipSystems) ?? undefined,
      });
    }

    if (playerShips.length === 0) return items;

    // Best available weapon ranges
    let bestRailgunRange = 0;
    let bestMissileRange = 0;
    let hasAnyLauncher = false;
    let missilesExpended = true;
    const damagedRailguns: string[] = [];
    const damagedSystems: string[] = [];

    for (const ps of playerShips) {
      if (ps.railgun) {
        const integrity = ps.railgun.integrity ?? 100;
        if (integrity <= 0) {
          damagedRailguns.push(ps.name);
        } else if (ps.railgun.ammo > 0) {
          bestRailgunRange = Math.max(bestRailgunRange, ps.railgun.maxRange);
        }
      }
      if (ps.launcher) {
        hasAnyLauncher = true;
        if ((ps.launcher.integrity ?? 100) > 0 && ps.launcher.ammo > 0) {
          bestMissileRange = Math.max(bestMissileRange, ps.launcher.maxRange);
          missilesExpended = false;
        }
      }
      if (ps.systems) {
        const parts: string[] = [];
        const r = Math.round(ps.systems.reactor.current / ps.systems.reactor.max * 100);
        const e = Math.round(ps.systems.engines.current / ps.systems.engines.max * 100);
        const s = Math.round(ps.systems.sensors.current / ps.systems.sensors.max * 100);
        if (r < 80) parts.push(`reactor ${r}%`);
        if (e < 80) parts.push(`engines ${e}%`);
        if (s < 80) parts.push(`sensors ${s}%`);
        if (parts.length > 0) damagedSystems.push(`${ps.name}: ${parts.join(', ')}`);
      }
    }

    const bestWeaponRange = Math.max(bestRailgunRange, bestMissileRange);
    const weaponName = bestMissileRange >= bestRailgunRange ? 'missile' : 'railgun';

    // Find nearest active contact and approach data
    let nearestDist = Infinity;
    let nearestName = '';
    let nearestClosing = 0;

    for (const [id, contact] of tracker.contacts) {
      if (!this.world.hasComponent(id, COMPONENT.Position)) continue;
      const name = this.getShipName(id) ?? 'Unknown';
      for (const ps of playerShips) {
        const dx = contact.lastKnownX - ps.pos.x;
        const dy = contact.lastKnownY - ps.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestName = name;
          const relVx = ps.vel.vx - contact.lastKnownVx;
          const relVy = ps.vel.vy - contact.lastKnownVy;
          nearestClosing = dist > 0 ? (relVx * dx + relVy * dy) / dist : 0;
        }
      }
    }

    // --- Contact range status ---
    if (nearestDist < Infinity && nearestDist > bestWeaponRange) {
      const gap = nearestDist - bestWeaponRange;

      if (nearestClosing > 0.5) {
        // Closing — compute ETA to weapon range; skip if impractically far
        const eta = gap / nearestClosing;
        const urgent = eta < APPROACH_WARN_SECONDS;
        if (eta > 6 * 3600) {
          // More than 6 hours away — just show distance, skip useless ETA
          items.push({
            text: `${nearestName}: ${formatDist(nearestDist)} — out of ${weaponName} range`,
            kind: 'muted',
          });
        } else {
          items.push({
            text: `${urgent ? '⚠ ' : ''}${nearestName}: ${formatDist(nearestDist)} — ${weaponName} range in ~${formatDuration(eta)}`,
            kind: urgent ? 'warn' : 'info',
          });
        }
      } else if (nearestClosing < -0.5) {
        items.push({
          text: `${nearestName}: ${formatDist(nearestDist)}, opening`,
          kind: 'muted',
        });
      } else {
        items.push({
          text: `${nearestName}: ${formatDist(nearestDist)} — out of ${weaponName} range (${formatDist(bestWeaponRange)})`,
          kind: 'info',
        });
      }
    }

    // --- Weapons status ---
    if (bestRailgunRange === 0 && bestMissileRange === 0) {
      items.push({ text: 'All weapons expended.', kind: 'muted' });
    } else if (hasAnyLauncher && missilesExpended) {
      items.push({ text: 'Missiles expended.', kind: 'muted' });
    }

    if (damagedRailguns.length > 0) {
      items.push({ text: `Railgun destroyed: ${damagedRailguns.join(', ')}`, kind: 'warn' });
    }

    // --- Ship damage ---
    for (const dmg of damagedSystems) {
      items.push({ text: dmg, kind: 'muted' });
    }

    return items;
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
