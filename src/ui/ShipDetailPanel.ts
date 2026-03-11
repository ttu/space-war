import type { World } from '../engine/types';
import type { EntityId } from '../engine/types';
import type { DetectedContact } from '../engine/components';
import type { Missile } from '../engine/components';
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
 * Selected ship systems, weapons, and current order.
 * Shows detail for all selected ships (player and enemy).
 * For enemy ships shows contact intel when getContact is provided.
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

    // Build missile target map: launcherId → { targetId, targetName, count }[]
    const missileTargets = this.buildMissileTargetMap();

    for (const id of ids) {
      this.renderShipDetail(id, missileTargets);
    }
  }

  private buildMissileTargetMap(): Map<EntityId, { targetId: EntityId; targetName: string; count: number }[]> {
    const map = new Map<EntityId, { targetId: EntityId; targetName: string; count: number }[]>();
    const missileEntities = this.world.query(COMPONENT.Position, COMPONENT.Missile);

    // Group missiles by target and faction, tracking which ships launched them
    // Missiles don't store launcherId directly, but we can show targets per-missile
    // For now, show "Missiles targeting: X" on enemy ships being targeted
    // And show active missiles from player ships

    for (const mid of missileEntities) {
      const missile = this.world.getComponent<Missile>(mid, COMPONENT.Missile)!;
      const targetShip = this.world.getComponent<Ship>(missile.targetId, COMPONENT.Ship);
      const targetName = targetShip ? targetShip.name : 'Unknown';

      // We don't have launcherId on missiles, so track by targetId for enemies
      // For the target ship's detail, show incoming missile count
      const existing = map.get(missile.targetId) ?? [];
      // Aggregate by faction
      const entry = existing.find(e => e.targetId === missile.targetId && e.targetName === missile.launcherFaction);
      if (entry) {
        entry.count += missile.count;
      } else {
        existing.push({ targetId: missile.targetId, targetName, count: missile.count });
      }
      map.set(missile.targetId, existing);
    }

    return map;
  }

  private renderShipDetail(
    id: EntityId,
    missileTargets: Map<EntityId, { targetId: EntityId; targetName: string; count: number }[]>,
  ): void {
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
      this.addRow(`Last known: (${Math.round(contact.lastKnownX)}, ${Math.round(contact.lastKnownY)})`);
      this.addRow(`Velocity: ${contact.lastKnownVx.toFixed(2)}, ${contact.lastKnownVy.toFixed(2)} km/s`);
      this.addRow(dataAge);
      if (contact.lost) {
        this.addRow('Contact lost', 'ship-detail-row ship-detail-lost');
      }
    } else if (isEnemy) {
      this.addRow('No sensor data — not currently detected', 'ship-detail-row ship-detail-muted');
    }

    // Show incoming missiles for this ship
    const incoming = missileTargets.get(id);
    if (incoming) {
      const totalCount = incoming.reduce((sum, e) => sum + e.count, 0);
      this.addRow(`⚠ ${totalCount} missile${totalCount > 1 ? 's' : ''} inbound`, 'ship-detail-row ship-detail-warning');
    }

    if (isEnemy) {
      this.addSeparator();
      return;
    }

    // Player ship details
    const hull = this.world.getComponent<Hull>(id, COMPONENT.Hull);
    if (hull) {
      this.addRow(`Hull: ${hull.current}/${hull.max}`);
    }

    const systems = this.world.getComponent<ShipSystems>(id, COMPONENT.ShipSystems);
    if (systems) {
      this.addRow(`Reactor ${pct(systems.reactor.current, systems.reactor.max)} | Engines ${pct(systems.engines.current, systems.engines.max)} | Sensors ${pct(systems.sensors.current, systems.sensors.max)}`);
    }

    const thruster = this.world.getComponent<Thruster>(id, COMPONENT.Thruster);
    if (thruster) {
      this.addRow(`Thrust: ${(thruster.throttle * 100).toFixed(0)}%`);
    }

    const nav = this.world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    if (nav) {
      this.addRow(`Order: Move → (${Math.round(nav.targetX)}, ${Math.round(nav.targetY)}) [${nav.phase}]`);
    }

    // Show active missile targets from this ship's missiles
    this.renderActiveMissiles(id);

    const ml = this.world.getComponent<MissileLauncher>(id, COMPONENT.MissileLauncher);
    if (ml) {
      const int = (ml.integrity ?? 100) > 0 ? 'OK' : 'OFF';
      this.addRow(`ML: ammo ${ml.ammo} | ${int}`);
    }

    const pdc = this.world.getComponent<PDC>(id, COMPONENT.PDC);
    if (pdc) {
      const int = (pdc.integrity ?? 100) > 0 ? 'OK' : 'OFF';
      this.addRow(`PDC: ${int}`);
    }

    const rg = this.world.getComponent<Railgun>(id, COMPONENT.Railgun);
    if (rg) {
      const int = (rg.integrity ?? 100) > 0 ? 'OK' : 'OFF';
      this.addRow(`Railgun: ${int}`);
    }

    this.addSeparator();
  }

  private renderActiveMissiles(shipId: EntityId): void {
    // Find missiles launched by this ship's faction that we can attribute
    // Since missiles don't store launcherId, show all player missiles and their targets
    const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship);
    if (!ship || ship.faction !== 'player') return;

    const missileEntities = this.world.query(COMPONENT.Position, COMPONENT.Missile);
    const targetCounts = new Map<string, number>();

    for (const mid of missileEntities) {
      const missile = this.world.getComponent<Missile>(mid, COMPONENT.Missile)!;
      if (missile.launcherFaction !== 'player') continue;
      const targetShip = this.world.getComponent<Ship>(missile.targetId, COMPONENT.Ship);
      const name = targetShip ? targetShip.name : 'Unknown';
      targetCounts.set(name, (targetCounts.get(name) ?? 0) + missile.count);
    }

    for (const [name, count] of targetCounts) {
      this.addRow(`Missiles → ${name}: ${count}`, 'ship-detail-row ship-detail-target');
    }
  }

  private addRow(text: string, className = 'ship-detail-row'): void {
    const row = document.createElement('div');
    row.className = className;
    row.textContent = text;
    this.content.appendChild(row);
  }

  private addSeparator(): void {
    const sep = document.createElement('hr');
    sep.className = 'ship-detail-separator';
    this.content.appendChild(sep);
  }
}
