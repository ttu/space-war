import type { EventBus } from '../engine/core/EventBus';
import type { World, EntityId } from '../engine/types';
import { Ship, COMPONENT } from '../engine/components';

const TOAST_LIFETIME_MS = 2200;

/**
 * Brief on-screen confirmations for player actions: move orders issued,
 * missiles launched, railguns fired, and order rejections. Toasts queue at
 * the top-center, fade after a couple seconds, and never block clicks.
 */
export class ActionToast {
  private wrap: HTMLElement;

  constructor(container: HTMLElement, private eventBus: EventBus, private world: World) {
    this.wrap = document.createElement('div');
    this.wrap.id = 'action-toast';
    this.wrap.className = 'action-toast-wrap';
    container.appendChild(this.wrap);

    this.eventBus.subscribe('MissileLaunched', (e) => {
      if (e.data?.faction !== 'player') return;
      const shooter = this.shipName(e.entityId!);
      const salvo = (e.data?.salvoSize as number) ?? 0;
      this.show(`${shooter} → missile salvo (${salvo})`, 'fire');
    });

    this.eventBus.subscribe('RailgunFired', (e) => {
      const shooter = this.shipComponent(e.entityId!);
      if (shooter?.faction !== 'player') return;
      this.show(`${shooter.name} → railgun`, 'fire');
    });

    this.eventBus.subscribe('OrderFeedback', (e) => {
      const msg = (e.data?.message as string) ?? '';
      if (!msg) return;
      const kind = (e.data?.kind as string) ?? 'info';
      this.show(msg, kind === 'error' ? 'error' : 'info');
    });
  }

  private shipComponent(id: EntityId): Ship | undefined {
    return this.world.getComponent<Ship>(id, COMPONENT.Ship);
  }

  private shipName(id: EntityId): string {
    return this.shipComponent(id)?.name ?? 'Ship';
  }

  private show(text: string, kind: 'fire' | 'info' | 'error'): void {
    const el = document.createElement('div');
    el.className = `action-toast action-toast-${kind}`;
    el.textContent = text;
    this.wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    window.setTimeout(() => {
      el.classList.remove('visible');
      window.setTimeout(() => el.remove(), 250);
    }, TOAST_LIFETIME_MS);
  }
}
