# Waypoint Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-waypoint navigation with shift+right-click queuing, drag-to-reposition, and hover+Delete removal.

**Architecture:** Extend `NavigationOrder` with a `waypoints[]` queue. `NavigationSystem` advances through waypoints on arrival. `TrailRenderer` renders waypoint markers for selected ships, dotted paths for unselected. `SpaceWarGame` handles waypoint drag/delete interaction via new input events.

**Tech Stack:** TypeScript, Three.js, Vitest

---

## Chunk 1: Core Data & Navigation Logic

### Task 1: Add waypoints to NavigationOrder component

**Files:**
- Modify: `src/engine/components/index.ts:121-132`

- [ ] **Step 1: Add waypoints field to NavigationOrder interface**

In `src/engine/components/index.ts`, add `waypoints` to `NavigationOrder`:

```typescript
export interface NavigationOrder extends Component {
  type: 'NavigationOrder';
  destinationX: number;
  destinationY: number;
  targetX: number;
  targetY: number;
  waypoints: { x: number; y: number }[];  // Queue of future destinations
  phase: NavPhase;
  burnPlan: BurnPlan;
  phaseStartTime: number;
  arrivalThreshold: number;
}
```

- [ ] **Step 2: Add waypoints: [] to all NavigationOrder creations in CommandHandler**

In `src/game/CommandHandler.ts`, add `waypoints: []` to both `addComponent<NavigationOrder>` calls (lines ~131 and ~186).

- [ ] **Step 3: Run build to verify no type errors**

Run: `npm run build`
Expected: SUCCESS (all existing NavigationOrder creations now include waypoints)

- [ ] **Step 4: Commit**

```
feat: add waypoints array to NavigationOrder component
```

### Task 2: NavigationSystem waypoint advancement

**Files:**
- Modify: `src/engine/systems/NavigationSystem.ts:68-80`
- Test: `tests/engine/systems/NavigationSystem.test.ts`

- [ ] **Step 1: Write failing test for waypoint advancement**

Create `tests/engine/systems/NavigationSystem.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { NavigationSystem } from '../../../src/engine/systems/NavigationSystem';
import { Position, Velocity, Thruster, NavigationOrder, RotationState, COMPONENT } from '../../../src/engine/components';
import { computeBurnPlan } from '../../../src/game/TrajectoryCalculator';

function createShipAtOrigin(world: WorldImpl, destX: number, destY: number, waypoints: { x: number; y: number }[] = []) {
  const id = world.createEntity();
  world.addComponent<Position>(id, { type: 'Position', x: 0, y: 0, prevX: 0, prevY: 0 });
  world.addComponent<Velocity>(id, { type: 'Velocity', vx: 0, vy: 0 });
  world.addComponent<Thruster>(id, { type: 'Thruster', maxThrust: 0.1, thrustAngle: 0, throttle: 0, rotationSpeed: 1 });
  const burnPlan = computeBurnPlan(0, 0, 0, 0, destX, destY, 0.1);
  world.addComponent<NavigationOrder>(id, {
    type: 'NavigationOrder',
    destinationX: destX, destinationY: destY,
    targetX: destX, targetY: destY,
    waypoints,
    phase: 'rotating', burnPlan, phaseStartTime: 0, arrivalThreshold: 100,
  });
  world.addComponent<RotationState>(id, { type: 'RotationState', currentAngle: 0, targetAngle: 0, rotating: false });
  return id;
}

describe('NavigationSystem', () => {
  it('removes NavigationOrder on arrival with no waypoints', () => {
    const world = new WorldImpl();
    const nav = new NavigationSystem();
    // Ship already at destination, speed = 0
    const id = createShipAtOrigin(world, 0, 0);
    nav.update(world, 0.1, 0);
    expect(world.hasComponent(id, COMPONENT.NavigationOrder)).toBe(false);
  });

  it('advances to next waypoint on arrival when waypoints exist', () => {
    const world = new WorldImpl();
    const nav = new NavigationSystem();
    // Ship at destination (0,0), with waypoint at (1000, 0)
    const id = createShipAtOrigin(world, 0, 0, [{ x: 1000, y: 0 }]);
    nav.update(world, 0.1, 0);
    const order = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(order).toBeDefined();
    expect(order!.destinationX).toBe(1000);
    expect(order!.destinationY).toBe(0);
    expect(order!.waypoints).toHaveLength(0);
  });

  it('advances through multiple waypoints sequentially', () => {
    const world = new WorldImpl();
    const nav = new NavigationSystem();
    const id = createShipAtOrigin(world, 0, 0, [{ x: 1000, y: 0 }, { x: 2000, y: 0 }]);

    // First arrival: advance to waypoint 1
    nav.update(world, 0.1, 0);
    let order = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
    expect(order.destinationX).toBe(1000);
    expect(order.waypoints).toHaveLength(1);
    expect(order.waypoints[0]).toEqual({ x: 2000, y: 0 });

    // Move ship to waypoint 1
    const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
    pos.x = 1000; pos.y = 0;
    order.targetX = 1000; order.targetY = 1000;

    // Second arrival: advance to waypoint 2
    nav.update(world, 0.1, 0);
    order = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
    expect(order.destinationX).toBe(2000);
    expect(order.waypoints).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/engine/systems/NavigationSystem.test.ts`
