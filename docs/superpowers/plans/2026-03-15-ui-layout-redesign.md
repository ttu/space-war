# UI Layout Redesign — Asymmetric Combat UI

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the game UI from a single left sidebar to an asymmetric layout with fleet/ship on the left, combat intel (contacts, missiles, threats) on the right, and a togglable combat log overlay.

**Architecture:** Split the current left-panel stack into left (200px) and right (260px) sidebars. Extract missile tracking and incoming threats from ShipDetailPanel into dedicated panels. Add PanelManager for collapse/expand state and hotkeys. Combat log becomes a hidden-by-default overlay.

**Tech Stack:** TypeScript, DOM manipulation, CSS (inline in index.html)

---

## File Structure

### New Files
- `src/ui/ActiveMissilesPanel.ts` — Dedicated panel showing all in-flight friendly missile salvos with distance, guidance, fuel, hit probability
- `src/ui/IncomingThreatsPanel.ts` — Panel showing enemy missiles targeting the selected ship(s), with PDC status and ETA
- `src/ui/PanelManager.ts` — Manages panel collapse/expand state, hotkey registration (F1-F5, L), persists toggle state

### Modified Files
- `index.html` — CSS: add `.right-panel`, update `.left-panel` width, add `.combat-log-overlay`, add collapsible panel styles
- `src/core/InputManager.ts` — Add new input event types for panel toggle hotkeys (F1-F5, L)
- `src/game/SpaceWarGame.ts` — Create right panel container, instantiate new panels, wire PanelManager, update render loop
- `src/ui/ContactsPanel.ts` — Add inline distance display with color coding per contact row
- `src/ui/ShipDetailPanel.ts` — Add compact multi-select mode; remove active missiles rendering (moved to ActiveMissilesPanel)
- `src/ui/CombatLog.ts` — Convert to overlay mode: hidden by default, toggle visibility via show()/hide() methods

---

## Chunk 1: CSS Layout + PanelManager + Hotkeys

### Task 1: Update CSS layout in index.html

**Files:**
- Modify: `index.html:158-170` (`.left-panel` CSS)
- Modify: `index.html:409-428` (`.combat-log-wrap` CSS)

- [ ] **Step 1: Update left-panel width from 220px to 200px**

In `index.html`, change the `.left-panel` CSS:

```css
.left-panel {
  position: absolute;
  left: 12px;
  top: 56px;
  bottom: 120px;
  width: 200px;  /* was 220px */
  display: flex;
  flex-direction: column;
  gap: 8px;
  contain: layout style paint;
  transform: translateZ(0);
}
```

- [ ] **Step 2: Add right-panel CSS**

Add after the `.left-panel` block:

```css
.right-panel {
  position: absolute;
  right: 12px;
  top: 56px;
  bottom: 50px;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  contain: layout style paint;
  transform: translateZ(0);
}
```

- [ ] **Step 3: Add collapsible panel header styles**

Add after the existing header styles block (after line ~246):

```css
.panel-header-collapsible {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.panel-header-collapsible::after {
  content: '▾';
  font-size: 9px;
  opacity: 0.5;
  transition: transform 0.15s ease;
}

.panel-header-collapsible.collapsed::after {
  transform: rotate(-90deg);
}

.panel-collapsed .fleet-panel-list,
.panel-collapsed .contacts-panel-summary,
.panel-collapsed .contacts-panel-list,
.panel-collapsed .ship-detail-content,
.panel-collapsed .active-missiles-list,
.panel-collapsed .incoming-threats-list {
  display: none;
}

.panel-hotkey-hint {
  font-size: 9px;
  color: var(--text-muted);
  font-weight: normal;
  text-transform: none;
}
```

- [ ] **Step 4: Add active-missiles-panel and incoming-threats-panel styles**

Add after the contacts-panel styles:

```css
.active-missiles-panel,
.incoming-threats-panel {
  background: rgba(10, 14, 24, 0.9);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  contain: layout style paint;
}

.active-missiles-header,
.incoming-threats-header {
  color: var(--accent-cyan);
  font-weight: bold;
  margin-bottom: 6px;
  font-size: 11px;
  text-transform: uppercase;
}

.incoming-threats-header {
  color: var(--status-red);
}

.active-missiles-list,
.incoming-threats-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  font-size: 11px;
  line-height: 1.5;
}

.missile-salvo-row,
.threat-salvo-row {
  padding: 3px 0;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.missile-salvo-row:last-child,
.threat-salvo-row:last-child {
  border-bottom: none;
}

.missile-salvo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.missile-salvo-detail {
  font-size: 10px;
  padding-left: 14px;
  color: var(--text-muted);
}

.distance-close { color: var(--status-red); }
.distance-medium { color: var(--status-yellow); }
.distance-far { color: var(--text-muted); }
```

