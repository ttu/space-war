import type { World } from '../engine/types';
import type { EntityId } from '../engine/types';
import type { ContactTracker } from '../engine/components';
import { Ship, Position, CelestialBody, COMPONENT } from '../engine/components';

/** Max distance (km) to show "Near X" instead of "X km from Y". */
const NEAR_THRESHOLD_KM = 150_000;

/** Same radius as PlanetContactIndicatorsRenderer for "at planet" grouping. */
const NEAR_BODY_RADIUS_KM = 8_000_000;

function formatDataAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds.toFixed(0)}s ago`;
  const min = Math.floor(ageSeconds / 60);
  return `Data ${min} min old (light delay)`;
}

function getNearestBody(world: World, x: number, y: number): { name: string; distance: number } | null {
  const bodies = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
  let nearest: { name: string; distance: number } | null = null;
  for (const id of bodies) {
    const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
    const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
    const dx = x - pos.x;
    const dy = y - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!nearest || d < nearest.distance) {
      nearest = { name: body.name, distance: d };
    }
  }
  return nearest;
}

function formatLocation(nearest: { name: string; distance: number } | null): string {
  if (!nearest) return '—';
  if (nearest.distance < NEAR_THRESHOLD_KM) {
    return `Near ${nearest.name}`;
  }
  if (nearest.distance >= 1_000_000) {
    return `${(nearest.distance / 1_000_000).toFixed(0)}M km from ${nearest.name}`;
  }
  if (nearest.distance >= 1000) {
    return `${(nearest.distance / 1000).toFixed(0)}k km from ${nearest.name}`;
  }
  return `${Math.round(nearest.distance)} km from ${nearest.name}`;
}

/** Group contact count by nearest body (for "Enemies at Mars" summary). */
function getContactsByBody(
  world: World,
  tracker: ContactTracker,
  gameTime: number,
): Map<string, { count: number; minAgeSec: number; maxAgeSec: number }> {
  const bodies = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
  const bodyInfo: { name: string; x: number; y: number }[] = [];
  for (const id of bodies) {
    const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
    const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
    bodyInfo.push({ name: body.name, x: pos.x, y: pos.y });
  }
  const byBody = new Map<string, { count: number; minAgeSec: number; maxAgeSec: number }>();
  for (const [, contact] of tracker.contacts) {
    if (contact.lost) continue;
    const age = gameTime - contact.receivedTime;
    const x = contact.lastKnownX + contact.lastKnownVx * age;
    const y = contact.lastKnownY + contact.lastKnownVy * age;
    let nearestName: string | null = null;
    let nearestDist = Infinity;
    for (const b of bodyInfo) {
      const dx = x - b.x;
      const dy = y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < NEAR_BODY_RADIUS_KM && d < nearestDist) {
        nearestDist = d;
        nearestName = b.name;
      }
    }
    if (nearestName) {
      const cur = byBody.get(nearestName) ?? { count: 0, minAgeSec: age, maxAgeSec: age };
      cur.count += 1;
      cur.minAgeSec = Math.min(cur.minAgeSec, age);
      cur.maxAgeSec = Math.max(cur.maxAgeSec, age);
      byBody.set(nearestName, cur);
    }
  }
  return byBody;
}

/**
 * Lists detected enemy contacts (sensor contacts). Clicking a name focuses the camera on that contact.
 */
const SUMMARY_PLACEHOLDER = '—';

export class ContactsPanel {
  private root: HTMLElement;
  private summaryLocEl: HTMLElement;
  private summaryAgeEl: HTMLElement;
  private list: HTMLElement;
  private contactRows = new Map<EntityId, HTMLElement>();
  private lastSummaryLoc = '';
  private lastSummaryAge = '';
  /** Cache last displayed values per contact to avoid DOM writes when unchanged. */
  private lastRowState = new Map<EntityId, { name: string; meta: string; metaClass: string; location: string; distance: string; distanceClass: string }>();
  private lastUpdateTime = 0;
  private readonly updateIntervalMs = 500;

  constructor(
    container: HTMLElement,
    private world: World,
    private getContacts: () => ContactTracker | undefined,
    private getGameTime: () => number,
    private onContactClick?: (entityId: EntityId) => void,
    private getSelectedPlayerIds?: () => EntityId[],
  ) {
    this.root = document.createElement('div');
    this.root.id = 'contacts-panel';
    this.root.className = 'contacts-panel';

    const header = document.createElement('div');
    header.className = 'contacts-panel-header';
    header.textContent = 'Contacts';
    this.root.appendChild(header);

    const summaryWrap = document.createElement('div');
    summaryWrap.className = 'contacts-panel-summary';
    this.summaryLocEl = document.createElement('div');
    this.summaryLocEl.className = 'contacts-panel-summary-row';
    this.summaryLocEl.textContent = SUMMARY_PLACEHOLDER;
    this.summaryAgeEl = document.createElement('div');
    this.summaryAgeEl.className = 'contacts-panel-summary-row';
    this.summaryAgeEl.textContent = SUMMARY_PLACEHOLDER;
    summaryWrap.appendChild(this.summaryLocEl);
    summaryWrap.appendChild(this.summaryAgeEl);
    this.root.appendChild(summaryWrap);

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

    // Summary: row 1 "Enemies at: Terra (2), Mars (1)."  row 2 "Data 0–5 s old." (placeholder when empty)
    let summaryLoc = SUMMARY_PLACEHOLDER;
    let summaryAge = SUMMARY_PLACEHOLDER;
    if (tracker && contactIds.length > 0) {
      const byBody = getContactsByBody(this.world, tracker, gameTime);
      const parts: string[] = [];
      let minAge = Infinity;
      let maxAge = 0;
      for (const [name, info] of byBody) {
        parts.push(`${name} (${info.count})`);
        minAge = Math.min(minAge, info.minAgeSec);
        maxAge = Math.max(maxAge, info.maxAgeSec);
      }
      summaryLoc = `Enemies at: ${parts.join(', ')}.`;
      summaryAge =
        maxAge >= 60
          ? `Data ${Math.floor(minAge / 60)}–${Math.ceil(maxAge / 60)} min old (light delay).`
          : maxAge > 0
            ? `Data ${minAge.toFixed(0)}–${maxAge.toFixed(0)} s old.`
            : `Data 0–0 s old.`;
    }
    if (this.lastSummaryLoc !== summaryLoc) {
      this.lastSummaryLoc = summaryLoc;
      this.summaryLocEl.textContent = summaryLoc;
    }
    if (this.lastSummaryAge !== summaryAge) {
      this.lastSummaryAge = summaryAge;
      this.summaryAgeEl.textContent = summaryAge;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const shouldUpdateContent = (now - this.lastUpdateTime) >= this.updateIntervalMs;
    if (shouldUpdateContent) this.lastUpdateTime = now;

    for (const id of contactIds) {
      const contact = tracker!.contacts.get(id)!;
      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
      if (!ship) continue;

      let row = this.contactRows.get(id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'contacts-panel-row';
        row.dataset.entityId = id;
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'baseline';
        const nameEl = document.createElement('span');
        nameEl.className = 'contacts-panel-name';
        row.appendChild(nameEl);
        const distEl = document.createElement('span');
        distEl.className = 'contacts-panel-distance';
        row.appendChild(distEl);
        const meta = document.createElement('span');
        meta.className = 'contacts-panel-meta';
        meta.style.width = '100%';
        row.appendChild(meta);
        const locationEl = document.createElement('span');
        locationEl.className = 'contacts-panel-location';
        locationEl.style.width = '100%';
        row.appendChild(locationEl);
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
      const metaEl = row.querySelector('.contacts-panel-meta') as HTMLElement;
      const age = gameTime - contact.receivedTime;
      const metaText = contact.lost ? 'Lost' : (gameTime > 0 && contact.receivedTime > 0 && age > 0 ? formatDataAge(age) : '—');
      const metaClass = contact.lost ? 'contacts-panel-meta contacts-panel-lost' : 'contacts-panel-meta';

      const locX = contact.lastKnownX + contact.lastKnownVx * age;
      const locY = contact.lastKnownY + contact.lastKnownVy * age;
      const nearest = getNearestBody(this.world, locX, locY);
      const locationText = formatLocation(nearest);

      const cached = this.lastRowState.get(id);
      const nameChanged = cached?.name !== ship.name;
      const metaChanged = cached?.meta !== metaText || cached?.metaClass !== metaClass;
      const locationChanged = cached?.location !== locationText;
      const isNewRow = cached === undefined;

      // Calculate distance from nearest selected player ship
      let distText = '';
      let distClass = 'contacts-panel-distance';
      const distEl = row.querySelector('.contacts-panel-distance') as HTMLElement | null;
      if (distEl && this.getSelectedPlayerIds) {
        const selectedIds = this.getSelectedPlayerIds();
        let minDist = Infinity;
        for (const sid of selectedIds) {
          const sPos = this.world.getComponent<Position>(sid, COMPONENT.Position);
          if (!sPos) continue;
          const d = Math.hypot(locX - sPos.x, locY - sPos.y);
          if (d < minDist) minDist = d;
        }
        if (minDist < Infinity) {
          const formatted = minDist >= 1_000_000
            ? `${(minDist / 1_000_000).toFixed(1)}M`
            : minDist >= 1000
              ? `${(minDist / 1000).toFixed(0)}k`
              : `${Math.round(minDist)}`;
          const colorClass = minDist < 50_000 ? 'distance-close'
            : minDist < 150_000 ? 'distance-medium'
            : 'distance-far';
          distText = `${formatted} km`;
          distClass = `contacts-panel-distance ${colorClass}`;
        }
      }

      const distChanged = cached?.distance !== distText || cached?.distanceClass !== distClass;

      if ((shouldUpdateContent || isNewRow) && (nameChanged || metaChanged || locationChanged || distChanged)) {
        if (nameChanged) nameEl.textContent = ship.name;
        if (metaChanged) {
          metaEl.textContent = metaText;
          metaEl.className = metaClass;
        }
        const locationEl = row.querySelector('.contacts-panel-location') as HTMLElement | null;
        if (locationEl && locationChanged) locationEl.textContent = locationText;
        if (distEl && distChanged) {
          distEl.textContent = distText;
          distEl.className = distClass;
        }
      }
      this.lastRowState.set(id, { name: ship.name, meta: metaText, metaClass, location: locationText, distance: distText, distanceClass: distClass });
    }

    for (const [id, row] of this.contactRows) {
      if (!contactIds.includes(id)) {
        row.remove();
        this.contactRows.delete(id);
        this.lastRowState.delete(id);
      }
    }
  }
}