Expected: FAIL (waypoints not handled yet)

- [ ] **Step 3: Implement waypoint advancement in NavigationSystem**

In `src/engine/systems/NavigationSystem.ts`, replace the arrival logic (around line 68-80):

```typescript
    if (distToTarget < nav.arrivalThreshold && speed < ARRIVAL_SPEED_THRESHOLD) {
      const atDestination =
        Math.abs(nav.targetX - nav.destinationX) < 1 &&
        Math.abs(nav.targetY - nav.destinationY) < 1;
      if (atDestination) {
        // Check for queued waypoints
        if (nav.waypoints.length > 0) {
          const next = nav.waypoints.shift()!;
          nav.destinationX = next.x;
          nav.destinationY = next.y;
          nav.targetX = next.x;
          nav.targetY = next.y;
          nav.burnPlan = computeBurnPlan(
            pos.x, pos.y, vel.vx, vel.vy,
            next.x, next.y, thruster.maxThrust,
          );
          nav.phase = 'rotating';
          return;
        }
        this.arrive(world, entityId, thruster);
        return;
      }
      // Arrived at avoidance waypoint — advance target to destination
      nav.targetX = nav.destinationX;
      nav.targetY = nav.destinationY;
      return;
    }
```

Note: `computeBurnPlan` import is already present at the top of NavigationSystem.ts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/engine/systems/NavigationSystem.test.ts`
Expected: PASS

- [ ] **Step 5: Run full build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```
feat: NavigationSystem advances through waypoint queue on arrival
```

### Task 3: CommandHandler append mode

**Files:**
- Modify: `src/game/CommandHandler.ts:85-158`

- [ ] **Step 1: Add append parameter to issueMoveTo**

In `src/game/CommandHandler.ts`, change `issueMoveTo` signature and logic:

```typescript
  issueMoveTo(targetX: number, targetY: number, append = false): void {
```

At the point where the nav order is created/replaced (inside the `for (const id of toCommand)` loop), change the logic:

```typescript
    for (const id of toCommand) {
      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(id, COMPONENT.Velocity)!;
      const thruster = this.world.getComponent<Thruster>(id, COMPONENT.Thruster)!;

      // Append mode: add waypoint to existing route
      if (append && this.world.hasComponent(id, COMPONENT.NavigationOrder)) {
        const nav = this.world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
        nav.waypoints.push({ x: targetX, y: targetY });
        continue;
      }

      const bodies = getBodiesFromWorld(this.world);
      const safe = getSafeWaypoint(pos.x, pos.y, targetX, targetY, bodies);
      const effectiveX = safe ? safe.x : targetX;
      const effectiveY = safe ? safe.y : targetY;

      const burnPlan = computeBurnPlan(
        pos.x, pos.y,
        vel.vx, vel.vy,
        effectiveX, effectiveY,
        thruster.maxThrust,
      );

      if (this.world.hasComponent(id, COMPONENT.NavigationOrder)) {
        this.world.removeComponent(id, COMPONENT.NavigationOrder);
      }

      this.world.addComponent<NavigationOrder>(id, {
        type: 'NavigationOrder',
        destinationX: targetX,
        destinationY: targetY,
        targetX: effectiveX,
        targetY: effectiveY,
        waypoints: [],
        phase: 'rotating',
        burnPlan,
        phaseStartTime: 0,
        arrivalThreshold: 100,
      });

      // ... rotation state setup unchanged ...
```

When `append` is true and ship has NO existing NavigationOrder, it falls through to the normal path (creates new order with empty waypoints). This handles shift+right-click when the ship is idle.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```
feat: CommandHandler issueMoveTo supports append mode for waypoint queuing
```

## Chunk 2: Input Wiring

### Task 4: Add shiftKey to rightClick input event

**Files:**
- Modify: `src/core/InputManager.ts:2,131,190,193`

- [ ] **Step 1: Add shiftKey to rightClick event type**

In `src/core/InputManager.ts` line 3, change:
```typescript
  | { type: 'rightClick'; screenX: number; screenY: number; shiftKey: boolean }
```

- [ ] **Step 2: Pass shiftKey in mouseup handler**

Line 131, change:
```typescript
          this.emit({ type: 'rightClick', screenX: e.clientX, screenY: e.clientY, shiftKey: e.shiftKey });
```

- [ ] **Step 3: Pass shiftKey in contextmenu handler**

Lines 190 and 193, change both:
```typescript
          this.emit({ type: 'rightClick', screenX: me.clientX, screenY: me.clientY, shiftKey: me.shiftKey });
```

- [ ] **Step 4: Add deleteWaypoint and waypointDrag input events**

Add new event types to the InputEvent union:
```typescript
  | { type: 'deleteKey'; screenX: number; screenY: number }
  | { type: 'waypointDragStart'; screenX: number; screenY: number }
  | { type: 'waypointDragMove'; screenX: number; screenY: number }
  | { type: 'waypointDragEnd'; screenX: number; screenY: number }
```

Add `lastMouseScreenForKeys` tracking to capture current mouse position for Delete key:

In the class, add field:
```typescript
  private currentMouseScreen = { x: 0, y: 0 };
```

In `mousemove` handler (existing), add at the top:
```typescript
      this.currentMouseScreen = { x: e.clientX, y: e.clientY };
```

In `keydown` handler, add:
```typescript
      if (e.code === 'Delete' || e.code === 'Backspace') {
        this.emit({ type: 'deleteKey', screenX: this.currentMouseScreen.x, screenY: this.currentMouseScreen.y });
      }
```

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```
feat: add shiftKey to rightClick and deleteKey input events
```

### Task 5: Wire shift+right-click and delete in SpaceWarGame

**Files:**
- Modify: `src/game/SpaceWarGame.ts:411-412,521-599`

- [ ] **Step 1: Update handleRightClick to accept shiftKey**

Change `handleRightClick` signature and pass shiftKey from the event:

In `setupInput()`, change the rightClick case:
```typescript
        case 'rightClick':
          this.handleRightClick(event.screenX, event.screenY, event.shiftKey);
          break;
```

Change `handleRightClick` signature:
```typescript
  private handleRightClick(screenX: number, screenY: number, shiftKey = false): void {
```

At the move-to branch (line ~592-598), pass `shiftKey` as append:
```typescript
    } else if (order === 'move' || order === 'none') {
      this.commandHandler.issueMoveTo(worldPos.x, worldPos.y, shiftKey);
      if (order === 'move') {
        this.orderBar.setPendingOrder('none');
        this.pendingOrder = 'none';
      }
    }
```

- [ ] **Step 2: Add deleteKey handler**

In `setupInput()`, add case:
```typescript
        case 'deleteKey':
          this.handleDeleteWaypoint(event.screenX, event.screenY);
          break;
```

Add `handleDeleteWaypoint` method:
```typescript
  private handleDeleteWaypoint(screenX: number, screenY: number): void {
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const zoom = this.camera.getZoom();
    const pickRadius = zoom * 0.04;

    const selectedIds = this.selectionManager.getSelectedPlayerIds();
    if (selectedIds.length === 0) return;

    for (const shipId of selectedIds) {
      const nav = this.world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
      if (!nav || nav.phase === 'arrived') continue;

      // Check destination marker
      const ddx = nav.destinationX - worldPos.x;
      const ddy = nav.destinationY - worldPos.y;
      const destDist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (destDist < pickRadius) {
        if (nav.waypoints.length > 0) {
          const next = nav.waypoints.shift()!;
          nav.destinationX = next.x;
          nav.destinationY = next.y;
          nav.targetX = next.x;
          nav.targetY = next.y;
        } else {
          this.world.removeComponent(shipId, COMPONENT.NavigationOrder);
        }
        return;
      }

      // Check waypoint markers
      for (let i = 0; i < nav.waypoints.length; i++) {
        const wp = nav.waypoints[i];
        const dx = wp.x - worldPos.x;
        const dy = wp.y - worldPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < pickRadius) {
          nav.waypoints.splice(i, 1);
          return;
        }
      }
    }
  }
```

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```
feat: wire shift+right-click waypoint append and Delete key removal
```

## Chunk 3: Waypoint Drag Interaction

### Task 6: Waypoint dragging in SpaceWarGame

**Files:**
- Modify: `src/game/SpaceWarGame.ts`
- Modify: `src/core/InputManager.ts`

- [ ] **Step 1: Add waypoint drag state to SpaceWarGame**

Add fields to `SpaceWarGame`:
```typescript
  private waypointDrag: {
    shipId: EntityId;
    waypointIndex: number; // -1 = destination, 0+ = waypoints[i]
  } | null = null;
```

- [ ] **Step 2: Implement waypoint drag detection in left mousedown**

Instead of adding new input events for waypoint drag (which would complicate InputManager), handle it in `handleClick`. When a click lands on a waypoint, we enter drag mode instead of selecting.

Actually, better approach: intercept the existing left-drag logic. In `SpaceWarGame`, add a check at the `click` event — if the click is near a waypoint of a selected ship, start tracking for drag. Then on `boxSelectUpdate`, if we're in waypoint drag mode, move the waypoint instead. On `boxSelect` (mouseup), if in waypoint drag mode, commit and exit.

Modify `handleClick`:
```typescript
  private handleClick(screenX: number, screenY: number, shiftKey: boolean): void {
    // Check if clicking a waypoint marker (for drag start)
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const zoom = this.camera.getZoom();
    const pickRadius = zoom * 0.04;

    if (this.tryStartWaypointDrag(worldPos.x, worldPos.y, pickRadius)) return;

    this.selectionManager.setSelectionFromClick(worldPos.x, worldPos.y, pickRadius, shiftKey);
  }
```

Add `tryStartWaypointDrag`:
```typescript
  private tryStartWaypointDrag(worldX: number, worldY: number, pickRadius: number): boolean {
    const selectedIds = this.selectionManager.getSelectedPlayerIds();
    for (const shipId of selectedIds) {
      const nav = this.world.getComponent<NavigationOrder>(shipId, COMPONENT.NavigationOrder);
      if (!nav || nav.phase === 'arrived') continue;

      // Check destination
      const ddx = nav.destinationX - worldX;
      const ddy = nav.destinationY - worldY;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < pickRadius) {
        this.waypointDrag = { shipId, waypointIndex: -1 };
        return true;
      }

      // Check waypoints
      for (let i = 0; i < nav.waypoints.length; i++) {
        const wp = nav.waypoints[i];
        const dx = wp.x - worldX;
        const dy = wp.y - worldY;
        if (Math.sqrt(dx * dx + dy * dy) < pickRadius) {
          this.waypointDrag = { shipId, waypointIndex: i };
          return true;
        }
      }
    }
    return false;
  }