- [ ] **Step 5: Convert combat-log to overlay styles**

Replace the `.combat-log-wrap` and `.combat-log-panel` CSS with:

```css
.combat-log-wrap {
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  width: 420px;
  max-height: 200px;
  z-index: 15;
  display: none;
}

.combat-log-wrap.visible {
  display: block;
}

.combat-log-panel {
  background: rgba(10, 14, 24, 0.85);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 8px;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 200px;
}
```

- [ ] **Step 6: Update info-overlay left position for new panel width**

Change `#info-overlay` left from 240px to 220px to match the new 200px left panel + gap.

- [ ] **Step 7: Add inline distance styles for contacts panel**

Add after contacts-panel-location:

```css
.contacts-panel-distance {
  font-size: 10px;
  margin-left: auto;
  font-weight: bold;
}
```

- [ ] **Step 8: Run build to verify CSS changes don't break anything**

Run: `npm run build`
Expected: Build succeeds (CSS is in HTML, no compile step needed, but ensure no TS errors)

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "style: update CSS layout for asymmetric UI redesign"
```

---

### Task 2: Create PanelManager

**Files:**
- Create: `src/ui/PanelManager.ts`

- [ ] **Step 1: Create PanelManager class**

```typescript
export interface PanelRegistration {
  id: string;
  element: HTMLElement;
  headerElement: HTMLElement;
  hotkey: string; // e.g. 'F1'
}

/**
 * Manages panel collapse/expand state and hotkey toggles.
 * Panels register with an id, DOM element, header, and hotkey.
 * Clicking header or pressing hotkey toggles collapsed state.
 */
export class PanelManager {
  private panels = new Map<string, PanelRegistration>();
  private collapsed = new Set<string>();

  register(reg: PanelRegistration): void {
    this.panels.set(reg.id, reg);

    // Add collapsible class + hotkey hint to header
    reg.headerElement.classList.add('panel-header-collapsible');
    const hint = document.createElement('span');
    hint.className = 'panel-hotkey-hint';
    hint.textContent = reg.hotkey;
    reg.headerElement.appendChild(hint);

    // Click header to toggle
    reg.headerElement.addEventListener('click', () => {
      this.toggle(reg.id);
    });
  }

  toggle(id: string): void {
    const reg = this.panels.get(id);
    if (!reg) return;
    if (this.collapsed.has(id)) {
      this.collapsed.delete(id);
      reg.element.classList.remove('panel-collapsed');
      reg.headerElement.classList.remove('collapsed');
    } else {
      this.collapsed.add(id);
      reg.element.classList.add('panel-collapsed');
      reg.headerElement.classList.add('collapsed');
    }
  }

  isCollapsed(id: string): boolean {
    return this.collapsed.has(id);
  }

