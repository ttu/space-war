# Sensor Occlusion & Shadow Zone Visualization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Celestial bodies (stars, planets, moons) block sensor line-of-sight, and players can toggle a visual overlay showing shadow/blind zones behind bodies relative to their selected ships.

**Architecture:** Add a circle-line-segment intersection check to `SensorSystem.getBestDetection()` to block detection when a body is in the way. Add a new `SensorOcclusionRenderer` that draws tangent-line wedge meshes behind bodies from the perspective of selected ships. Wire a toggle via `OrderBar` button + `V` keyboard shortcut through `SpaceWarGame`.

**Tech Stack:** TypeScript, Three.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-12-sensor-occlusion-shadow-zones-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/engine/systems/SensorSystem.ts` | Modify | Add LOS occlusion check using circle-line-segment intersection |
| `tests/engine/systems/SensorSystem.test.ts` | Modify | Add occlusion test cases |
| `src/rendering/SensorOcclusionRenderer.ts` | Create | Draw shadow wedge meshes per selected ship |
| `src/ui/OrderBar.ts` | Modify | Add "Shadows" toggle button + callback |
| `src/core/InputManager.ts` | Modify | Add `V` key → `toggleShadows` event |
| `src/game/SpaceWarGame.ts` | Modify | Wire toggle state, instantiate renderer, pass to render loop |
| `index.html` | Modify | Add CSS for shadow toggle button styling |

---

## Task 1: Sensor Occlusion — Line-of-Sight Blocking

**Files:**
- Modify: `src/engine/systems/SensorSystem.ts`
- Modify: `tests/engine/systems/SensorSystem.test.ts`

### Step 1.1: Write failing test — planet blocks detection

- [ ] Add test to `tests/engine/systems/SensorSystem.test.ts`:

Merge `CelestialBody` into the existing import from `'../../../src/engine/components'`:

```typescript
import {
  Position, Velocity, Ship, Thruster, ThermalSignature,
  SensorArray, ContactTracker, CelestialBody,
  COMPONENT,
} from '../../../src/engine/components';
```

Then add the helper function below the existing helpers:

```typescript
function createCelestialBody(world: WorldImpl, opts: {
  x: number; y: number; radius: number;
  bodyType: 'star' | 'planet' | 'moon' | 'station' | 'asteroid';
  name?: string;
}): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<CelestialBody>(id, {
    type: 'CelestialBody',
    name: opts.name ?? 'TestBody',
    mass: 5.972e24,
    radius: opts.radius,
    bodyType: opts.bodyType,
  });
  return id;
}
```

Then add the test:

```typescript
it('should NOT detect enemy when planet blocks line of sight', () => {
  const world = new WorldImpl();
  const system = new SensorSystem();

  // Player at origin
  createShip(world, {
    x: 0, y: 0, faction: 'player',
    sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
  });
  // Enemy directly behind planet (along X axis)
  createShip(world, {
    x: 200_000, y: 0, faction: 'enemy',
    throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
  });
  // Planet between them at x=100k, radius=10k km
  createCelestialBody(world, {
    x: 100_000, y: 0, radius: 10_000, bodyType: 'planet',
  });

  const trackerId = createContactTracker(world, 'player');
  system.update(world, 0.1, 10.0);

  const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
  expect(tracker.contacts.size).toBe(0);
});
```

- [ ] **Run test to verify it fails:**

```bash
npm test -- --run tests/engine/systems/SensorSystem.test.ts
```

Expected: FAIL — enemy is still detected because there's no occlusion logic yet.

### Step 1.2: Write failing test — station does NOT block detection

- [ ] Add test:

```typescript
it('should still detect enemy when station is between them (stations do not occlude)', () => {
  const world = new WorldImpl();
  const system = new SensorSystem();

  createShip(world, {
    x: 0, y: 0, faction: 'player',
    sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
  });
  createShip(world, {
    x: 200_000, y: 0, faction: 'enemy',
    throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
  });
  // Station between them — should NOT block
  createCelestialBody(world, {
    x: 100_000, y: 0, radius: 50, bodyType: 'station',
  });

  const trackerId = createContactTracker(world, 'player');
  system.update(world, 0.1, 10.0);

  const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
  expect(tracker.contacts.size).toBe(1);
});
```

This test should pass already (no occlusion logic = everything passes through), but it documents the contract. Run it to confirm:

```bash
npm test -- --run tests/engine/systems/SensorSystem.test.ts
```

### Step 1.3: Write failing test — enemy beside planet is still detected

- [ ] Add test:

```typescript
it('should detect enemy beside planet (not in shadow)', () => {
  const world = new WorldImpl();
  const system = new SensorSystem();

  createShip(world, {
    x: 0, y: 0, faction: 'player',
    sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
  });
  // Enemy is offset 20k above the planet center — well outside shadow
  createShip(world, {
    x: 200_000, y: 20_000, faction: 'enemy',
    throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
  });
  // Planet at x=100k, radius=10k
  createCelestialBody(world, {
    x: 100_000, y: 0, radius: 10_000, bodyType: 'planet',
  });

  const trackerId = createContactTracker(world, 'player');
  system.update(world, 0.1, 10.0);

  const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
  expect(tracker.contacts.size).toBe(1);
});
```

### Step 1.4: Write failing test — second sensor ship has clear LOS

- [ ] Add test:

```typescript
it('should detect via second sensor ship when first is occluded', () => {
  const world = new WorldImpl();
  const system = new SensorSystem();

  // First sensor: blocked by planet
  createShip(world, {
    x: 0, y: 0, faction: 'player',
    sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
  });
  // Second sensor: positioned off-axis, clear LOS
  createShip(world, {
    x: 0, y: 50_000, faction: 'player',
    sensorMaxRange: 500_000, sensorSensitivity: 1e-12,
  });
  // Enemy behind planet from first sensor
  createShip(world, {
    x: 200_000, y: 0, faction: 'enemy',
    throttle: 1.0, baseSignature: 50, thrustMultiplier: 200,
  });
  // Planet blocks first sensor
  createCelestialBody(world, {
    x: 100_000, y: 0, radius: 10_000, bodyType: 'planet',
  });

  const trackerId = createContactTracker(world, 'player');
  system.update(world, 0.1, 10.0);

  const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
  expect(tracker.contacts.size).toBe(1);
});
```

### Step 1.5: Implement occlusion in SensorSystem

- [ ] Modify `src/engine/systems/SensorSystem.ts`:

Add to the imports:

```typescript
import {
  Position, Velocity, Ship, Thruster, ThermalSignature,
  SensorArray, ContactTracker, DetectedContact, ShipSystems,
  CelestialBody,
  COMPONENT, Faction,
} from '../components';
```

Add a new type at the bottom of the file for occluding body data:

```typescript
interface OccludingBody {
  x: number;
  y: number;
  radius: number;
}
```

Add a method to collect occluding bodies:

```typescript
private getOccludingBodies(world: World): OccludingBody[] {
  const entities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
  const result: OccludingBody[] = [];
  for (const id of entities) {
    const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
    if (body.bodyType !== 'star' && body.bodyType !== 'planet' && body.bodyType !== 'moon') continue;
    const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
    result.push({ x: pos.x, y: pos.y, radius: body.radius });
  }
  return result;
}
```

Add a static method for the circle-line-segment intersection test:

```typescript
/** Returns true if the line segment from A to B is blocked by the circle (center, radius). */
private static isLineBlockedByCircle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  radius: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;

  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 1) return false; // degenerate segment

  // Parameter t for closest point on line to circle center, clamped to [0,1]
  const t = Math.max(0, Math.min(1, -(fx * dx + fy * dy) / segLenSq));

  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const distSq = (closestX - cx) * (closestX - cx) + (closestY - cy) * (closestY - cy);

  return distSq < radius * radius;
}
```

Modify `updateFaction` to gather occluding bodies and pass them:

In `update()`, gather bodies once:

```typescript
update(world: World, _dt: number, gameTime: number): void {
  const occludingBodies = this.getOccludingBodies(world);
  const trackerEntities = world.query(COMPONENT.ContactTracker);

  for (const trackerEntityId of trackerEntities) {
    const tracker = world.getComponent<ContactTracker>(trackerEntityId, COMPONENT.ContactTracker)!;
    this.updateFaction(world, tracker, gameTime, occludingBodies);
  }
}
```

Update `updateFaction` signature:

```typescript
private updateFaction(world: World, tracker: ContactTracker, gameTime: number, occludingBodies: OccludingBody[]): void {
```

Update `getBestDetection` to accept and use occluding bodies:

```typescript
private getBestDetection(
  sensorShips: SensorShipData[],
  target: TargetShipData,
  occludingBodies: OccludingBody[],
): { signalStrength: number; distance: number } | null {
  const effectiveSignature = target.thermal.baseSignature +
    target.throttle * target.thermal.thrustMultiplier;

  let bestSignal: { signalStrength: number; distance: number } | null = null;

  for (const sensor of sensorShips) {
    const dx = target.pos.x - sensor.pos.x;
    const dy = target.pos.y - sensor.pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > sensor.effectiveMaxRange) continue;
    if (distance < 1) continue;

    // Check line-of-sight occlusion
    let blocked = false;
    for (const body of occludingBodies) {
      if (SensorSystem.isLineBlockedByCircle(
        sensor.pos.x, sensor.pos.y,
        target.pos.x, target.pos.y,
        body.x, body.y,
        body.radius,
      )) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const signalStrength = effectiveSignature / (distance * distance);

    if (signalStrength > sensor.effectiveSensitivity) {
      if (!bestSignal || signalStrength > bestSignal.signalStrength) {
        bestSignal = { signalStrength, distance };
      }
    }
  }

  return bestSignal;
}
```

Update the call site in `updateFaction`:

```typescript
const bestDetection = this.getBestDetection(sensorShips, target, occludingBodies);
```

- [ ] **Run tests to verify all pass:**

```bash
npm test -- --run tests/engine/systems/SensorSystem.test.ts
```

Expected: ALL PASS including the new occlusion tests.

### Step 1.6: Commit

- [ ] Commit:

```bash
git add src/engine/systems/SensorSystem.ts tests/engine/systems/SensorSystem.test.ts
git commit -m "feat: sensor line-of-sight occlusion by celestial bodies"
```

---

## Task 2: Shadow Zone Renderer

**Files:**
- Create: `src/rendering/SensorOcclusionRenderer.ts`

### Step 2.1: Create the SensorOcclusionRenderer

- [ ] Create `src/rendering/SensorOcclusionRenderer.ts`:

```typescript
import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Ship, Selectable, CelestialBody,
  COMPONENT,
} from '../engine/components';

