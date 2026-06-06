import type { EventBus } from '../engine/core/EventBus';
import type { GameEvent } from '../engine/types';

const MAX_ENTRIES = 100;

function formatEventTime(time: number): string {
  const totalSeconds = Math.floor(time);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `T+${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `T+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** AI-internal decision events that should not appear in the combat log. */
const AI_INTERNAL_EVENTS = new Set([
  'AIFireRailgun', 'AIFireMissile', 'AIMoveOrder',
  // PDC fires every tick when engaged; render-only event, would flood the log.
  'PDCFiring',
]);

function eventSummary(e: GameEvent): string | null {
  if (AI_INTERNAL_EVENTS.has(e.type)) return null;
  const t = formatEventTime(e.time);
  const typeLabel = e.type.replace(/([A-Z])/g, ' $1').trim();
  switch (e.type) {
    case 'MissileLaunched': {
      const totalMissiles = e.data?.totalMissiles as number | undefined;
      const launchFaction = e.data?.faction as string | undefined;
      const prefix = launchFaction === 'player' ? '' : 'Enemy ';
      if (totalMissiles && totalMissiles > 1) {
        return `${t} ${prefix}${totalMissiles} missiles launched`;
      }
      return `${t} ${prefix}Missile launched`;
    }
    case 'MissileIntercepted': {
      const count = e.data?.count as number | undefined;
      const interceptFaction = e.data?.faction as string | undefined;
      if (interceptFaction === 'player') {
        return count && count > 1
          ? `${t} ${count} enemy missiles intercepted`
          : `${t} Enemy missile intercepted`;
      }
      return count && count > 1
        ? `${t} ${count} missiles lost to enemy PDC`
        : `${t} Missile lost to enemy PDC`;
    }
    case 'MissileImpact':
      return `${t} Missile impact`;
    case 'RailgunFired': {
      const railgunFaction = e.data?.faction as string | undefined;
      return railgunFaction === 'player' ? `${t} Railgun fired` : `${t} Enemy railgun fired`;
    }
    case 'RailgunHit': {
      const hitFaction = e.data?.faction as string | undefined;
      return hitFaction === 'player' ? `${t} Railgun hit` : `${t} Enemy railgun hit`;
    }
    case 'PDCFiring':
      return `${t} PDC firing`;
    case 'PDCHit': {
      const hits = e.data?.hits as number | undefined;
      const dmg = e.data?.damage as number | undefined;
      const faction = e.data?.faction as string | undefined;
      const hitWord = hits === 1 ? 'hit' : 'hits';
      const label = faction === 'player' ? 'PDC' : 'Enemy PDC';
      return `${t} ${label}: ${hits ?? '?'} ${hitWord}, ${dmg ?? '?'} dmg`;
    }
    case 'ShipDetected': {
      const n = e.data?.count as number | undefined;
      if (n && n > 1) return `${t} ${n} contacts detected`;
      const name = e.data?.shipName as string | undefined;
      return name ? `${t} Contact: ${name}` : `${t} Contact detected`;
    }
    case 'ShipLostContact': {
      const n = e.data?.count as number | undefined;
      if (n && n > 1) return `${t} ${n} contacts lost`;
      const name = e.data?.shipName as string | undefined;
      return name ? `${t} Contact lost: ${name}` : `${t} Contact lost`;
    }
    case 'SystemDamaged': {
      const systems = e.data?.systems as string[] | undefined;
      if (systems && systems.length > 0) {
        return `${t} Systems damaged: ${systems.join(', ')}`;
      }
      return `${t} System damaged: ${(e.data?.system as string) ?? '?'}`;
    }
    case 'ShipDestroyed': {
      const name = e.data?.shipName as string | undefined;
      return name ? `${t} ${name} destroyed` : `${t} Ship Destroyed`;
    }
    case 'ShipDisabled': {
      const name = e.data?.shipName as string | undefined;
      return name ? `${t} ${name} disabled` : `${t} Ship Disabled`;
    }
    case 'ThrustStarted':
      return `${t} Thrust started`;
    case 'ThrustStopped':
      return `${t} Thrust stopped`;
    case 'GamePaused':
      return `${t} Game paused`;
    case 'GameResumed':
      return `${t} Game resumed`;
    case 'VictoryAchieved':
      return `${t} Victory`;
    case 'DefeatSuffered': {
      const reason = e.data?.reason as string | undefined;
      return reason ? `${t} Defeat: ${reason}` : `${t} Defeat`;
    }
    case 'CelestialCollision':
      return `${t} ${e.data?.collision === 'impact' ? 'Crashed into' : 'Burned up near'} ${e.data?.bodyName ?? 'celestial body'}`;
    case 'OrderFeedback':
      return `${t} ${(e.data?.message as string) ?? typeLabel}`;
    default:
      return `${t} ${typeLabel}`;
  }
}

/** @internal exported for unit tests */
export const _aggregatePDCHitsForTest = (events: GameEvent[]) => aggregatePDCHits(events);
export const _aggregateSystemDamagedForTest = (events: GameEvent[]) => aggregateSystemDamaged(events);
export const _aggregateMissileLaunchedForTest = (events: GameEvent[]) => aggregateMissileLaunched(events);
export const _aggregateMissileInterceptedForTest = (events: GameEvent[]) => aggregateMissileIntercepted(events);
export const _aggregateContactEventsForTest = (events: GameEvent[]) => aggregateContactEvents(events);

/**
 * Collapses PDCHit events of the same faction within a 30-second window into
 * a single synthetic event with aggregated hit counts. Groups by faction rather
 * than attacker-target pair to prevent log flooding during sustained close-range
 * engagements with multiple ships.
 */
function aggregatePDCHits(events: GameEvent[]): GameEvent[] {
  const PDC_WINDOW = 30;
  const result: GameEvent[] = [];
  const skip = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (skip.has(i)) continue;
    const e = events[i];
    if (e.type !== 'PDCHit') {
      result.push(e);
      continue;
    }
    let totalHits = (e.data?.hits as number) ?? 0;
    let totalDamage = (e.data?.damage as number) ?? 0;
    const faction = e.data?.faction as string | undefined;
    const windowEnd = e.time + PDC_WINDOW;
    for (let j = i + 1; j < events.length; j++) {
      const other = events[j];
      if (other.time > windowEnd) break;
      if (other.type === 'PDCHit' && (other.data?.faction as string | undefined) === faction) {
        totalHits += (other.data?.hits as number) ?? 0;
        totalDamage += (other.data?.damage as number) ?? 0;
        skip.add(j);
      }
    }
    result.push({ ...e, data: { ...e.data, hits: totalHits, damage: totalDamage } });
  }
  return result;
}