  /** Handle a hotkey code (e.g. 'F1'). Returns true if handled. */
  handleHotkey(code: string): boolean {
    for (const [id, reg] of this.panels) {
      if (reg.hotkey === code) {
        this.toggle(id);
        return true;
      }
    }
    return false;
  }
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS (new file, no imports yet)

- [ ] **Step 3: Commit**

```bash
git add src/ui/PanelManager.ts
git commit -m "feat: add PanelManager for collapsible panels with hotkeys"
```

---

### Task 3: Add panel toggle hotkeys to InputManager

**Files:**
- Modify: `src/core/InputManager.ts:1-13` (InputEvent type)
- Modify: `src/core/InputManager.ts:69-97` (keydown handler)

- [ ] **Step 1: Add panelToggle event type**

Add to the `InputEvent` union type:

```typescript
| { type: 'panelToggle'; code: string }
```

- [ ] **Step 2: Add F1-F5 and L key handling in keydown**

In the `setupEventListeners` keydown handler, add before the closing `}) as EventListener)`:

```typescript
if (e.code === 'F1' || e.code === 'F2' || e.code === 'F3' ||
    e.code === 'F4' || e.code === 'F5') {
  e.preventDefault();
  this.emit({ type: 'panelToggle', code: e.code });
}
if (e.code === 'KeyL') {
  e.preventDefault();
  this.emit({ type: 'panelToggle', code: 'KeyL' });
}
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/InputManager.ts
git commit -m "feat: add panel toggle hotkey events (F1-F5, L)"
```

---

## Chunk 2: New Panels (ActiveMissiles + IncomingThreats)

### Task 4: Create ActiveMissilesPanel

**Files:**
- Create: `src/ui/ActiveMissilesPanel.ts`
- Test: `tests/ui/ActiveMissilesPanel.test.ts`

- [ ] **Step 1: Write test for ActiveMissilesPanel**

```typescript
import { describe, it, expect } from 'vitest';

describe('ActiveMissilesPanel', () => {
  it('should be importable', async () => {
    const mod = await import('../../src/ui/ActiveMissilesPanel');
    expect(mod.ActiveMissilesPanel).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/ActiveMissilesPanel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create ActiveMissilesPanel**

Create `src/ui/ActiveMissilesPanel.ts`. The panel queries the world for all Missile entities with the player faction, computes distance/hit probability, and renders each salvo as a row.

Key implementation details:
- Uses `world.query(COMPONENT.Position, COMPONENT.Missile)` to find all missiles
- Filters by `missile.launcherFaction === playerFaction`
- Computes distance via `Math.hypot`
- Computes hit probability via `missileHitProbability` from FiringComputer
- Distance color-coding: <50k red, <150k yellow, else grey
- Sorts salvos by distance (closest first)
- Exposes `header` as readonly for PanelManager registration
- Uses safe DOM methods (textContent, createElement) — no innerHTML for user data

```typescript
import type { World, EntityId } from '../engine/types';
import {
  Position,
  Velocity,
  Ship,
  Missile,
  COMPONENT,
} from '../engine/components';
import { missileHitProbability } from '../game/FiringComputer';

function distanceColor(distKm: number): string {
  if (distKm < 50_000) return 'distance-close';
  if (distKm < 150_000) return 'distance-medium';
  return 'distance-far';
}

function formatDistance(km: number): string {
  if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(1)}M km`;
  if (km >= 1000) return `${(km / 1000).toFixed(0)}k km`;
  return `${Math.round(km)} km`;
}

interface SalvoInfo {
  entityId: EntityId;
  targetName: string;
  count: number;
  distance: number;
  guidanceMode: string;
  fuel: number;
  armed: boolean;
  hitProbability: number;
}

export class ActiveMissilesPanel {
  private root: HTMLElement;
  readonly header: HTMLElement;
  private list: HTMLElement;

  constructor(
    container: HTMLElement,
    private world: World,
    private playerFaction = 'player',
  ) {
    this.root = document.createElement('div');
    this.root.id = 'active-missiles-panel';
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

  update(): void {
    const salvos = this.gatherSalvos();
    this.header.textContent = `Active Missiles${salvos.length > 0 ? ` (${salvos.length})` : ''}`;
    this.list.textContent = '';

    if (salvos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'missile-salvo-row';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'No active salvos';
      this.list.appendChild(empty);
      return;
    }

    for (const salvo of salvos) {
      const row = document.createElement('div');
      row.className = 'missile-salvo-row';

      const headerLine = document.createElement('div');
      headerLine.className = 'missile-salvo-header';

      const left = document.createElement('span');
      const arrow = document.createTextNode('▶ ');
      const count = document.createTextNode(`×${salvo.count} → `);
      const targetSpan = document.createElement('span');
      targetSpan.style.color = 'var(--accent-cyan)';
      targetSpan.textContent = salvo.targetName;
      left.appendChild(arrow);
      left.appendChild(count);
      left.appendChild(targetSpan);

      const right = document.createElement('span');
      right.className = distanceColor(salvo.distance);
      right.textContent = formatDistance(salvo.distance);

      headerLine.appendChild(left);
      headerLine.appendChild(right);
      row.appendChild(headerLine);

      const detail = document.createElement('div');
      detail.className = 'missile-salvo-detail';
      const hitColor = salvo.hitProbability >= 0.6 ? 'var(--status-green)' :
                       salvo.hitProbability >= 0.3 ? 'var(--status-yellow)' : 'var(--status-red)';
      const detailText = document.createTextNode(`${salvo.guidanceMode} · ${salvo.fuel.toFixed(0)}s fuel · Hit: `);
      const hitSpan = document.createElement('span');
      hitSpan.style.color = hitColor;
      hitSpan.textContent = `${Math.round(salvo.hitProbability * 100)}%`;
      detail.appendChild(detailText);
      detail.appendChild(hitSpan);
      row.appendChild(detail);

      this.list.appendChild(row);
    }
  }

  private gatherSalvos(): SalvoInfo[] {
    const missiles = this.world.query(COMPONENT.Position, COMPONENT.Missile);
    const salvos: SalvoInfo[] = [];

    for (const mid of missiles) {
      const missile = this.world.getComponent<Missile>(mid, COMPONENT.Missile)!;
      if (missile.launcherFaction !== this.playerFaction) continue;

      const pos = this.world.getComponent<Position>(mid, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(mid, COMPONENT.Velocity);
      const targetPos = this.world.getComponent<Position>(missile.targetId, COMPONENT.Position);
      const targetVel = this.world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);
      const targetShip = this.world.getComponent<Ship>(missile.targetId, COMPONENT.Ship);

      const distance = targetPos
        ? Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y)
        : 0;

      let hitP = 0;
      if (targetPos) {
        hitP = missileHitProbability(
          pos.x, pos.y,
          vel?.vx ?? 0, vel?.vy ?? 0,
          missile.accel, missile.fuel, missile.seekerRange,
          targetPos.x, targetPos.y,
          targetVel?.vx ?? 0, targetVel?.vy ?? 0,
        );
      }

      salvos.push({
        entityId: mid,
        targetName: targetShip?.name ?? 'Unknown',
        count: missile.count,
        distance,
        guidanceMode: missile.guidanceMode,
        fuel: missile.fuel,
        armed: missile.armed,
        hitProbability: hitP,
      });
    }

    salvos.sort((a, b) => a.distance - b.distance);
    return salvos;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/ActiveMissilesPanel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/ActiveMissilesPanel.ts tests/ui/ActiveMissilesPanel.test.ts
git commit -m "feat: add ActiveMissilesPanel for in-flight salvo tracking"
```

---

### Task 5: Create IncomingThreatsPanel

**Files:**
- Create: `src/ui/IncomingThreatsPanel.ts`
- Test: `tests/ui/IncomingThreatsPanel.test.ts`

- [ ] **Step 1: Write test for IncomingThreatsPanel**

```typescript
import { describe, it, expect } from 'vitest';

describe('IncomingThreatsPanel', () => {
  it('should be importable', async () => {
    const mod = await import('../../src/ui/IncomingThreatsPanel');
    expect(mod.IncomingThreatsPanel).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/IncomingThreatsPanel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create IncomingThreatsPanel**

Create `src/ui/IncomingThreatsPanel.ts`. The panel queries for enemy missiles targeting selected player ships.

Key implementation details:
- Queries `COMPONENT.Position, COMPONENT.Missile` and filters `launcherFaction !== playerFaction`
- Only shows missiles whose `targetId` is in the selected player ship set
- Computes closing speed via dot product of relative velocity onto line-of-sight
- Estimates ETA as `distance / closingSpeed`
- Checks target ship PDC component for engagement status
- Uses safe DOM methods — no innerHTML for data-derived content

```typescript
import type { World, EntityId } from '../engine/types';
import {
  Position,
  Velocity,
  Missile,
  PDC,
  COMPONENT,
} from '../engine/components';

function formatDistance(km: number): string {
  if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(1)}M km`;
  if (km >= 1000) return `${(km / 1000).toFixed(0)}k km`;
  return `${Math.round(km)} km`;
}

interface ThreatInfo {
  entityId: EntityId;
  count: number;
  distance: number;
  closingSpeed: number;
  eta: number;
  pdcStatus: 'engaging' | 'out-of-range' | 'none';
}

export class IncomingThreatsPanel {
  private root: HTMLElement;
  readonly header: HTMLElement;
  private list: HTMLElement;

  constructor(
    container: HTMLElement,
    private world: World,
    private getSelectedPlayerIds: () => EntityId[],
    private playerFaction = 'player',
  ) {
    this.root = document.createElement('div');
    this.root.id = 'incoming-threats-panel';
    this.root.className = 'incoming-threats-panel';

    this.header = document.createElement('div');
    this.header.className = 'incoming-threats-header';
    this.header.textContent = 'Incoming';
    this.root.appendChild(this.header);

    this.list = document.createElement('div');
    this.list.className = 'incoming-threats-list';
    this.root.appendChild(this.list);

    container.appendChild(this.root);
  }

  update(): void {
    const selectedIds = new Set(this.getSelectedPlayerIds());
    const threats = this.gatherThreats(selectedIds);

    const totalMissiles = threats.reduce((sum, t) => sum + t.count, 0);
    this.header.textContent = totalMissiles > 0
      ? `⚠ Incoming (${totalMissiles})`
      : 'Incoming';
    this.list.textContent = '';

    if (threats.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'threat-salvo-row';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = selectedIds.size === 0 ? 'Select a ship' : 'No incoming threats';
      this.list.appendChild(empty);
      return;
    }

    for (const threat of threats) {
      const row = document.createElement('div');
      row.className = 'threat-salvo-row';

      const headerLine = document.createElement('div');
      headerLine.className = 'missile-salvo-header';

      const left = document.createElement('span');
      const marker = document.createElement('span');
      marker.style.color = 'var(--status-red)';
      marker.textContent = '◀ ';
      left.appendChild(marker);
      left.appendChild(document.createTextNode(
        `${threat.count} missile${threat.count > 1 ? 's' : ''}`
      ));

      const right = document.createElement('span');
      right.style.color = 'var(--status-red)';
      right.textContent = `${formatDistance(threat.distance)} · ${threat.closingSpeed.toFixed(1)} km/s`;

      headerLine.appendChild(left);
      headerLine.appendChild(right);
      row.appendChild(headerLine);

      const detail = document.createElement('div');
      detail.className = 'missile-salvo-detail';

      const pdcLabel = document.createTextNode('PDC: ');
      detail.appendChild(pdcLabel);

      const pdcSpan = document.createElement('span');
      if (threat.pdcStatus === 'engaging') {
        pdcSpan.style.color = 'var(--status-green)';
        pdcSpan.textContent = 'Engaging';
      } else if (threat.pdcStatus === 'out-of-range') {
        pdcSpan.style.color = 'var(--text-muted)';
        pdcSpan.textContent = 'Out of range';
      } else {
        pdcSpan.style.color = 'var(--text-muted)';
        pdcSpan.textContent = 'No PDC';
      }
      detail.appendChild(pdcSpan);

      const etaText = threat.eta > 0 ? `~${Math.round(threat.eta)}s` : '—';
      detail.appendChild(document.createTextNode(` · ETA ${etaText}`));
      row.appendChild(detail);

      this.list.appendChild(row);
    }
  }

  private gatherThreats(selectedIds: Set<EntityId>): ThreatInfo[] {
    if (selectedIds.size === 0) return [];

    const missiles = this.world.query(COMPONENT.Position, COMPONENT.Missile);
    const threats: ThreatInfo[] = [];

    for (const mid of missiles) {
      const missile = this.world.getComponent<Missile>(mid, COMPONENT.Missile)!;
      if (missile.launcherFaction === this.playerFaction) continue;
      if (!selectedIds.has(missile.targetId)) continue;

      const mPos = this.world.getComponent<Position>(mid, COMPONENT.Position)!;
      const mVel = this.world.getComponent<Velocity>(mid, COMPONENT.Velocity);
      const tPos = this.world.getComponent<Position>(missile.targetId, COMPONENT.Position);
      const tVel = this.world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);

      if (!tPos) continue;

      const dx = tPos.x - mPos.x;
      const dy = tPos.y - mPos.y;
      const distance = Math.hypot(dx, dy);

      const dvx = (mVel?.vx ?? 0) - (tVel?.vx ?? 0);
      const dvy = (mVel?.vy ?? 0) - (tVel?.vy ?? 0);
      const closingSpeed = distance > 0
        ? (dx * dvx + dy * dvy) / distance
        : Math.hypot(dvx, dvy);

      const eta = closingSpeed > 0 ? distance / closingSpeed : -1;

      const pdc = this.world.getComponent<PDC>(missile.targetId, COMPONENT.PDC);
      let pdcStatus: ThreatInfo['pdcStatus'] = 'none';
      if (pdc && (pdc.integrity ?? 100) > 0) {
        pdcStatus = distance <= (pdc.range ?? 5000) ? 'engaging' : 'out-of-range';
      }

      threats.push({
        entityId: mid,
        count: missile.count,
        distance,
        closingSpeed: Math.max(0, closingSpeed),
        eta,
        pdcStatus,
      });
    }

    threats.sort((a, b) => a.distance - b.distance);
    return threats;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/IncomingThreatsPanel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/IncomingThreatsPanel.ts tests/ui/IncomingThreatsPanel.test.ts
git commit -m "feat: add IncomingThreatsPanel for enemy missile threat tracking"
```

---

## Chunk 3: Modify Existing Panels

### Task 6: Add inline distance to ContactsPanel

**Files:**
- Modify: `src/ui/ContactsPanel.ts`

The contacts panel currently shows name, meta (data age), and location. Add a distance column showing km to selected player ship, color-coded by range.

- [ ] **Step 1: Add getSelectedPlayerIds callback to constructor**

Update the constructor signature to accept a new callback:

```typescript
constructor(
  container: HTMLElement,
  private world: World,
  private getContacts: () => ContactTracker | undefined,
  private getGameTime: () => number,
  private onContactClick?: (entityId: EntityId) => void,
  private getSelectedPlayerIds?: () => EntityId[],
) {
```

- [ ] **Step 2: Add distance element to contact row creation and add Position import**

Add `Position` to the imports from `'../engine/components'`.

In the row creation block (around line 193), add a distance span after the location element:

```typescript
const distEl = document.createElement('span');
distEl.className = 'contacts-panel-distance';
row.appendChild(distEl);
```

- [ ] **Step 3: Calculate and display distance in update loop**

After the location update logic (around line 237), add distance calculation:

```typescript
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
    const distText = minDist >= 1_000_000
      ? `${(minDist / 1_000_000).toFixed(1)}M`
      : minDist >= 1000
        ? `${(minDist / 1000).toFixed(0)}k`
        : `${Math.round(minDist)}`;
    const colorClass = minDist < 50_000 ? 'distance-close'
      : minDist < 150_000 ? 'distance-medium'
      : 'distance-far';
    distEl.textContent = `${distText} km`;
    distEl.className = `contacts-panel-distance ${colorClass}`;
  } else {
    distEl.textContent = '';
  }
}
```

- [ ] **Step 4: Make the contact row layout horizontal for name + distance**

Update the row creation to use flex row layout so name and distance sit on the same line. Add inline style in the row creation:

```typescript
row.style.display = 'flex';
row.style.flexWrap = 'wrap';
row.style.justifyContent = 'space-between';
row.style.alignItems = 'baseline';
```

And make meta/location span full width:

```typescript
meta.style.width = '100%';
locationEl.style.width = '100%';
```

- [ ] **Step 5: Run build and tests**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/ContactsPanel.ts
git commit -m "feat: add inline distance display to contacts panel"
```

---

### Task 7: Add compact multi-select mode to ShipDetailPanel

**Files:**
- Modify: `src/ui/ShipDetailPanel.ts`

- [ ] **Step 1: Add expandedShipId state**

Add a private field after the existing fields:

```typescript
private expandedShipId: EntityId | null = null;
```

- [ ] **Step 2: Add compact row rendering method**

Add a new method `renderCompactShipRow` after `renderShipDetail`:

```typescript
private renderCompactShipRow(id: EntityId, isExpanded: boolean): void {
  const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
  if (!ship) return;

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.alignItems = 'center';
  row.style.padding = '3px 0';
  row.style.borderBottom = '1px solid var(--border-subtle)';
  row.style.cursor = 'pointer';

  const nameSpan = document.createElement('span');
  nameSpan.style.fontWeight = 'bold';
  nameSpan.style.color = isExpanded ? 'var(--accent-cyan)' : 'var(--text-primary)';
  nameSpan.textContent = `${isExpanded ? '▾' : '▸'} ${ship.name}`;
  row.appendChild(nameSpan);

  const hull = this.world.getComponent<Hull>(id, COMPONENT.Hull);
  const ml = this.world.getComponent<MissileLauncher>(id, COMPONENT.MissileLauncher);
  const rg = this.world.getComponent<Railgun>(id, COMPONENT.Railgun);

  const statsSpan = document.createElement('span');
  statsSpan.style.fontSize = '10px';
  statsSpan.style.color = 'var(--text-secondary)';
  const parts: string[] = [];
  if (hull) parts.push(`${hull.current}/${hull.max}`);
  if (ml) parts.push(`M:${ml.ammo}`);
  if (rg) parts.push(`R:${rg.ammo}`);
  statsSpan.textContent = parts.join(' · ');
  row.appendChild(statsSpan);

  row.addEventListener('click', () => {
    this.expandedShipId = this.expandedShipId === id ? null : id;
  });

  this.content.appendChild(row);
}
```

- [ ] **Step 3: Add multi-select compact mode in update()**

In the `update()` method, after `if (ids.length === 0)` block and before the existing for-loop, add:

```typescript
if (ids.length > 1) {
  this.header.textContent = `Selected (${ids.length} ships)`;
  const missileTargets = this.buildMissileTargetMap();
  for (const id of ids) {
    const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship);
    if (!ship) continue;
    const isExpanded = this.expandedShipId === id;
    this.renderCompactShipRow(id, isExpanded);
    if (isExpanded) {
      this.renderShipDetail(id, missileTargets, ids, false);
    }
  }
  return;
}
```

- [ ] **Step 4: Remove renderActiveMissiles from ShipDetailPanel**

Remove the `renderActiveMissiles` method entirely and remove its call from `renderShipDetail` (the line `this.renderActiveMissiles(id);`). This data is now shown in ActiveMissilesPanel.

- [ ] **Step 5: Run build and tests**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/ShipDetailPanel.ts
git commit -m "feat: add compact multi-select mode to ship detail panel"
```