```

- [ ] **Step 3: Handle waypoint drag during boxSelectUpdate**

Modify the `boxSelectUpdate` case in `setupInput`:
```typescript
        case 'boxSelectUpdate':
          if (this.waypointDrag) {
            this.handleWaypointDragMove(event.endScreenX, event.endScreenY);
          } else {
            this.selectionBoxState = {
              startScreenX: event.startScreenX,
              startScreenY: event.startScreenY,
              endScreenX: event.endScreenX,
              endScreenY: event.endScreenY,
            };
          }
          break;
```

Add:
```typescript
  private handleWaypointDragMove(screenX: number, screenY: number): void {
    if (!this.waypointDrag) return;
    const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
    const nav = this.world.getComponent<NavigationOrder>(this.waypointDrag.shipId, COMPONENT.NavigationOrder);
    if (!nav) { this.waypointDrag = null; return; }

    if (this.waypointDrag.waypointIndex === -1) {
      nav.destinationX = worldPos.x;
      nav.destinationY = worldPos.y;
      nav.targetX = worldPos.x;
      nav.targetY = worldPos.y;
    } else {
      const wp = nav.waypoints[this.waypointDrag.waypointIndex];
      if (wp) { wp.x = worldPos.x; wp.y = worldPos.y; }
    }
  }
