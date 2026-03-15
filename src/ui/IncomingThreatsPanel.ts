import type { World, EntityId } from '../engine/types';
import { Position, Velocity, Missile, PDC, COMPONENT } from '../engine/components';

interface ThreatEntry {
  missileId: EntityId;
  targetId: EntityId;
  count: number;
  distance: number;
  closingSpeed: number;
  eta: number | null;
  pdcStatus: 'engaging' | 'out-of-range' | 'no-pdc';
}

/**
 * Panel showing enemy missiles targeting the selected player ship(s).
 * Sorted by distance (closest first).
 */
export class IncomingThreatsPanel {
  private root: HTMLElement;
  private headerEl: HTMLElement;
  private listEl: HTMLElement;

  readonly header: HTMLElement;

  constructor(
    container: HTMLElement,
    private world: World,
    private getSelectedPlayerIds: () => EntityId[],
    private playerFaction = 'player',
  ) {
    this.root = document.createElement('div');
    this.root.className = 'incoming-threats-panel';

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'incoming-threats-header';
    this.headerEl.textContent = 'Incoming';
    this.root.appendChild(this.headerEl);

    this.listEl = document.createElement('div');
    this.listEl.className = 'incoming-threats-list';
    this.root.appendChild(this.listEl);

    container.appendChild(this.root);

    this.header = this.headerEl;
  }

  /** Call each frame or when selection/world changes. */
  update(): void {
    this.listEl.textContent = '';

    const selectedIds = this.getSelectedPlayerIds();

    if (selectedIds.length === 0) {
      this.headerEl.textContent = 'Incoming';
      const msg = document.createElement('p');
      msg.className = 'threat-empty';
      msg.textContent = 'Select a ship';
      this.listEl.appendChild(msg);
      return;
    }

    const selectedSet = new Set<EntityId>(selectedIds);
    const threats = this.collectThreats(selectedSet);

    if (threats.length === 0) {
      this.headerEl.textContent = 'Incoming';
      const msg = document.createElement('p');
      msg.className = 'threat-empty';
      msg.textContent = 'No incoming threats';
      this.listEl.appendChild(msg);
      return;
    }

    // Sort by distance — closest first
    threats.sort((a, b) => a.distance - b.distance);

    const totalCount = threats.reduce((sum, t) => sum + t.count, 0);
    this.headerEl.textContent = `⚠ Incoming (${totalCount})`;

    for (const threat of threats) {
      this.renderThreat(threat);
    }
  }

  private collectThreats(selectedSet: Set<EntityId>): ThreatEntry[] {
    const missileEntities = this.world.query(COMPONENT.Position, COMPONENT.Missile);
    const threats: ThreatEntry[] = [];

    for (const mid of missileEntities) {
      const missile = this.world.getComponent<Missile>(mid, COMPONENT.Missile);
      if (!missile) continue;
      if (missile.launcherFaction === this.playerFaction) continue;
      if (!selectedSet.has(missile.targetId)) continue;

      const missilePos = this.world.getComponent<Position>(mid, COMPONENT.Position);
      const targetPos = this.world.getComponent<Position>(missile.targetId, COMPONENT.Position);
      if (!missilePos || !targetPos) continue;

      const dx = targetPos.x - missilePos.x;
      const dy = targetPos.y - missilePos.y;
      const distance = Math.hypot(dx, dy);

      // Unit vector along line of sight (missile → target)
      const losX = distance > 0 ? dx / distance : 0;
      const losY = distance > 0 ? dy / distance : 0;

      // Relative velocity of missile w.r.t. target (closing = positive)
      const missileVel = this.world.getComponent<Velocity>(mid, COMPONENT.Velocity);
      const targetVel = this.world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);

      const relVx = (missileVel?.vx ?? 0) - (targetVel?.vx ?? 0);
      const relVy = (missileVel?.vy ?? 0) - (targetVel?.vy ?? 0);

      // Closing speed = projection of relative velocity onto LOS, clamped >= 0
      const closingSpeed = Math.max(0, relVx * losX + relVy * losY);

      const eta = closingSpeed > 0 ? distance / closingSpeed : null;

      const pdcStatus = this.getPdcStatus(missile.targetId, distance);

      threats.push({
        missileId: mid,
        targetId: missile.targetId,
        count: missile.count,
        distance,
        closingSpeed,
        eta,
        pdcStatus,
      });
    }

    return threats;
  }

  private getPdcStatus(targetId: EntityId, distance: number): 'engaging' | 'out-of-range' | 'no-pdc' {
    const pdc = this.world.getComponent<PDC>(targetId, COMPONENT.PDC);
    if (!pdc || (pdc.integrity !== undefined && pdc.integrity <= 0)) {
      return 'no-pdc';
    }
    const range = pdc.range ?? 5000;
    return distance <= range ? 'engaging' : 'out-of-range';
  }

  private renderThreat(threat: ThreatEntry): void {
    const row = document.createElement('div');
    row.className = 'threat-salvo-row';

    const headerEl = document.createElement('div');
    headerEl.className = 'missile-salvo-header';

    const countSpan = document.createElement('span');
    countSpan.className = 'threat-count';
    countSpan.textContent = `${threat.count} missile${threat.count !== 1 ? 's' : ''}`;
    headerEl.appendChild(countSpan);

    const distSpan = document.createElement('span');
    distSpan.className = 'threat-distance';
    distSpan.textContent = ` — ${Math.round(threat.distance).toLocaleString()} km`;
    headerEl.appendChild(distSpan);

    row.appendChild(headerEl);

    const detailEl = document.createElement('div');
    detailEl.className = 'missile-salvo-detail';

    // Closing speed
    const speedLine = document.createElement('div');
    speedLine.textContent = `Closing: ${threat.closingSpeed.toFixed(2)} km/s`;
    detailEl.appendChild(speedLine);

    // ETA
    const etaLine = document.createElement('div');
    const etaText = threat.eta !== null ? `${threat.eta.toFixed(1)} s` : '—';
    etaLine.textContent = `ETA: ${etaText}`;
    detailEl.appendChild(etaLine);

    // PDC status
    const pdcLine = document.createElement('div');
    pdcLine.className = `threat-pdc threat-pdc-${threat.pdcStatus}`;
    if (threat.pdcStatus === 'engaging') {
      pdcLine.textContent = 'PDC: Engaging';
    } else if (threat.pdcStatus === 'out-of-range') {
      pdcLine.textContent = 'PDC: Out of range';
    } else {
      pdcLine.textContent = 'PDC: No PDC';
    }
    detailEl.appendChild(pdcLine);

    row.appendChild(detailEl);
    this.listEl.appendChild(row);
  }
}