---

### Task 8: Convert CombatLog to togglable overlay

**Files:**
- Modify: `src/ui/CombatLog.ts`

- [ ] **Step 1: Add show/hide/toggle methods and close hint**

Add a reference to the wrapping container and add toggle methods:

```typescript
export class CombatLog {
  private root: HTMLElement;
  private wrap: HTMLElement;
  private list: HTMLElement;
  private lastCount = 0;

  constructor(
    container: HTMLElement,
    private eventBus: EventBus,
  ) {
    this.wrap = container;
    // ... rest of constructor unchanged, but update header:
    const headerRow = document.createElement('div');
    headerRow.className = 'combat-log-header';
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    const title = document.createElement('span');
    title.textContent = 'Combat log';
    const hint = document.createElement('span');
    hint.style.fontSize = '9px';
    hint.style.color = 'var(--text-muted)';
    hint.style.fontWeight = 'normal';
    hint.textContent = 'L to close';
    headerRow.appendChild(title);
    headerRow.appendChild(hint);
    this.root.appendChild(headerRow);
    // ... rest of constructor
  }

  show(): void { this.wrap.classList.add('visible'); }
  hide(): void { this.wrap.classList.remove('visible'); }
  toggle(): void { this.wrap.classList.toggle('visible'); }
  isVisible(): boolean { return this.wrap.classList.contains('visible'); }

  // update() method stays the same
}
```