```

- [ ] **Step 4: Handle waypoint drag end on boxSelect (mouseup)**

Modify the `boxSelect` case:
```typescript
        case 'boxSelect':
          if (this.waypointDrag) {
            this.handleWaypointDragEnd(event.endScreenX, event.endScreenY);
          } else {
            this.handleBoxSelect(event.startScreenX, event.startScreenY, event.endScreenX, event.endScreenY, event.shiftKey);
          }
          break;
```

Add:
```typescript
  private handleWaypointDragEnd(screenX: number, screenY: number): void {
    if (!this.waypointDrag) return;
    // Apply final position
    this.handleWaypointDragMove(screenX, screenY);

    // Recompute burn plan if destination was dragged
    if (this.waypointDrag.waypointIndex === -1) {
      const nav = this.world.getComponent<NavigationOrder>(this.waypointDrag.shipId, COMPONENT.NavigationOrder);
      if (nav) {
        const pos = this.world.getComponent<Position>(this.waypointDrag.shipId, COMPONENT.Position)!;
        const vel = this.world.getComponent<Velocity>(this.waypointDrag.shipId, COMPONENT.Velocity)!;
        const thruster = this.world.getComponent<Thruster>(this.waypointDrag.shipId, COMPONENT.Thruster)!;
        const bodies = getBodiesFromWorld(this.world);
        const safe = getSafeWaypoint(pos.x, pos.y, nav.destinationX, nav.destinationY, bodies);
        nav.targetX = safe ? safe.x : nav.destinationX;
        nav.targetY = safe ? safe.y : nav.destinationY;
        nav.burnPlan = computeBurnPlan(pos.x, pos.y, vel.vx, vel.vy, nav.targetX, nav.targetY, thruster.maxThrust);
      }
    }

    this.waypointDrag = null;
  }
