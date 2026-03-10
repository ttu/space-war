/**
 * Pre-battle loadout editor. Modal UI to swap modules per ship (ML, PDC, Railgun, Sensor).
 * Operates on a scenario's player ships; on Apply returns an updated scenario with loadout overrides.
 */

import type { Scenario, ScenarioShip } from '../engine/data/ScenarioLoader';
import type { ShipLoadout } from '../engine/data/ShipTemplates';
import { getShipTemplate } from '../engine/data/ShipTemplates';
import {
  getModulesByKind,
} from '../engine/data/ModuleTemplates';

export interface ShipConfigScreenCallbacks {
  onApply: (scenario: Scenario) => void;
  onCancel: () => void;
}

export class ShipConfigScreen {
  private overlay: HTMLElement;
  private modal: HTMLElement;
  private scenario: Scenario;
  private loadouts: Map<number, ShipLoadout> = new Map(); // index in scenario.ships -> loadout override
  private callbacks: ShipConfigScreenCallbacks;

  constructor(
    scenario: Scenario,
    callbacks: ShipConfigScreenCallbacks,
    container: HTMLElement,
  ) {
    this.scenario = { ...scenario, ships: scenario.ships.map((s) => ({ ...s })) };
    this.callbacks = callbacks;

    this.overlay = document.createElement('div');
    this.overlay.className = 'ship-config-overlay';
    this.overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center;
      z-index: 100; font-family: var(--font-mono), monospace;
    `;

    this.modal = document.createElement('div');
    this.modal.className = 'ship-config-modal';
    this.modal.style.cssText = `
      background: var(--bg-surface, #0a0e18);
      border: 1px solid var(--border-subtle, rgba(60,140,255,0.15));
      border-radius: 6px;
      padding: 20px; max-width: 480px; width: 90%;
      max-height: 85vh; overflow-y: auto;
      color: var(--text-primary, #c8d8f0);
    `;

    const title = document.createElement('h2');
    title.textContent = 'Fleet Loadout';
    title.style.cssText = 'margin-bottom: 16px; font-size: 16px; color: var(--accent-cyan, #44cccc);';
    this.modal.appendChild(title);

    const shipList = document.createElement('div');
    shipList.className = 'ship-config-list';
    const playerShips = this.scenario.ships.filter((s) => s.faction === 'player');
    if (playerShips.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'No player ships in scenario.';
      p.style.color = 'var(--text-muted)';
      shipList.appendChild(p);
    } else {
      this.scenario.ships.forEach((ship, index) => {
        if (ship.faction !== 'player') return;
        this.renderShipSection(shipList, index, ship);
      });
    }
    this.modal.appendChild(shipList);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.className = 'btn-cancel';
    btnCancel.style.cssText = `
      padding: 8px 16px; cursor: pointer; font-family: inherit;
      background: transparent; border: 1px solid var(--border-subtle);
      color: var(--text-secondary); border-radius: 4px;
    `;
    btnCancel.addEventListener('click', () => this.close());
    const btnApply = document.createElement('button');
    btnApply.textContent = 'Apply & Start';
    btnApply.className = 'btn-apply';
    btnApply.style.cssText = `
      padding: 8px 16px; cursor: pointer; font-family: inherit;
      background: var(--accent-blue); border: none;
      color: var(--text-primary); border-radius: 4px;
    `;
    btnApply.addEventListener('click', () => this.apply());
    actions.appendChild(btnCancel);
    actions.appendChild(btnApply);
    this.modal.appendChild(actions);

    this.overlay.appendChild(this.modal);
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    container.appendChild(this.overlay);
  }

  private getLoadout(shipIndex: number): ShipLoadout {
    const existing = this.scenario.ships[shipIndex].loadout ?? {};
    const overrides = this.loadouts.get(shipIndex);
    return overrides ? { ...existing, ...overrides } : existing;
  }

  private setLoadoutSlot(shipIndex: number, slot: keyof ShipLoadout, moduleId: string): void {
    const cur = this.loadouts.get(shipIndex) ?? {};
    this.loadouts.set(shipIndex, { ...cur, [slot]: moduleId });
  }

  private renderShipSection(container: HTMLElement, shipIndex: number, ship: ScenarioShip): void {
    const template = getShipTemplate(ship.templateId);
    if (!template) return;

    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 16px; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 4px;';
    const nameLine = document.createElement('div');
    nameLine.style.cssText = 'font-weight: bold; margin-bottom: 8px;';
    nameLine.textContent = `${ship.name} (${template.name})`;
    section.appendChild(nameLine);

    const loadout = this.getLoadout(shipIndex);
    const slots: { key: keyof ShipLoadout; label: string; kind: 'missile_launcher' | 'pdc' | 'railgun' | 'sensor' }[] = [
      { key: 'missileLauncher', label: 'Missile launcher', kind: 'missile_launcher' },
      { key: 'pdc', label: 'PDC', kind: 'pdc' },
      { key: 'railgun', label: 'Railgun', kind: 'railgun' },
      { key: 'sensor', label: 'Sensor', kind: 'sensor' },
    ];

    for (const { key, label, kind } of slots) {
      const defaultId = template.defaultLoadout[key] ?? '';
      const currentId = loadout[key] ?? defaultId;
      const options = getModulesByKind(kind);
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
      const lab = document.createElement('label');
      lab.textContent = label;
      lab.style.minWidth = '120px';
      const select = document.createElement('select');
      select.style.cssText = 'flex: 1; padding: 4px; background: var(--bg-deepest); color: var(--text-primary); border: 1px solid var(--border-subtle); font-family: inherit;';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '—';
      select.appendChild(empty);
      for (const mod of options) {
        const opt = document.createElement('option');
        opt.value = mod.id;
        opt.textContent = mod.name;
        if (mod.id === currentId) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        this.setLoadoutSlot(shipIndex, key, select.value);
      });
      row.appendChild(lab);
      row.appendChild(select);
      section.appendChild(row);
    }

    container.appendChild(section);
  }

  private apply(): void {
    const scenario: Scenario = {
      ...this.scenario,
      ships: this.scenario.ships.map((s, i) => {
        const override = this.loadouts.get(i);
        return override ? { ...s, loadout: { ...s.loadout, ...override } } : s;
      }),
    };
    this.callbacks.onApply(scenario);
    this.close();
  }

  private close(): void {
    this.callbacks.onCancel();
    this.overlay.remove();
  }

  show(): void {
    this.overlay.style.display = 'flex';
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }
}

/**
 * Create and show the loadout modal. When user clicks Apply, onApply receives the scenario with loadout overrides.
 */
export function showShipConfigScreen(
  scenario: Scenario,
  container: HTMLElement,
  onApply: (scenario: Scenario) => void,
  onCancel?: () => void,
): ShipConfigScreen {
  const screen = new ShipConfigScreen(
    scenario,
    {
      onApply,
      onCancel: onCancel ?? (() => {}),
    },
    container,
  );
  screen.show();
  return screen;
}