- [ ] **Step 2: Run build and tests**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/CombatLog.ts
git commit -m "feat: convert combat log to togglable overlay"
```

---

## Chunk 4: Wire Everything Together in SpaceWarGame

### Task 9: Integrate new layout in SpaceWarGame

**Files:**
- Modify: `src/game/SpaceWarGame.ts`

This is the main wiring task. We need to:
1. Import new panels and PanelManager
2. Create right panel container
3. Move ContactsPanel to right panel
4. Add ActiveMissilesPanel and IncomingThreatsPanel to right panel
5. Create PanelManager, register all panels
6. Handle panelToggle input events
7. Update render loop to call new panel updates

- [ ] **Step 1: Add imports**

Add to imports at top of file:

```typescript
import { ActiveMissilesPanel } from '../ui/ActiveMissilesPanel';
import { IncomingThreatsPanel } from '../ui/IncomingThreatsPanel';
import { PanelManager } from '../ui/PanelManager';
```

- [ ] **Step 2: Add private fields**

Add after existing panel fields (around line 96):

```typescript
private activeMissilesPanel!: ActiveMissilesPanel;
private incomingThreatsPanel!: IncomingThreatsPanel;
private panelManager!: PanelManager;
```

- [ ] **Step 3: Restructure setupUI to create right panel**

In `setupUI()`:

1. Create right panel container after left panel setup:

```typescript
const rightPanel = document.createElement('div');
rightPanel.id = 'right-panel';
rightPanel.className = 'right-panel';
uiRoot.appendChild(rightPanel);
```

2. Move ContactsPanel from `leftPanel` to `rightPanel` and pass `getSelectedPlayerIds`:

```typescript
this.contactsPanel = new ContactsPanel(
  rightPanel,
  this.world,
  () => this.getPlayerContacts() ?? undefined,
  () => this.gameTime.elapsed,
  (entityId) => {
    this.selectionManager.setSelectionToEntity(entityId);
    this.focusCameraOnContact(entityId);
  },
  () => this.selectionManager.getSelectedPlayerIds(),
);
```

3. Add ActiveMissilesPanel and IncomingThreatsPanel:

```typescript
this.activeMissilesPanel = new ActiveMissilesPanel(rightPanel, this.world);
this.incomingThreatsPanel = new IncomingThreatsPanel(
  rightPanel,
  this.world,
  () => this.selectionManager.getSelectedPlayerIds(),
);
```

4. Create PanelManager and register panels:

```typescript
this.panelManager = new PanelManager();

