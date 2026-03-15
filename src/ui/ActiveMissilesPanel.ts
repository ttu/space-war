import type { World, EntityId } from '../engine/types';
import type { Position, Velocity, Ship, Missile } from '../engine/components';
import { COMPONENT } from '../engine/components';
import { missileHitProbability } from '../engine/utils/FiringComputer';

interface SalvoInfo {
  missileId: EntityId;
  targetName: string;
  count: number;
  distance: number;
  guidanceMode: string;
  fuel: number;
  hitProbability: number;
}

/**
 * Panel displaying all in-flight friendly missile salvos.
 * Shows target, count, distance, guidance mode, fuel, and hit probability.
 */
export class ActiveMissilesPanel {
  readonly header: HTMLElement;
  private list: HTMLElement;
  private root: HTMLElement;

  constructor(
    container: HTMLElement,
    private world: World,
    private playerFaction = 'player',
  ) {
    this.root = document.createElement('div');
    this.root.className = 'active-missiles-panel';

    this.header = document.createElement('div');
    this.header.className = 'active-missiles-header';
    this.header.textContent = 'Active Missiles';
    this.root.appendChild(this.header);

    this.list = document.createElement('div');
    this.list.className = 'active-missiles-list';
    this.root.appendChild(this.list);

    container.appendChild(this.root);
  }

  /** Call each frame to refresh the missile list. */
  update(): void {
    const salvos = this.collectSalvos();

    // Sort by distance, closest first
    salvos.sort((a, b) => a.distance - b.distance);

    // Update header count
    if (salvos.length > 0) {
      this.header.textContent = `Active Missiles (${salvos.length})`;
    } else {
      this.header.textContent = 'Active Missiles';
    }

    // Rebuild list
    this.list.textContent = '';

    if (salvos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'missile-salvo-row';
      empty.textContent = 'No active salvos';
      this.list.appendChild(empty);
      return;
    }

    for (const salvo of salvos) {
      this.renderSalvoRow(salvo);
    }
  }

  private collectSalvos(): SalvoInfo[] {
    const missileEntities = this.world.query(COMPONENT.Position, COMPONENT.Missile);
    const salvos: SalvoInfo[] = [];

    for (const mid of missileEntities) {
      const missile = this.world.getComponent<Missile>(mid, COMPONENT.Missile);
      if (!missile || missile.launcherFaction !== this.playerFaction) continue;

      const pos = this.world.getComponent<Position>(mid, COMPONENT.Position);
      const vel = this.world.getComponent<Velocity>(mid, COMPONENT.Velocity);
      const targetPos = this.world.getComponent<Position>(missile.targetId, COMPONENT.Position);
      const targetVel = this.world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);
      const targetShip = this.world.getComponent<Ship>(missile.targetId, COMPONENT.Ship);

      const targetName = targetShip ? targetShip.name : 'Unknown';
      const distance = pos && targetPos
        ? Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y)
        : Infinity;

      const hitP = pos && targetPos
        ? missileHitProbability(
            pos.x, pos.y,
            vel?.vx ?? 0, vel?.vy ?? 0,
            missile.accel, missile.fuel, missile.seekerRange,
            targetPos.x, targetPos.y,
            targetVel?.vx ?? 0, targetVel?.vy ?? 0,
          )
        : 0;

      salvos.push({
        missileId: mid,
        targetName,
        count: missile.count,
        distance,
        guidanceMode: missile.guidanceMode,
        fuel: missile.fuel,
        hitProbability: hitP,
      });
    }

    return salvos;
  }

  private renderSalvoRow(salvo: SalvoInfo): void {
    const row = document.createElement('div');
    row.className = 'missile-salvo-row';

    // Header line: target name and count
    const headerLine = document.createElement('div');
    headerLine.className = 'missile-salvo-header';
    const headerText = document.createTextNode(
      `→ ${salvo.targetName} (×${salvo.count})`,
    );
    headerLine.appendChild(headerText);
    row.appendChild(headerLine);

    // Distance with color coding
    const distLine = document.createElement('div');
    distLine.className = 'missile-salvo-detail';
    const distClass = this.distanceClass(salvo.distance);
    distLine.classList.add(distClass);
    const distText = salvo.distance === Infinity
      ? 'Distance: unknown'
      : `Distance: ${salvo.distance.toFixed(0)} km`;
    distLine.appendChild(document.createTextNode(distText));
    row.appendChild(distLine);

    // Guidance mode
    const guidanceLine = document.createElement('div');
    guidanceLine.className = 'missile-salvo-detail';
    guidanceLine.appendChild(document.createTextNode(`Guidance: ${salvo.guidanceMode}`));
    row.appendChild(guidanceLine);

    // Fuel remaining
    const fuelLine = document.createElement('div');
    fuelLine.className = 'missile-salvo-detail';
    fuelLine.appendChild(document.createTextNode(`Fuel: ${salvo.fuel.toFixed(1)} s`));
    row.appendChild(fuelLine);

    // Hit probability with color coding
    const hitPct = Math.round(salvo.hitProbability * 100);
    const hitLine = document.createElement('div');
    hitLine.className = 'missile-salvo-detail';
    hitLine.classList.add(this.hitProbabilityClass(hitPct));
    hitLine.appendChild(document.createTextNode(`Hit: ${hitPct}%`));
    row.appendChild(hitLine);

    this.list.appendChild(row);
  }

  private distanceClass(distance: number): string {
    if (distance < 50_000) return 'distance-close';
    if (distance < 150_000) return 'distance-medium';
    return 'distance-far';
  }

  private hitProbabilityClass(pct: number): string {
    if (pct >= 60) return 'hit-prob-high';
    if (pct >= 30) return 'hit-prob-medium';
    return 'hit-prob-low';
  }
}
