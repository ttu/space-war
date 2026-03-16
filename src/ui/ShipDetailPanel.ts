import type { World } from '../engine/types';
import type { EntityId } from '../engine/types';
import type { DetectedContact } from '../engine/components';
import type { CelestialBody } from '../engine/components';
import type { OrbitalPrimary } from '../engine/components';
import type { Missile } from '../engine/components';
import {
  Position,
  Velocity,
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
 * Selected ship systems, weapons, and current order; or selected planet/station info.
 * Shows detail for all selected ships (player and enemy), or one selected celestial body.
 * For enemy ships shows contact intel when getContact is provided.
 */
export class ShipDetailPanel {
  private root: HTMLElement;
  private content: HTMLElement;
  private header: HTMLElement;
  private expandedShipId: EntityId | null = null;

  constructor(
    container: HTMLElement,
    private world: World,
    private getSelectedIds: () => EntityId[],
    private getContact?: (entityId: EntityId) => DetectedContact | undefined,
    private getDetectedEnemyIds?: () => EntityId[],
    private getGameTime?: () => number,
    private getSelectedCelestialId?: () => EntityId | null,
    private onLockCamera?: (entityId: EntityId) => void,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'ship-detail-panel';
    this.root.className = 'ship-detail-panel';

    const header = document.createElement('div');
    header.className = 'ship-detail-header';
    header.textContent = 'Ship';
    this.header = header;
    this.root.appendChild(header);

    this.content = document.createElement('div');
    this.content.className = 'ship-detail-content';
    this.root.appendChild(this.content);

    this.content.addEventListener('click', (e: Event) => {
      const target = (e.target as Element).closest?.('button[data-lock-entity-id]');
      if (target instanceof HTMLButtonElement && target.dataset.lockEntityId && this.onLockCamera) {
        this.onLockCamera(target.dataset.lockEntityId as EntityId);
      }
    });
    this.content.addEventListener('mousedown', (e: Event) => {
      const target = (e.target as Element).closest?.('button[data-lock-entity-id]');
      if (target instanceof HTMLButtonElement && target.dataset.lockEntityId && this.onLockCamera) {
        e.preventDefault();
        this.onLockCamera(target.dataset.lockEntityId as EntityId);
      }
    });

    container.appendChild(this.root);
  }

  /** Call each frame or when selection changes. */
  update(): void {
    const celestialId = this.getSelectedCelestialId?.() ?? null;
    if (celestialId !== null) {
      this.renderCelestialDetail(celestialId);
      return;
    }

    const ids = this.getSelectedIds();
    this.header.textContent = 'Ship';
    this.content.textContent = '';

    if (ids.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'ship-detail-empty';
      msg.textContent = 'Select a ship';
      this.content.appendChild(msg);
      return;
    }

    // Build missile target map: targetId → { targetId, targetName, count }[]
    const missileTargets = this.buildMissileTargetMap();

    // Multi-select: compact row view
    if (ids.length > 1) {
      this.header.textContent = `Selected (${ids.length} ships)`;
      for (const id of ids) {
        const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
        if (!ship) {
          // Could be a missile entity
          const missile = this.world.getComponent<Missile>(id, COMPONENT.Missile);
          if (missile) this.renderMissileDetail(id, missile, ids);
          continue;
        }
        const isExpanded = this.expandedShipId === id;
        this.renderCompactShipRow(id, isExpanded);
        if (isExpanded) {
          this.renderShipDetail(id, missileTargets, ids, false);
        }
      }
      return;
    }

    for (const id of ids) {
      // Check if entity is a missile (no Ship component)
      const missile = this.world.getComponent<Missile>(id, COMPONENT.Missile);
      if (missile) {
        this.renderMissileDetail(id, missile, ids);
      } else {
        this.renderShipDetail(id, missileTargets, ids, ids.length === 1);
      }
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
    selectedIds: EntityId[],
    showLockCameraButton = false,
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
      const now = this.getGameTime?.() ?? 0;
      const ageSeconds = now > 0 && contact.receivedTime > 0 ? now - contact.receivedTime : 0;
      const dataAge = contact.receivedTime > 0 ? `Data age: ${Math.max(0, ageSeconds).toFixed(1)} s` : '—';
      this.addRow(`Last known: (${Math.round(contact.lastKnownX)}, ${Math.round(contact.lastKnownY)})`);
      this.addRow(`Velocity: ${contact.lastKnownVx.toFixed(2)}, ${contact.lastKnownVy.toFixed(2)} km/s`);
      const contactSpeed = Math.sqrt(contact.lastKnownVx ** 2 + contact.lastKnownVy ** 2);
      this.addRow(`Speed: ${contactSpeed.toFixed(2)} km/s`);
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

    // Distance to any selected enemy (opposite faction)
    this.renderDistanceToSelectedEnemies(id, ship.faction, isEnemy ? contact : undefined, selectedIds);

    if (isEnemy) {
      this.addSeparator();
      return;
    }

    // Player ship details
    const vel = this.world.getComponent<Velocity>(id, COMPONENT.Velocity);
    if (vel) {
      const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
      this.addRow(`Speed: ${speed.toFixed(2)} km/s`);
    }

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
      const viaWaypoint =
        Math.abs(nav.targetX - nav.destinationX) > 1 || Math.abs(nav.targetY - nav.destinationY) > 1;
      const suffix = viaWaypoint ? ' (via waypoint)' : '';
      this.addRow(`Order: Move → (${Math.round(nav.destinationX)}, ${Math.round(nav.destinationY)}) [${nav.phase}]${suffix}`);
    }

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
      this.addRow(`Railgun: ${int} (${rg.ammo}/${rg.maxAmmo})`, 'ship-detail-row ship-detail-weapon-railgun');
    }

    if (showLockCameraButton && this.onLockCamera) {
      const lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'ship-detail-lock-camera';
      lockBtn.textContent = 'Lock camera here';
      lockBtn.dataset.lockEntityId = id;
      this.content.appendChild(lockBtn);
    }

    this.addSeparator();
  }

  private renderMissileDetail(id: EntityId, missile: Missile, selectedIds: EntityId[]): void {
    const factionLabel = missile.launcherFaction === 'player' ? 'Friendly' : 'Enemy';
    const nameLine = document.createElement('div');
    nameLine.className = 'ship-detail-name';
    nameLine.textContent = `${factionLabel} Missile Salvo`;
    this.content.appendChild(nameLine);

    // Target info
    const targetShip = this.world.getComponent<Ship>(missile.targetId, COMPONENT.Ship);
    const targetName = targetShip ? targetShip.name : 'Unknown';
    this.addRow(`Target: ${targetName}`, 'ship-detail-row ship-detail-target');

    const pos = this.world.getComponent<Position>(id, COMPONENT.Position);
    const targetPos = this.world.getComponent<Position>(missile.targetId, COMPONENT.Position);
    if (pos && targetPos) {
      const distToTarget = Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y);
      this.addRow(`Distance to target: ${distToTarget.toFixed(0)} km`);
      this.addRow(`Hit probability: ${Math.round(missile.hitProbability * 100)}%`, 'ship-detail-row ship-detail-target');
    }

    // Salvo status
    this.addRow(`Count: ${missile.count}`);
    this.addRow(`Guidance: ${missile.guidanceMode}`);
    this.addRow(`Fuel: ${missile.fuel.toFixed(1)}s`);
    if (missile.armed) {
      this.addRow('Armed', 'ship-detail-row ship-detail-warning');
    } else {
      this.addRow('Unarmed (safe distance)');
    }

    // Position and velocity
    const vel = this.world.getComponent<Velocity>(id, COMPONENT.Velocity);
    if (pos) {
      this.addRow(`Pos: (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
    }
    if (vel) {
      const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
      this.addRow(`Speed: ${speed.toFixed(2)} km/s`);
    }

    // Distance to any selected enemy (opposite faction to launcher)
    if (pos) {
      for (const otherId of selectedIds) {
        if (otherId === id) continue;
        const otherShip = this.world.getComponent<Ship>(otherId, COMPONENT.Ship);
        if (!otherShip || otherShip.faction === missile.launcherFaction) continue;
        const otherPos = this.world.getComponent<Position>(otherId, COMPONENT.Position);
        if (!otherPos) continue;
        const dist = Math.hypot(otherPos.x - pos.x, otherPos.y - pos.y);
        this.addRow(`Distance to ${otherShip.name}: ${dist.toFixed(0)} km`, 'ship-detail-row ship-detail-target');
      }
    }

    this.addSeparator();
  }

  private renderDistanceToSelectedEnemies(
    id: EntityId,
    myFaction: string,
    contact: DetectedContact | undefined,
    selectedIds: EntityId[],
  ): void {
    const myPos = contact
      ? { x: contact.lastKnownX, y: contact.lastKnownY }
      : this.world.getComponent<Position>(id, COMPONENT.Position);
    if (!myPos) return;

    let added = false;
    for (const otherId of selectedIds) {
      if (otherId === id) continue;
      const otherShip = this.world.getComponent<Ship>(otherId, COMPONENT.Ship);
      if (!otherShip || otherShip.faction === myFaction) continue;
      const otherPos = this.world.getComponent<Position>(otherId, COMPONENT.Position);
      if (!otherPos) continue;
      const dist = Math.hypot(otherPos.x - myPos.x, otherPos.y - myPos.y);
      this.addRow(`Distance to ${otherShip.name}: ${dist.toFixed(0)} km`);
      added = true;
    }

    // When no enemy is selected, show distance to nearest detected enemy (player ships only)
    if (!added && myFaction === 'player' && this.getDetectedEnemyIds && this.getContact) {
      const detectedIds = this.getDetectedEnemyIds();
      let nearestDist = Infinity;
      let nearestName: string | null = null;
      for (const otherId of detectedIds) {
        const otherContact = this.getContact(otherId);
        if (!otherContact || otherContact.lost) continue;
        const otherShip = this.world.getComponent<Ship>(otherId, COMPONENT.Ship);
        if (!otherShip) continue;
        const dist = Math.hypot(otherContact.lastKnownX - myPos.x, otherContact.lastKnownY - myPos.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestName = otherShip.name;
        }
      }
      if (nearestName != null) {
        this.addRow(`Distance to ${nearestName}: ${nearestDist.toFixed(0)} km`);
      }
    }
  }

  private renderCompactShipRow(id: EntityId, isExpanded: boolean): void {
    const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
    if (!ship) return;

    const hull = this.world.getComponent<Hull>(id, COMPONENT.Hull);
    const ml = this.world.getComponent<MissileLauncher>(id, COMPONENT.MissileLauncher);
    const rg = this.world.getComponent<Railgun>(id, COMPONENT.Railgun);

    const prefix = isExpanded ? '▾' : '▸';
    const hullText = hull ? `${hull.current}/${hull.max}` : '';
    const parts: string[] = [hullText];
    if (ml) parts.push(`M:${ml.ammo}`);
    if (rg) parts.push(`R:${rg.ammo}`);
    const stats = parts.filter(Boolean).join(' · ');

    const row = document.createElement('div');
    row.className = 'ship-detail-compact-row';
    row.style.cursor = 'pointer';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.padding = '2px 4px';
    if (isExpanded) row.style.color = 'cyan';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${prefix} ${ship.name}`;
    const statsSpan = document.createElement('span');
    statsSpan.textContent = stats;
    statsSpan.style.opacity = '0.7';

    row.appendChild(nameSpan);
    row.appendChild(statsSpan);
    row.addEventListener('click', () => {
      this.expandedShipId = this.expandedShipId === id ? null : id;
    });

    this.content.appendChild(row);
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

  private renderCelestialDetail(entityId: EntityId): void {
    const body = this.world.getComponent<CelestialBody>(entityId, COMPONENT.CelestialBody);
    if (!body) return;

    const headerLabel =
      body.bodyType === 'station'
        ? 'Station'
        : body.bodyType.charAt(0).toUpperCase() + body.bodyType.slice(1);
    this.header.textContent = headerLabel;
    this.content.textContent = '';

    const nameLine = document.createElement('div');
    nameLine.className = 'ship-detail-name';
    nameLine.textContent = body.name;
    this.content.appendChild(nameLine);

    this.addRow(`Type: ${body.bodyType}`);
    this.addRow(`Radius: ${body.radius.toLocaleString()} km`);
    const massStr =
      body.mass >= 1e21
        ? `${(body.mass / 1e24).toFixed(2)}×10²⁴ kg`
        : body.mass >= 1e12
          ? `${(body.mass / 1e12).toFixed(0)}×10¹² kg`
          : `${body.mass.toLocaleString()} kg`;
    this.addRow(`Mass: ${massStr}`);

    const vel = this.world.getComponent<Velocity>(entityId, COMPONENT.Velocity);
    if (vel) {
      const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
      this.addRow(`Speed: ${speed.toFixed(1)} km/s`);
    }

    const orbital = this.world.getComponent<OrbitalPrimary>(entityId, COMPONENT.OrbitalPrimary);
    if (orbital) {
      const primaryBody = this.world.getComponent<CelestialBody>(orbital.primaryId, COMPONENT.CelestialBody);
      const primaryName = primaryBody?.name ?? 'Unknown';
      this.addRow(`Orbits: ${primaryName}`);
    }

    if (this.onLockCamera) {
      const lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'ship-detail-lock-camera';
      lockBtn.textContent = 'Lock camera here';
      lockBtn.dataset.lockEntityId = entityId;
      this.content.appendChild(lockBtn);
    }
  }
}