```

Note: Need to add imports at top of SpaceWarGame.ts:
```typescript
import { Velocity, Thruster, COMPONENT } from '../engine/components';
import { computeBurnPlan } from './TrajectoryCalculator';
import { getBodiesFromWorld, getSafeWaypoint } from './PlanetAvoidance';
```
(Some may already be imported — only add missing ones.)

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```
feat: waypoint drag-to-reposition interaction
```

## Chunk 4: Rendering

### Task 7: Multi-leg trajectory projection and waypoint markers

**Files:**
- Modify: `src/rendering/TrailRenderer.ts`

- [ ] **Step 1: Pass selected ship IDs to TrailRenderer.update**

Change `update` signature in `TrailRenderer`:
```typescript
  update(world: World, zoom: number, selectedPlayerIds: Set<EntityId>): void {
```

In `SpaceWarGame.ts` render method, pass selected IDs:
```typescript
    const selectedPlayerIds = new Set(this.selectionManager.getSelectedPlayerIds());
    this.trailRenderer.update(this.world, zoom, selectedPlayerIds);
```

- [ ] **Step 2: Add waypoint marker rendering**

Add a `waypointMarkers` map alongside existing `destinationMarkers`:
```typescript
  private waypointMarkers: Map<string, THREE.Group> = new Map(); // key: `${entityId}-${index}`
```

Add `updateWaypointMarkers` method:
```typescript
  private updateWaypointMarkers(
    world: World, entityId: EntityId, zoom: number, isSelected: boolean,
  ): void {
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder);
    const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship);
    if (!nav || nav.phase === 'arrived' || !ship || ship.faction !== 'player') {
      this.cleanupWaypointMarkers(entityId);
      return;
    }

    const waypoints = nav.waypoints;

    // Remove excess markers
    for (const [key, marker] of this.waypointMarkers) {
      if (key.startsWith(`${entityId}-`)) {
        const idx = parseInt(key.split('-').pop()!, 10);
        if (idx >= waypoints.length) {
          this.group.remove(marker);
          this.waypointMarkers.delete(key);
        }
      }
    }

    if (!isSelected) {
      // Hide all waypoint markers for unselected ships
      for (const [key, marker] of this.waypointMarkers) {
        if (key.startsWith(`${entityId}-`)) marker.visible = false;
      }
      return;
    }

    for (let i = 0; i < waypoints.length; i++) {
      const key = `${entityId}-${i}`;
      let marker = this.waypointMarkers.get(key);
      if (!marker) {
        marker = this.createWaypointMarker(i + 1);
        this.waypointMarkers.set(key, marker);
        this.group.add(marker);
      }
      marker.visible = true;
      marker.position.set(waypoints[i].x, waypoints[i].y, 0.4);
      const s = zoom * DESTINATION_MARKER_SIZE;
      marker.scale.set(s, s, 1);
    }
  }

  private cleanupWaypointMarkers(entityId: EntityId): void {
    for (const [key, marker] of this.waypointMarkers) {
      if (key.startsWith(`${entityId}-`)) {
        this.group.remove(marker);
        this.waypointMarkers.delete(key);
      }
    }
  }

  private createWaypointMarker(number: number): THREE.Group {
    const group = this.createDestinationMarker();

    // Add number label
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#44ddff';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.9 });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(1.2, 1.2, 0); // Offset to upper-right
    sprite.scale.set(1.5, 1.5, 1);
    group.add(sprite);

    return group;
  }
