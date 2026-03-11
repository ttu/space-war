import type { World } from '../engine/types';
import type { EntityId } from '../engine/types';
import type { ContactTracker } from '../engine/components';
import { Ship, COMPONENT } from '../engine/components';

/**
 * Lists detected enemy contacts (sensor contacts). Clicking a name focuses the camera on that contact.
 */
export class ContactsPanel {
  private root: HTMLElement;
  private list: HTMLElement;
  private contactRows = new Map<EntityId, HTMLElement>();

  constructor(
    container: HTMLElement,
    private world: World,
    private getContacts: () => ContactTracker | undefined,
    private getGameTime: () => number,
    private onContactClick?: (entityId: EntityId) => void,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'contacts-panel';
    this.root.className = 'contacts-panel';

    const header = document.createElement('div');
    header.className = 'contacts-panel-header';
    header.textContent = 'Contacts';
    this.root.appendChild(header);

    this.list = document.createElement('div');
    this.list.className = 'contacts-panel-list';
    this.root.appendChild(this.list);

    container.appendChild(this.root);
  }

  /** Call each frame or when contacts change. */
  update(): void {
    const tracker = this.getContacts();
    const contactIds = tracker ? Array.from(tracker.contacts.keys()) : [];
    const gameTime = this.getGameTime();

    for (const id of contactIds) {
      const contact = tracker!.contacts.get(id)!;
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
      if (!ship) continue;

      let row = this.contactRows.get(id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'contacts-panel-row';
        row.dataset.entityId = id;
        const nameEl = document.createElement('span');
        nameEl.className = 'contacts-panel-name';
        row.appendChild(nameEl);
        const meta = document.createElement('span');
        meta.className = 'contacts-panel-meta';
        row.appendChild(meta);
        this.list.appendChild(row);
        this.contactRows.set(id, row);
        if (this.onContactClick) {
          nameEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onContactClick?.(id);
          });
        }
      }

      const nameEl = row.querySelector('.contacts-panel-name')!;
      nameEl.textContent = ship.name;

      const metaEl = row.querySelector('.contacts-panel-meta') as HTMLElement;
      if (contact.lost) {
        metaEl.textContent = 'Lost';
        metaEl.className = 'contacts-panel-meta contacts-panel-lost';
      } else {
        const age = gameTime > 0 && contact.receivedTime > 0 ? gameTime - contact.receivedTime : 0;
        metaEl.textContent = age > 0 ? `${age.toFixed(0)}s ago` : '—';
        metaEl.className = 'contacts-panel-meta';
      }
    }

    for (const [id, row] of this.contactRows) {
      if (!contactIds.includes(id)) {
        row.remove();
        this.contactRows.delete(id);
      }
    }
  }
}