const fleetHeader = document.querySelector('#fleet-panel .fleet-panel-header') as HTMLElement;
if (fleetHeader) {
  this.panelManager.register({
    id: 'fleet',
    element: document.getElementById('fleet-panel')!,
    headerElement: fleetHeader,
    hotkey: 'F1',
  });
}

const shipDetailHeader = document.querySelector('#ship-detail-panel .ship-detail-header') as HTMLElement;
if (shipDetailHeader) {
  this.panelManager.register({
    id: 'shipDetail',
    element: document.getElementById('ship-detail-panel')!,
    headerElement: shipDetailHeader,
    hotkey: 'F2',
  });
}

const contactsHeader = document.querySelector('#contacts-panel .contacts-panel-header') as HTMLElement;
if (contactsHeader) {
  this.panelManager.register({
    id: 'contacts',
    element: document.getElementById('contacts-panel')!,
    headerElement: contactsHeader,
    hotkey: 'F3',
  });
}

this.panelManager.register({
  id: 'activeMissiles',
  element: document.getElementById('active-missiles-panel')!,
  headerElement: this.activeMissilesPanel.header,
  hotkey: 'F4',
});

this.panelManager.register({
  id: 'incomingThreats',
  element: document.getElementById('incoming-threats-panel')!,
  headerElement: this.incomingThreatsPanel.header,
  hotkey: 'F5',
});
```

- [ ] **Step 4: Handle panelToggle events in setupInput**

Add a new case in the `onInput` switch:

```typescript
case 'panelToggle':
  if (event.code === 'KeyL') {
    this.combatLog.toggle();
  } else {
    this.panelManager.handleHotkey(event.code);
  }
  break;