```

- [ ] **Step 3: Update multi-leg projection**

Modify `projectPath` to simulate through waypoints:

```typescript
  private projectPath(
    pos: Position, vel: Velocity,
    thruster: Thruster | undefined,
    nav: NavigationOrder | undefined,
  ): TrailPoint[] {
    const points: TrailPoint[] = [{ x: pos.x, y: pos.y }];
    let px = pos.x, py = pos.y;
    let vx = vel.vx, vy = vel.vy;

    if (nav && thruster && nav.phase !== 'arrived') {
      // Build target list: current destination + all waypoints
      const targets = [
        { x: nav.targetX, y: nav.targetY },
        ...nav.waypoints,
      ];

      const a = thruster.maxThrust;
      const rotSpeed = thruster.rotationSpeed;

      for (const target of targets) {
        for (let i = 0; i < MAX_NAV_PROJECTION_STEPS; i++) {
          const dx = target.x - px;
          const dy = target.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < nav.arrivalThreshold) break;

          const dirX = dx / dist;
          const dirY = dy / dist;
          const speed = Math.sqrt(vx * vx + vy * vy);

          const rotTime = Math.PI / rotSpeed;
          const rotBuffer = speed * rotTime * 0.5;
          const effectiveDist = Math.max(0, dist - rotBuffer);
          const maxApproachSpeed = Math.sqrt(2 * a * effectiveDist);

          const desiredVx = dirX * maxApproachSpeed;
          const desiredVy = dirY * maxApproachSpeed;
          const dvx = desiredVx - vx;
          const dvy = desiredVy - vy;
          const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);

          if (dvMag > 0.01) {
            vx += (dvx / dvMag) * a * PROJECTION_DT;
            vy += (dvy / dvMag) * a * PROJECTION_DT;
          }

          px += vx * PROJECTION_DT;
          py += vy * PROJECTION_DT;
          points.push({ x: px, y: py });
        }
      }
    } else {
      // No navigation — simple velocity extrapolation (unchanged)
      for (let i = 0; i < PROJECTION_STEPS; i++) {
        if (thruster && thruster.throttle > 0) {
          const accel = thruster.maxThrust * thruster.throttle;
          vx += Math.cos(thruster.thrustAngle) * accel * PROJECTION_DT;
          vy += Math.sin(thruster.thrustAngle) * accel * PROJECTION_DT;
        }
        px += vx * PROJECTION_DT;
        py += vy * PROJECTION_DT;
        points.push({ x: px, y: py });
      }
    }

    return points;
  }
```

- [ ] **Step 4: Add connecting lines for unselected ships**

Add a `waypointRouteLines` map for subtle dotted lines:
```typescript
  private waypointRouteLines: Map<EntityId, THREE.Line> = new Map();
