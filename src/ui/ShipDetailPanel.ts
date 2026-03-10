import type { World } from '../engine/types';
import type { EntityId } from '../engine/types';
import {
  Ship,
  Hull,
  ShipSystems,
  Thruster,
  NavigationOrder,
  MissileLauncher,
  PDC,
  Railgun,
  COMPONENT,
} from '../engine/components';

function pct(current: number, max: number): string {
  if (max <= 0) return '0%';
  return `${Math.round((100 * Math.max(0, Math.min(1, current / max))))}%`;
}

/**
 * Selected ship systems, weapons, and current order. Single selection shows full detail.
 */
export class ShipDetailPanel {
  private root: HTMLElement;
  private content: HTMLElement;

  constructor(
    container: HTMLElement,
    private world: World,
    private getSelectedIds: () => EntityId[],
  ) {
    this.root = document.createElement('div');
    this.root.id = 'ship-detail-panel';
    this.root.className = 'ship-detail-panel';

    const header = document.createElement('div');
    header.className = 'ship-detail-header';
    header.textContent = 'Ship';
    this.root.appendChild(header);

    this.content = document.createElement('div');
    this.content.className = 'ship-detail-content';
    this.root.appendChild(this.content);

    container.appendChild(this.root);
  }

  /** Call each frame or when selection changes. */
  update(): void {
    const ids = this.getSelectedIds();
    this.content.textContent = '';

    if (ids.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'ship-detail-empty';
      msg.textContent = 'Select a ship';
      this.content.appendChild(msg);
      return;
    }

    if (ids.length > 1) {
      const msg = document.createElement('p');
      msg.className = 'ship-detail-multi';
      msg.textContent = `${ids.length} ships selected`;
      this.content.appendChild(msg);
      return;
    }

    const id = ids[0];
    const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
    if (!ship) return;

    const nameLine = document.createElement('div');
    nameLine.className = 'ship-detail-name';
    nameLine.textContent = `${ship.name} (${ship.hullClass})`;
    this.content.appendChild(nameLine);

    const hull = this.world.getComponent<Hull>(id, COMPONENT.Hull);
    if (hull) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row';
      row.textContent = `Hull: ${hull.current}/${hull.max}`;
      this.content.appendChild(row);
    }

    const systems = this.world.getComponent<ShipSystems>(id, COMPONENT.ShipSystems);
    if (systems) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row';
      row.textContent = `Reactor ${pct(systems.reactor.current, systems.reactor.max)} | Engines ${pct(systems.engines.current, systems.engines.max)} | Sensors ${pct(systems.sensors.current, systems.sensors.max)}`;
      this.content.appendChild(row);
    }

    const thruster = this.world.getComponent<Thruster>(id, COMPONENT.Thruster);
    if (thruster) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row';
      row.textContent = `Thrust: ${(thruster.throttle * 100).toFixed(0)}%`;
      this.content.appendChild(row);
    }

    const nav = this.world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    if (nav) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row';
      row.textContent = `Order: Move → (${Math.round(nav.targetX)}, ${Math.round(nav.targetY)}) [${nav.phase}]`;
      this.content.appendChild(row);
    }

    const ml = this.world.getComponent<MissileLauncher>(id, COMPONENT.MissileLauncher);
    if (ml) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row';
      const int = (ml.integrity ?? 100) > 0 ? 'OK' : 'OFF';
      row.textContent = `ML: ammo ${ml.ammo} | ${int}`;
      this.content.appendChild(row);
    }

    const pdc = this.world.getComponent<PDC>(id, COMPONENT.PDC);
    if (pdc) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row';
      const int = (pdc.integrity ?? 100) > 0 ? 'OK' : 'OFF';
      row.textContent = `PDC: ${int}`;
      this.content.appendChild(row);
    }

    const rg = this.world.getComponent<Railgun>(id, COMPONENT.Railgun);
    if (rg) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row';
      const int = (rg.integrity ?? 100) > 0 ? 'OK' : 'OFF';
      row.textContent = `Railgun: ${int}`;
      this.content.appendChild(row);
    }
  }
}