```

- [ ] **Step 5: Update render loop to call new panel updates**

In `render()`, after `this.shipDetailPanel.update();`, add:

```typescript
this.activeMissilesPanel.update();
this.incomingThreatsPanel.update();
```

- [ ] **Step 6: Update info overlay hotkey text**

Update the info overlay text to include new hotkeys:

```typescript
infoOverlay.textContent = 'WASD: Pan | Scroll: Zoom | Space: Pause | +/-: Speed | E: Focus enemy | V: Shadows | L: Log | F1-F5: Panels | Shift+RClick: Add waypoint | Del: Remove waypoint';
```

- [ ] **Step 7: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 9: Manual verification in browser**

Run: `npm run dev`

Verify:
- Left panel shows Fleet + Ship Detail (200px wide)
- Right panel shows Contacts + Active Missiles + Incoming Threats (260px wide)
- Contacts show inline distance to selected ship
- F1-F5 toggle panels
- L toggles combat log overlay
- Multi-select shows compact rows
- Panel headers clickable to collapse/expand

- [ ] **Step 10: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: wire asymmetric UI layout with new panels and hotkeys"
```

---

## Chunk 5: Final Verification

### Task 10: Run full build and test suite

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: PASS with no errors

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 3: Run e2e tests if available**

Run: `npm run test:e2e`
Expected: PASS (or skip if Playwright not installed)