```

Add method to draw straight-line connections through waypoints for unselected ships:
```typescript
  private updateWaypointRouteLine(
    world: World, entityId: EntityId, zoom: number, isSelected: boolean,
  ): void {
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder);
    const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship);
    if (!nav || nav.phase === 'arrived' || !ship || ship.faction !== 'player' || nav.waypoints.length === 0) {
      const existing = this.waypointRouteLines.get(entityId);
      if (existing) existing.visible = false;
      return;
    }

    // For selected ships, the projection already shows the full route — skip the route line
    if (isSelected) {
      const existing = this.waypointRouteLines.get(entityId);
      if (existing) existing.visible = false;
      return;
    }

    const allPoints = [
      { x: nav.destinationX, y: nav.destinationY },
      ...nav.waypoints,
    ];
    const maxPts = allPoints.length;

    let line = this.waypointRouteLines.get(entityId);
    if (!line) {
      const positions = new Float32Array(20 * 3); // max 20 waypoints
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineDashedMaterial({
        color: DESTINATION_COLOR,
        transparent: true,
        opacity: 0.3,
        dashSize: 300,
        gapSize: 200,
      });
      line = new THREE.Line(geo, mat);
      this.waypointRouteLines.set(entityId, line);
      this.group.add(line);
    }

    const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < maxPts && i < 20; i++) {
      posAttr.setXYZ(i, allPoints[i].x, allPoints[i].y, 0.35);
    }
    posAttr.needsUpdate = true;
    line.geometry.setDrawRange(0, Math.min(maxPts, 20));
    line.computeLineDistances();
    line.visible = true;
  }
```

- [ ] **Step 5: Wire new methods into update loop**

In `update()`, after the existing `for (const entityId of ships)` loop body, add calls:

```typescript
    for (const entityId of ships) {
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship)!;
      const isSelected = selectedPlayerIds.has(entityId);
      this.updateTrailLine(entityId, ship.faction === 'player' ? TRAIL_COLOR_PLAYER : TRAIL_COLOR_ENEMY);
      this.updateProjectionLine(world, entityId, zoom);
      this.updateDestinationMarker(world, entityId, zoom);
      this.updateWaypointMarkers(world, entityId, zoom, isSelected);
      this.updateWaypointRouteLine(world, entityId, zoom, isSelected);
    }
```

Clean up dead entity waypoint markers and route lines alongside existing cleanup:
```typescript
    for (const [key, marker] of this.waypointMarkers) {
      const entityId = key.split('-')[0] as EntityId;
      if (!activeIds.has(entityId)) {
        this.group.remove(marker);
        this.waypointMarkers.delete(key);
      }
    }
    for (const [id, line] of this.waypointRouteLines) {
      if (!activeIds.has(id)) {
        this.group.remove(line);
        this.waypointRouteLines.delete(id);
      }
    }
```

- [ ] **Step 6: Update dispose method**

Add cleanup for new collections in `dispose()`:
```typescript
    for (const [, marker] of this.waypointMarkers) {
      this.group.remove(marker);
    }
    for (const [, line] of this.waypointRouteLines) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    this.waypointMarkers.clear();
    this.waypointRouteLines.clear();
```

- [ ] **Step 7: Run build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```
feat: waypoint markers, multi-leg projection, and route lines in TrailRenderer
```

## Chunk 5: Final Integration & Polish

### Task 8: Update info overlay and final verification

**Files:**
- Modify: `src/game/SpaceWarGame.ts`

- [ ] **Step 1: Update info overlay text**

In `setupUI()`, update the info overlay text to mention shift+right-click and Delete:
```typescript
    infoOverlay.textContent = 'WASD: Pan | Scroll: Zoom | Space: Pause | +/-: Speed | E: Focus enemy | V: Shadows | Shift+RClick: Add waypoint | Del: Remove waypoint';
```

- [ ] **Step 2: Run full build and tests**

Run: `npm run build && npm test`
Expected: SUCCESS

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Test:
1. Right-click to set destination — ship navigates (unchanged)
2. Shift+right-click to add waypoints — numbered markers appear, ship follows route
3. Hover waypoint + Delete — waypoint removed
4. Left-click drag a waypoint — repositions
5. Deselect ship — waypoint markers disappear, subtle dotted route line shows
6. Select ship again — full markers reappear

- [ ] **Step 4: Final commit with all changes**

```
feat: waypoint navigation system with shift+right-click queuing, drag, and delete
```