/**
 * Collapses MissileLaunched events with the same faction within a 3-second
 * window into a single entry showing total salvos and missiles.
 */
function aggregateMissileLaunched(events: GameEvent[]): GameEvent[] {
  const WINDOW = 3;
  const result: GameEvent[] = [];
  const skip = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (skip.has(i)) continue;
    const e = events[i];
    if (e.type !== 'MissileLaunched') {
      result.push(e);
      continue;
    }
    let totalMissiles = 1;
    const faction = e.data?.faction;
    const windowEnd = e.time + WINDOW;
    for (let j = i + 1; j < events.length; j++) {
      const other = events[j];
      if (other.time > windowEnd) break;
      if (other.type === 'MissileLaunched' && other.data?.faction === faction) {
        totalMissiles++;
        skip.add(j);
      }
    }
    result.push({ ...e, data: { ...e.data, totalMissiles } });
  }
  return result;
}

/**
 * Collapses MissileIntercepted events within a 3-second window into a single
 * entry showing total missiles killed.
 */
function aggregateMissileIntercepted(events: GameEvent[]): GameEvent[] {
  const WINDOW = 3;
  const result: GameEvent[] = [];
  const skip = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (skip.has(i)) continue;
    const e = events[i];
    if (e.type !== 'MissileIntercepted') {
      result.push(e);
      continue;
    }
    let count = 1;
    const faction = e.data?.faction as string | undefined;
    const windowEnd = e.time + WINDOW;
    for (let j = i + 1; j < events.length; j++) {
      const other = events[j];
      if (other.time > windowEnd) break;
      if (other.type === 'MissileIntercepted' && (other.data?.faction as string | undefined) === faction) {
        count++;
        skip.add(j);
      }
    }
    result.push({ ...e, data: { ...e.data, count } });
  }
  return result;
}

/**
 * Collapses SystemDamaged events for the same ship within a 5-second window
 * into a single entry showing the unique systems affected.
 */