/** Max distance to extend shadow wedges (effectively infinite on screen). */
const SHADOW_EXTEND_DISTANCE = 5_000_000; // km

const OCCLUDING_BODY_TYPES = new Set(['star', 'planet', 'moon']);

interface ShadowWedge {
  mesh: THREE.Mesh;
  edge1: THREE.Line;
  edge2: THREE.Line;
}

export class SensorOcclusionRenderer {
  private group = new THREE.Group();
  private wedges: ShadowWedge[] = [];
  private wedgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x334455,
    transparent: true,
    opacity: 0.25,
  });

  constructor(private scene: THREE.Scene) {
    this.group.renderOrder = -1; // render behind other elements
    this.scene.add(this.group);
  }

  update(world: World, enabled: boolean): void {
    if (!enabled) {
      this.hideAll();
      return;
    }

    // Get selected player ships
    const selectedShips = this.getSelectedPlayerShips(world);
    if (selectedShips.length === 0) {
      this.hideAll();
      return;
    }

    // Get occluding bodies
    const bodies = this.getOccludingBodies(world);
    if (bodies.length === 0) {
      this.hideAll();
      return;
    }

    // Calculate needed wedges: one per ship per body
    const neededCount = selectedShips.length * bodies.length;
    this.ensureWedgePool(neededCount);

    let wedgeIdx = 0;
    for (const ship of selectedShips) {
      for (const body of bodies) {
        const wedge = this.wedges[wedgeIdx];
        this.updateWedge(wedge, ship.x, ship.y, body.x, body.y, body.radius);
        wedgeIdx++;
      }
    }

    // Hide unused wedges
    for (let i = wedgeIdx; i < this.wedges.length; i++) {
      this.wedges[i].mesh.visible = false;
      this.wedges[i].edge1.visible = false;
      this.wedges[i].edge2.visible = false;
    }
  }

  private getSelectedPlayerShips(world: World): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = [];
    const ships = world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.Selectable);
    for (const id of ships) {
      const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (!sel.selected) continue;
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      result.push({ x: pos.x, y: pos.y });
    }
    return result;
  }

  private getOccludingBodies(world: World): { x: number; y: number; radius: number }[] {
    const result: { x: number; y: number; radius: number }[] = [];
    const entities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    for (const id of entities) {
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      if (!OCCLUDING_BODY_TYPES.has(body.bodyType)) continue;
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      result.push({ x: pos.x, y: pos.y, radius: body.radius });
    }
    return result;
  }

  private updateWedge(
    wedge: ShadowWedge,
    shipX: number, shipY: number,
    bodyX: number, bodyY: number,
    bodyRadius: number,
  ): void {
    const dx = bodyX - shipX;
    const dy = bodyY - shipY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= bodyRadius) {
      // Ship is inside the body — hide wedge
      wedge.mesh.visible = false;
      wedge.edge1.visible = false;
      wedge.edge2.visible = false;
      return;
    }

    // Angle from ship to body center
    const angleToBody = Math.atan2(dy, dx);

    // Half-angle of the tangent cone
    const halfAngle = Math.asin(bodyRadius / dist);

    // Two tangent directions
    const angle1 = angleToBody - halfAngle;
    const angle2 = angleToBody + halfAngle;

    // Tangent points on the body circle (closest points on circle to tangent lines)
    const tangent1X = bodyX + bodyRadius * Math.cos(angle1 + Math.PI / 2);
    const tangent1Y = bodyY + bodyRadius * Math.sin(angle1 + Math.PI / 2);
    const tangent2X = bodyX + bodyRadius * Math.cos(angle2 - Math.PI / 2);
    const tangent2Y = bodyY + bodyRadius * Math.sin(angle2 - Math.PI / 2);

    // Far points: extend tangent lines far beyond the body
    const far1X = shipX + Math.cos(angle1) * SHADOW_EXTEND_DISTANCE;
    const far1Y = shipY + Math.sin(angle1) * SHADOW_EXTEND_DISTANCE;
    const far2X = shipX + Math.cos(angle2) * SHADOW_EXTEND_DISTANCE;
    const far2Y = shipY + Math.sin(angle2) * SHADOW_EXTEND_DISTANCE;

    // Wedge triangle: tangent1 → far1 → far2 → tangent2 (quad = 2 triangles)
    const positions = wedge.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    // Triangle 1: tangent1, far1, far2
    positions.setXYZ(0, tangent1X, tangent1Y, -1);
    positions.setXYZ(1, far1X, far1Y, -1);
    positions.setXYZ(2, far2X, far2Y, -1);
    // Triangle 2: tangent1, far2, tangent2
    positions.setXYZ(3, tangent1X, tangent1Y, -1);
    positions.setXYZ(4, far2X, far2Y, -1);
    positions.setXYZ(5, tangent2X, tangent2Y, -1);
    positions.needsUpdate = true;
    wedge.mesh.geometry.computeBoundingSphere();
    wedge.mesh.visible = true;

    // Edge lines
    const e1Pos = wedge.edge1.geometry.getAttribute('position') as THREE.BufferAttribute;
    e1Pos.setXYZ(0, tangent1X, tangent1Y, -0.5);
    e1Pos.setXYZ(1, far1X, far1Y, -0.5);
    e1Pos.needsUpdate = true;
    wedge.edge1.geometry.computeBoundingSphere();
    wedge.edge1.visible = true;

    const e2Pos = wedge.edge2.geometry.getAttribute('position') as THREE.BufferAttribute;
    e2Pos.setXYZ(0, tangent2X, tangent2Y, -0.5);
    e2Pos.setXYZ(1, far2X, far2Y, -0.5);
    e2Pos.needsUpdate = true;
    wedge.edge2.geometry.computeBoundingSphere();
    wedge.edge2.visible = true;
  }

  private ensureWedgePool(count: number): void {
    while (this.wedges.length < count) {
      const meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 3), 3));
      const mesh = new THREE.Mesh(meshGeo, this.wedgeMaterial);
      mesh.visible = false;

      const edge1Geo = new THREE.BufferGeometry();
      edge1Geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3), 3));
      const edge1 = new THREE.Line(edge1Geo, this.edgeMaterial);
      edge1.visible = false;

      const edge2Geo = new THREE.BufferGeometry();
      edge2Geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3), 3));
      const edge2 = new THREE.Line(edge2Geo, this.edgeMaterial);
      edge2.visible = false;

      this.group.add(mesh);
      this.group.add(edge1);
      this.group.add(edge2);

      this.wedges.push({ mesh, edge1, edge2 });
    }
  }

  private hideAll(): void {
    for (const wedge of this.wedges) {
      wedge.mesh.visible = false;
      wedge.edge1.visible = false;
      wedge.edge2.visible = false;
    }
  }

  dispose(): void {
    for (const wedge of this.wedges) {
      wedge.mesh.geometry.dispose();
      wedge.edge1.geometry.dispose();
      wedge.edge2.geometry.dispose();
      this.group.remove(wedge.mesh);
      this.group.remove(wedge.edge1);
      this.group.remove(wedge.edge2);
    }
    this.wedges = [];
    this.wedgeMaterial.dispose();
    this.edgeMaterial.dispose();
    this.scene.remove(this.group);
  }
}
```

### Step 2.2: Commit

- [ ] Commit:

```bash
git add src/rendering/SensorOcclusionRenderer.ts
git commit -m "feat: shadow zone wedge renderer for sensor occlusion visualization"
```

---

## Task 3: UI Toggle — OrderBar Button + Keyboard Shortcut

**Files:**
- Modify: `src/ui/OrderBar.ts`
- Modify: `src/core/InputManager.ts`

### Step 3.1: Add toggle callback to OrderBar

- [ ] Modify `src/ui/OrderBar.ts`:

Update the `OrderBarCallbacks` interface:

```typescript
export interface OrderBarCallbacks {
  onPendingOrderChange: (order: PendingOrderType) => void;
  onShadowToggle?: (enabled: boolean) => void;
}
```

Add class-level field declarations alongside existing fields (`private root`, `private pendingOrder`, `private buttons`):

```typescript
private shadowBtn!: HTMLButtonElement;
private shadowsEnabled = false;
```

Then in the constructor body, after `this.root.appendChild(btnRailgun);`, add the separator and toggle button:

```typescript
const separator = document.createElement('div');
separator.className = 'order-bar-separator';
this.root.appendChild(separator);

