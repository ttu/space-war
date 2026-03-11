import type { World } from '../engine/types';
import type { EntityId } from '../engine/types';
import type { DetectedContact } from '../engine/components';
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
 * For enemy ships shows contact intel (last known position, data age, velocity) when getContact is provided.
 */
export class ShipDetailPanel {
  private root: HTMLElement;
  private content: HTMLElement;

  constructor(
    container: HTMLElement,
    private world: World,
    private getSelectedIds: () => EntityId[],
    private getContact?: (entityId: EntityId) => DetectedContact | undefined,
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

    const isEnemy = ship.faction !== 'player';
    const contact = isEnemy ? this.getContact?.(id) : undefined;

    const nameLine = document.createElement('div');
    nameLine.className = 'ship-detail-name';
    nameLine.textContent = `${ship.name} (${ship.hullClass})${isEnemy ? ' — Contact' : ''}`;
    this.content.appendChild(nameLine);

    if (isEnemy && contact) {
      const dataAge = contact.receivedTime > 0 ? 'Data age: ' + contact.receivedTime.toFixed(1) + ' s' : '—';
      const row1 = document.createElement('div');
      row1.className = 'ship-detail-row';
      row1.textContent = `Last known: (${Math.round(contact.lastKnownX)}, ${Math.round(contact.lastKnownY)})`;
      this.content.appendChild(row1);
      const row2 = document.createElement('div');
      row2.className = 'ship-detail-row';
      row2.textContent = `Velocity: ${contact.lastKnownVx.toFixed(2)}, ${contact.lastKnownVy.toFixed(2)} km/s`;
      this.content.appendChild(row2);
      const row3 = document.createElement('div');
      row3.className = 'ship-detail-row';
      row3.textContent = dataAge;
      this.content.appendChild(row3);
      if (contact.lost) {
        const row4 = document.createElement('div');
        row4.className = 'ship-detail-row ship-detail-lost';
        row4.textContent = 'Contact lost';
        this.content.appendChild(row4);
      }
      return;
    }

    if (isEnemy) {
      const row = document.createElement('div');
      row.className = 'ship-detail-row ship-detail-muted';
      row.textContent = 'No sensor data — not currently detected';
      this.content.appendChild(row);
      return;
    }

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
