import type { EventBus } from '../engine/core/EventBus';
import type { GameTime } from '../engine/core/GameTime';

/**
 * Shows a modal alert when new threats are detected, auto-slowing the game to
 * 1× so the player has time to respond. Player dismisses to restore speed.
 */
const COOLDOWN_MS = 20_000;

const AUTO_DISMISS_MS = 8_000;

export class ThreatAlert {
  private overlay: HTMLElement;
  private msgEl: HTMLElement;
  private isVisible = false;
  private lastDismissedAt = 0;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    container: HTMLElement,
    private gameTime: GameTime,
    eventBus: EventBus,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'threat-alert';
    this.overlay.className = 'threat-alert-overlay';
    this.overlay.style.display = 'none';

    this.msgEl = document.createElement('div');
    this.msgEl.className = 'threat-alert-message';

    const btnRow = document.createElement('div');
    btnRow.className = 'threat-alert-btn-row';

    const btnContinue = document.createElement('button');
    btnContinue.type = 'button';
    btnContinue.className = 'threat-alert-ok';
    btnContinue.textContent = 'Continue';
    btnContinue.title = 'Restore previous speed';
    btnContinue.addEventListener('click', () => this.dismiss(true));

    const btnStay = document.createElement('button');
    btnStay.type = 'button';
    btnStay.className = 'threat-alert-stay';
    btnStay.textContent = 'Stay at 1×';
    btnStay.title = 'Keep 1× speed';
    btnStay.addEventListener('click', () => this.dismiss(false));

    btnRow.appendChild(btnContinue);
    btnRow.appendChild(btnStay);
    this.overlay.appendChild(this.msgEl);
    this.overlay.appendChild(btnRow);
    container.appendChild(this.overlay);

    // Alert when player sensors detect a new enemy ship
    eventBus.subscribe('ShipDetected', (e) => {
      const faction = e.data?.faction as string | undefined;
      // faction is tracker.faction — 'player' means our sensors picked up a new contact
      if (faction === 'player') {
        this.trigger('⚠ New hostile contact detected');
      }
    });

    // Alert on enemy missile launches
    eventBus.subscribe('MissileLaunched', (e) => {
      if (e.data?.faction === 'enemy') {
        const size = e.data?.salvoSize as number | undefined;
        this.trigger(`⚠ Hostile missile salvo inbound${size ? ` (${size} ${size === 1 ? 'missile' : 'missiles'})` : ''}`);
      }
    });
  }

  trigger(message: string): void {
    if (this.isVisible) return;
    if (this.gameTime.isGameOver) return;
    if (Date.now() - this.lastDismissedAt < COOLDOWN_MS) return;
    this.gameTime.slowToMin();
    this.msgEl.textContent = message;
    this.overlay.style.display = 'flex';
    this.isVisible = true;
    this.autoDismissTimer = setTimeout(() => this.dismiss(true), AUTO_DISMISS_MS);
  }

  /** @param restore true = resume prior speed, false = stay at 1× */
  dismiss(restore = true): void {
    if (this.autoDismissTimer !== null) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
    this.overlay.style.display = 'none';
    this.isVisible = false;
    this.lastDismissedAt = Date.now();
    if (restore) this.gameTime.restoreSpeed();
  }

  reset(): void {
    this.overlay.style.display = 'none';
    this.isVisible = false;
    this.lastDismissedAt = 0;
  }
}