this.shadowBtn = document.createElement('button');
this.shadowBtn.type = 'button';
this.shadowBtn.className = 'order-bar-btn order-bar-toggle';
this.shadowBtn.textContent = 'Shadows (V)';
this.shadowBtn.title = 'Toggle sensor shadow zones for selected ships';
this.shadowBtn.addEventListener('click', () => {
  this.toggleShadows();
});
this.root.appendChild(this.shadowBtn);
```

Add a `toggleShadows` method:

```typescript
toggleShadows(): void {
  this.shadowsEnabled = !this.shadowsEnabled;
  this.shadowBtn.classList.toggle('active', this.shadowsEnabled);
  this.callbacks.onShadowToggle?.(this.shadowsEnabled);
}

getShadowsEnabled(): boolean {
  return this.shadowsEnabled;
}
```

### Step 3.2: Add `V` key to InputManager

- [ ] Modify `src/core/InputManager.ts`:

Add `toggleShadows` to the `InputEvent` union type:

```typescript
| { type: 'toggleShadows' }
```

In the `keydown` handler in `setupEventListeners`, add after the `KeyE` block:

```typescript
if (e.code === 'KeyV') {
  e.preventDefault();
  this.emit({ type: 'toggleShadows' });
}
```

### Step 3.3: Add CSS for separator

- [ ] In `index.html`, add to the existing `<style>` section (find the `.order-bar-btn` styles):

```css
.order-bar-separator {
  height: 1px;
  background: rgba(100, 140, 180, 0.2);
  margin: 4px 0;
}
```

### Step 3.4: Commit

- [ ] Commit:

```bash
git add src/ui/OrderBar.ts src/core/InputManager.ts index.html
git commit -m "feat: shadows toggle button and V keyboard shortcut"
```

---

## Task 4: Wire Everything in SpaceWarGame

**Files:**
- Modify: `src/game/SpaceWarGame.ts`

### Step 4.1: Import and instantiate SensorOcclusionRenderer

- [ ] Add import:

```typescript
import { SensorOcclusionRenderer } from '../rendering/SensorOcclusionRenderer';
```

Add field declarations alongside other renderers:

```typescript
private sensorOcclusionRenderer!: SensorOcclusionRenderer;
private shadowsEnabled = false;
```

In `setupRenderer()`, after the existing renderer instantiations (after `this.planetContactIndicatorsRenderer = ...`):

```typescript
this.sensorOcclusionRenderer = new SensorOcclusionRenderer(this.scene);
```

### Step 4.2: Wire the toggle callback in setupUI

- [ ] Modify the `OrderBar` construction in `setupUI()`:

```typescript
this.orderBar = new OrderBar(orderBarWrap, {
  onPendingOrderChange: (order) => {
    this.pendingOrder = order;
  },
  onShadowToggle: (enabled) => {
    this.shadowsEnabled = enabled;
  },
});
```

### Step 4.3: Wire the keyboard shortcut in setupInput

- [ ] In `setupInput()`, add a new case in the `switch (event.type)` block, after the `case 'focusNearestEnemy':` block and before the closing `}` of the switch:

```typescript
case 'toggleShadows':
  this.orderBar.toggleShadows();
  break;
