import type { World } from '../engine/types';
import type { EntityId } from '../engine/types';
import {
  Ship,
  Hull,
  COMPONENT,
} from '../engine/components';

function pct(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, current / max));
}

/**
 * Ship roster with status bars (hull, optional systems). Highlights selected ships.
 */
export class FleetPanel {
  private root: HTMLElement;
  private list: HTMLElement;
  private shipRows = new Map<EntityId, HTMLElement>();

  constructor(
    container: HTMLElement,
    private world: World,
    private getSelectedIds: () => EntityId[],
  ) {
    this.root = document.createElement('div');
    this.root.id = 'fleet-panel';
    this.root.className = 'fleet-panel';

    const header = document.createElement('div');
    header.className = 'fleet-panel-header';
    header.textContent = 'Fleet';
    this.root.appendChild(header);

    this.list = document.createElement('div');
    this.list.className = 'fleet-panel-list';
    this.root.appendChild(this.list);

    container.appendChild(this.root);
  }

  /** Call each frame or when world/selection changes. */
  update(): void {
    const playerShips = this.world.query(
      COMPONENT.Position,
      COMPONENT.Ship,
      COMPONENT.Selectable,
    ).filter((id) => {
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
      return ship?.faction === 'player';
    });

    const selectedSet = new Set(this.getSelectedIds());

    // Reuse or create row per ship
    for (const id of playerShips) {
      let row = this.shipRows.get(id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'fleet-panel-row';
        row.dataset.entityId = id;
        const nameEl = document.createElement('span');
        nameEl.className = 'fleet-panel-name';
        row.appendChild(nameEl);
        const barWrap = document.createElement('div');
        barWrap.className = 'fleet-panel-bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'fleet-panel-bar';
        barWrap.appendChild(bar);
        row.appendChild(barWrap);
        this.list.appendChild(row);
        this.shipRows.set(id, row);
      }

      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      const hull = this.world.getComponent<Hull>(id, COMPONENT.Hull);
      const nameEl = row.querySelector('.fleet-panel-name')!;
      nameEl.textContent = ship.name;
      const bar = row.querySelector('.fleet-panel-bar') as HTMLElement;
      if (hull) {
        const frac = pct(hull.current, hull.max);
        bar.style.width = `${Math.round(frac * 100)}%`;
        bar.style.display = 'block';
      } else {
        bar.style.display = 'none';
      }

      row.classList.toggle('selected', selectedSet.has(id));
    }

    // Remove rows for entities that no longer exist
    for (const [id, row] of this.shipRows) {
      if (!playerShips.includes(id)) {
        row.remove();
        this.shipRows.delete(id);
      }
    }
  }
}