function aggregateSystemDamaged(events: GameEvent[]): GameEvent[] {
  const WINDOW = 5;
  const result: GameEvent[] = [];
  const skip = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (skip.has(i)) continue;
    const e = events[i];
    if (e.type !== 'SystemDamaged') {
      result.push(e);
      continue;
    }
    const systems = new Set<string>();
    if (e.data?.system) systems.add(e.data.system as string);
    const windowEnd = e.time + WINDOW;
    for (let j = i + 1; j < events.length; j++) {
      const other = events[j];
      if (other.time > windowEnd) break;
      if (other.type === 'SystemDamaged' && other.entityId === e.entityId) {
        if (other.data?.system) systems.add(other.data.system as string);
        skip.add(j);
      }
    }
    result.push({ ...e, data: { ...e.data, systems: Array.from(systems) } });
  }
  return result;
}

/**
 * Collapses bursts of ShipDetected / ShipLostContact events within a 2-second
 * window into a single entry so simultaneous detections don't flood the log.
 */
function aggregateContactEvents(events: GameEvent[]): GameEvent[] {
  const WINDOW = 2;
  const result: GameEvent[] = [];
  const skip = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (skip.has(i)) continue;
    const e = events[i];
    if (e.type !== 'ShipDetected' && e.type !== 'ShipLostContact') {
      result.push(e);
      continue;
    }
    let count = 1;
    const windowEnd = e.time + WINDOW;
    for (let j = i + 1; j < events.length; j++) {
      const other = events[j];
      if (other.time > windowEnd) break;
      if (other.type === e.type) {
        count++;
        skip.add(j);
      }
    }
    result.push({ ...e, data: { ...e.data, count } });
  }
  return result;
}

/**
 * Scrollable combat/event log fed from EventBus history.
 */
export class CombatLog {
  private wrap: HTMLElement;
  private root: HTMLElement;
  private list: HTMLElement;
  readonly header: HTMLElement;
  private lastEvent: GameEvent | undefined;

  constructor(
    container: HTMLElement,
    private eventBus: EventBus,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'combat-log-overlay';

    this.root = document.createElement('div');
    this.root.id = 'combat-log';
    this.root.className = 'combat-log-panel';

    this.header = document.createElement('div');
    this.header.className = 'combat-log-header';
    this.header.textContent = 'Combat log';
    const closeHint = document.createElement('span');
    closeHint.textContent = '(L to toggle)';
    closeHint.style.opacity = '0.5';
    closeHint.style.marginLeft = '8px';
    closeHint.style.fontSize = '10px';
    this.header.appendChild(closeHint);
    this.root.appendChild(this.header);

    this.list = document.createElement('div');
    this.list.className = 'combat-log-list';
    this.list.setAttribute('role', 'log');
    this.root.appendChild(this.list);

    this.wrap.appendChild(this.root);
    container.appendChild(this.wrap);

    eventBus.subscribe('VictoryAchieved', () => this.show());
    eventBus.subscribe('DefeatSuffered', () => this.show());
  }

  clear(): void {
    this.list.textContent = '';
    this.lastEvent = undefined;
    this.eventBus.clearHistory();
  }

  show(): void { this.wrap.style.display = ''; }
  hide(): void { this.wrap.style.display = 'none'; }
  toggle(): void { this.wrap.style.display === 'none' ? this.show() : this.hide(); }
  get visible(): boolean { return this.wrap.style.display !== 'none'; }

  /** Call when rendering or on a timer to refresh from event history. */
  update(): void {
    const history = this.eventBus.getHistory();
    const lastEvent = history[history.length - 1];
    if (lastEvent === this.lastEvent) return;
    this.lastEvent = lastEvent;

    const visible = history.filter(e => {
      if (AI_INTERNAL_EVENTS.has(e.type)) return false;
      // Only show the player's own sensor detections, not enemy sensor events
      if ((e.type === 'ShipDetected' || e.type === 'ShipLostContact') && e.data?.faction !== 'player') return false;
      return true;
    });
    const aggregated = aggregateContactEvents(
      aggregateSystemDamaged(
        aggregateMissileIntercepted(
          aggregateMissileLaunched(
            aggregatePDCHits(visible)
          )
        )
      )
    );
    const toShow = aggregated.slice(-MAX_ENTRIES);
    this.list.textContent = '';
    for (const e of toShow) {
      const summary = eventSummary(e);
      if (summary === null) continue;
      const line = document.createElement('div');
      line.className = 'combat-log-line';
      line.textContent = summary;
      this.list.appendChild(line);
    }
    this.list.scrollTop = this.list.scrollHeight;
  }
}
