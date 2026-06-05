import type { EventBus } from '../engine/core/EventBus';

export type PendingOrderType = 'none' | 'move' | 'fireMissile' | 'fireRailgun';

export interface OrderBarCallbacks {
  onPendingOrderChange: (order: PendingOrderType) => void;
  onPdcToggle?: (enabled: boolean) => void;
  onDarkToggle?: (enabled: boolean) => void;
}

const VOLLEY_OPTIONS = [1, 2, 4] as const;
type VolleyCount = typeof VOLLEY_OPTIONS[number];

/**
 * Context-sensitive command buttons. Sets a pending order; the game uses it on next right-click.
 */
export class OrderBar {
  private root: HTMLElement;
  private pendingOrder: PendingOrderType = 'none';
  private buttons: Map<PendingOrderType, HTMLButtonElement> = new Map();
  private pdcBtn!: HTMLButtonElement;
  private pdcEnabled = true;
  private pdcFiringTimer: ReturnType<typeof setTimeout> | null = null;
  private darkBtn!: HTMLButtonElement;
  private darkMode = false;
  private missileVolley: VolleyCount = 1;
  private volleyBtns: Map<VolleyCount, HTMLButtonElement> = new Map();

  constructor(
    container: HTMLElement,
    private callbacks: OrderBarCallbacks,
    eventBus?: EventBus,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'order-bar';
    this.root.className = 'order-bar-panel';

    const header = document.createElement('div');
    header.className = 'order-bar-header';
    header.textContent = 'Orders';
    this.root.appendChild(header);

    const btnMove = this.createOrderButton('Move (M)', 'move', 'Right-click map to set destination');
    const btnMissile = this.createOrderButton('Fire missile (F)', 'fireMissile', 'Right-click enemy to launch');
    const btnRailgun = this.createOrderButton('Fire railgun (R)', 'fireRailgun', 'Right-click enemy or missile to fire');

    this.buttons.set('move', btnMove);
    this.buttons.set('fireMissile', btnMissile);
    this.buttons.set('fireRailgun', btnRailgun);

    this.root.appendChild(btnMove);
    this.root.appendChild(btnMissile);
    this.root.appendChild(btnRailgun);

    // Missile volley selector
    const volleyRow = document.createElement('div');
    volleyRow.className = 'order-bar-volley-row';

    const volleyLabel = document.createElement('span');
    volleyLabel.className = 'order-bar-volley-label';
    volleyLabel.textContent = 'Salvo:';
    volleyRow.appendChild(volleyLabel);

    for (const n of VOLLEY_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'order-bar-btn order-bar-volley-btn' + (n === 1 ? ' active' : '');
      btn.textContent = `×${n}`;
      btn.title = `Fire ${n} missile${n > 1 ? `s, ${n * 4}s total` : ''}`;
      btn.addEventListener('click', () => this.setMissileVolley(n));
      this.volleyBtns.set(n, btn);
      volleyRow.appendChild(btn);
    }
    this.root.appendChild(volleyRow);

    const separator = document.createElement('div');
    separator.className = 'order-bar-separator';
    this.root.appendChild(separator);

    this.darkBtn = document.createElement('button');
    this.darkBtn.type = 'button';
    this.darkBtn.className = 'order-bar-btn order-bar-toggle';
    this.darkBtn.textContent = 'Go Dark (G)';
    this.darkBtn.title = 'Cut all emissions — undetectable but cannot maneuver or fire';
    this.darkBtn.addEventListener('click', () => this.toggleDark());
    this.root.appendChild(this.darkBtn);

    this.pdcBtn = document.createElement('button');
    this.pdcBtn.type = 'button';
    this.pdcBtn.className = 'order-bar-btn order-bar-toggle active';
    this.pdcBtn.textContent = 'PDC (P)';
    this.pdcBtn.title = 'Toggle point defense — automatically intercepts incoming missiles';
    this.pdcBtn.addEventListener('click', () => this.togglePdc());
    this.root.appendChild(this.pdcBtn);

    container.appendChild(this.root);

    eventBus?.subscribe('PDCFiring', (e) => {
      if (e.data?.faction === 'player') this.flashPdc();
    });
  }

  private flashPdc(): void {
    this.pdcBtn.classList.add('pdc-firing');
    if (this.pdcFiringTimer !== null) clearTimeout(this.pdcFiringTimer);
    this.pdcFiringTimer = setTimeout(() => {
      this.pdcBtn.classList.remove('pdc-firing');
      this.pdcFiringTimer = null;
    }, 350);
  }

  private createOrderButton(
    label: string,
    order: PendingOrderType,
    title: string,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'order-bar-btn';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => {
      const next = this.pendingOrder === order ? 'none' : order;
      this.setPendingOrder(next);
      this.callbacks.onPendingOrderChange(next);
    });
    return btn;
  }

  setPendingOrder(order: PendingOrderType): void {
    this.pendingOrder = order;
    this.buttons.forEach((btn, key) => {
      btn.classList.toggle('active', key === order);
    });
  }

  /** Toggle a pending order from a hotkey: same effect as clicking the button. */
  toggleOrder(order: Exclude<PendingOrderType, 'none'>): void {
    const next = this.pendingOrder === order ? 'none' : order;
    this.setPendingOrder(next);
    this.callbacks.onPendingOrderChange(next);
  }

  getPendingOrder(): PendingOrderType {
    return this.pendingOrder;
  }

  private setMissileVolley(n: VolleyCount): void {
    this.missileVolley = n;
    this.volleyBtns.forEach((btn, key) => {
      btn.classList.toggle('active', key === n);
    });
  }

  getMissileVolley(): number {
    return this.missileVolley;
  }

  toggleDark(): void {
    this.darkMode = !this.darkMode;
    this.darkBtn.classList.toggle('active', this.darkMode);
    this.callbacks.onDarkToggle?.(this.darkMode);
  }

  setDarkMode(enabled: boolean): void {
    this.darkMode = enabled;
    this.darkBtn.classList.toggle('active', this.darkMode);
  }

  getDarkMode(): boolean {
    return this.darkMode;
  }

  togglePdc(): void {
    this.pdcEnabled = !this.pdcEnabled;
    this.pdcBtn.classList.toggle('active', this.pdcEnabled);
    this.callbacks.onPdcToggle?.(this.pdcEnabled);
  }

  getPdcEnabled(): boolean {
    return this.pdcEnabled;
  }
}
