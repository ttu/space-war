export type PendingOrderType = 'none' | 'move' | 'fireMissile' | 'fireRailgun';

export interface OrderBarCallbacks {
  onPendingOrderChange: (order: PendingOrderType) => void;
  onShadowToggle?: (enabled: boolean) => void;
}

/**
 * Context-sensitive command buttons. Sets a pending order; the game uses it on next right-click.
 */
export class OrderBar {
  private root: HTMLElement;
  private pendingOrder: PendingOrderType = 'none';
  private buttons: Map<PendingOrderType, HTMLButtonElement> = new Map();
  private shadowBtn!: HTMLButtonElement;
  private shadowsEnabled = true;

  constructor(
    container: HTMLElement,
    private callbacks: OrderBarCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'order-bar';
    this.root.className = 'order-bar-panel';

    const header = document.createElement('div');
    header.className = 'order-bar-header';
    header.textContent = 'Orders';
    this.root.appendChild(header);

    const btnMove = this.createOrderButton('Move', 'move', 'Right-click map to set destination');
    const btnMissile = this.createOrderButton('Fire missile', 'fireMissile', 'Right-click enemy to launch');
    const btnRailgun = this.createOrderButton('Fire railgun', 'fireRailgun', 'Right-click enemy or missile to fire');

    this.buttons.set('move', btnMove);
    this.buttons.set('fireMissile', btnMissile);
    this.buttons.set('fireRailgun', btnRailgun);

    this.root.appendChild(btnMove);
    this.root.appendChild(btnMissile);
    this.root.appendChild(btnRailgun);

    const separator = document.createElement('div');
    separator.className = 'order-bar-separator';
    this.root.appendChild(separator);

    this.shadowBtn = document.createElement('button');
    this.shadowBtn.type = 'button';
    this.shadowBtn.className = 'order-bar-btn order-bar-toggle active';
    this.shadowBtn.textContent = 'Shadows (V)';
    this.shadowBtn.title = 'Toggle sensor shadow zones for selected ships';
    this.shadowBtn.addEventListener('click', () => {
      this.toggleShadows();
    });
    this.root.appendChild(this.shadowBtn);

    container.appendChild(this.root);
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

  getPendingOrder(): PendingOrderType {
    return this.pendingOrder;
  }

  toggleShadows(): void {
    this.shadowsEnabled = !this.shadowsEnabled;
    this.shadowBtn.classList.toggle('active', this.shadowsEnabled);
    this.callbacks.onShadowToggle?.(this.shadowsEnabled);
  }

  getShadowsEnabled(): boolean {
    return this.shadowsEnabled;
  }
}