```

### Step 4.4: Add renderer update to render loop

- [ ] In the `render()` method, after the `planetContactIndicatorsRenderer.update(...)` call:

```typescript
this.sensorOcclusionRenderer.update(this.world, this.shadowsEnabled);
```

### Step 4.5: Commit

- [ ] Commit:

```bash
git add src/game/SpaceWarGame.ts
git commit -m "feat: wire sensor occlusion renderer and shadow toggle in game loop"
```

---

## Task 5: Build & Verify

### Step 5.1: Run full test suite

- [ ] Run:

```bash
npm test -- --run
```

Expected: ALL PASS.

### Step 5.2: Run build

- [ ] Run:

```bash
npm run build
```

Expected: No TypeScript errors, clean build.

### Step 5.3: Manual verification

- [ ] Run `npm run dev`, open the game:
  1. Select a player ship
  2. Press `V` or click "Shadows" button
  3. Verify dark wedge shapes appear behind planets/stars/moons relative to the selected ship
  4. Deselect ship → wedges disappear
  5. Select multiple ships → wedges from each ship are visible
  6. Toggle off → wedges disappear
  7. Verify enemy ships behind planets are no longer detected (check contacts panel)

### Step 5.4: Final commit

- [ ] Commit all remaining changes:

```bash
git add -A
git commit -m "feat: sensor occlusion by celestial bodies with shadow zone visualization"
```
