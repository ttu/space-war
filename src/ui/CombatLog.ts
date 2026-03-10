import type { EventBus } from '../engine/core/EventBus';
import type { GameEvent } from '../engine/types';

const MAX_ENTRIES = 100;

function formatEventTime(time: number): string {
  const totalSeconds = Math.floor(time);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `T+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function eventSummary(e: GameEvent): string {
  const t = formatEventTime(e.time);
  const typeLabel = e.type.replace(/([A-Z])/g, ' $1').trim();
  switch (e.type) {
    case 'MissileLaunched':
      return `${t} Missile launched (salvo ${e.data?.salvoSize ?? '?'})`;
    case 'MissileIntercepted':
      return `${t} Missile intercepted`;
    case 'MissileImpact':
      return `${t} Missile impact`;
    case 'RailgunFired':
      return `${t} Railgun fired`;
    case 'RailgunHit':
      return `${t} Railgun hit`;
    case 'PDCFiring':
      return `${t} PDC firing`;
    case 'ShipDetected':
      return `${t} Contact detected`;
    case 'ShipLostContact':
      return `${t} Contact lost`;
    case 'SystemDamaged':
      return `${t} System damaged`;
    case 'ShipDestroyed':
    case 'ShipDisabled':
      return `${t} ${typeLabel}`;
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
    case 'DefeatSuffered':
      return `${t} Defeat`;
    default:
      return `${t} ${typeLabel}`;
  }
}

/**
 * Scrollable combat/event log fed from EventBus history.
 */
export class CombatLog {
  private root: HTMLElement;
  private list: HTMLElement;
  private lastCount = 0;

  constructor(
    container: HTMLElement,
    private eventBus: EventBus,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'combat-log';
    this.root.className = 'combat-log-panel';

    const header = document.createElement('div');
    header.className = 'combat-log-header';
    header.textContent = 'Combat log';
    this.root.appendChild(header);

    this.list = document.createElement('div');
    this.list.className = 'combat-log-list';
    this.list.setAttribute('role', 'log');
    this.root.appendChild(this.list);

    container.appendChild(this.root);
  }

  /** Call when rendering or on a timer to refresh from event history. */
  update(): void {
    const history = this.eventBus.getHistory();
    if (history.length === this.lastCount) return;
    this.lastCount = history.length;

    const toShow = history.slice(-MAX_ENTRIES);
    this.list.textContent = '';
    for (const e of toShow) {
      const line = document.createElement('div');
      line.className = 'combat-log-line';
      line.textContent = eventSummary(e);
      this.list.appendChild(line);
    }
    this.list.scrollTop = this.list.scrollHeight;
  }
}
