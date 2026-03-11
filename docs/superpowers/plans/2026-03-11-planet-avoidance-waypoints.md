# Planet Avoidance: Preserve Destination + Waypoint System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ships keep the original move destination when going around planets; waypoints are used only as current-leg targets, and on arrival at a waypoint the next target becomes the destination (or a new waypoint if the path is still blocked).

**Architecture:** Add `destinationX`, `destinationY` to `NavigationOrder` (immutable). In-flight correction calls `getSafeWaypoint(pos, destination, bodies)` so waypoints always aim toward the final goal. On arrival: if target equals destination → remove order; else (arrived at waypoint) → set target = destination and continue.

**Tech Stack:** TypeScript, Vitest, existing ECS (World, components), PlanetAvoidance (existing).

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/engine/components/index.ts` | Add `destinationX`, `destinationY` to `NavigationOrder` interface. |
| `src/game/CommandHandler.ts` | Set destination = requested point; target = waypoint or destination; pass both when creating NavigationOrder. |
| `src/engine/systems/NavigationSystem.ts` | Use `nav.destinationX/Y` in getSafeWaypoint; on arrival, if target ≈ destination remove order else set target = destination. |
| `src/rendering/TrailRenderer.ts` | Use `destinationX/Y` for destination marker (final goal). |
| `src/ui/ShipDetailPanel.ts` | Show destination (and optionally "via waypoint" when target ≠ destination). |
| `tests/engine/components/navigation.test.ts` | Extend for destination fields if present. |
| `tests/engine/systems/NavigationSystem.test.ts` | Add destination to test nav orders; add test: arrive at waypoint sets target to destination. |
| `tests/game/CommandHandler.test.ts` | Assert destinationX/Y are set on issueMoveTo. |

---

## Chunk 1: Component + CommandHandler

### Task 1: Add destination to NavigationOrder

**Files:** Modify: `src/engine/components/index.ts`

- [ ] **Step 1: Extend NavigationOrder interface**

In `src/engine/components/index.ts`, in the `NavigationOrder` interface (around line 121), add:

```ts
destinationX: number;  // km — final goal, never changed by avoidance
destinationY: number;
```

Keep existing `targetX`, `targetY`, `phase`, `burnPlan`, `phaseStartTime`, `arrivalThreshold`.

- [ ] **Step 2: Run build**

Run: `npm run build`  
Expected: Build may fail at call sites that create NavigationOrder (missing required fields). We fix those in Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/engine/components/index.ts
git commit -m "feat: add destinationX/Y to NavigationOrder for waypoint system"
```

---

### Task 2: CommandHandler sets destination and target

**Files:** Modify: `src/game/CommandHandler.ts`

- [ ] **Step 1: issueMoveTo — set destination and optional waypoint**

In `issueMoveTo`, for each ship in `toCommand`:
- Set `destinationX = targetX`, `destinationY = targetY` (the clicked/requested goal).
- After `const safe = getSafeWaypoint(pos.x, pos.y, targetX, targetY, bodies)`:
  - If `safe` is non-null: set `effectiveX = safe.x`, `effectiveY = safe.y` (current leg = waypoint).
  - Else: set `effectiveX = targetX`, `effectiveY = targetY` (current leg = destination).
- When adding NavigationOrder, set:
  - `destinationX: targetX`, `destinationY: targetY`
  - `targetX: effectiveX`, `targetY: effectiveY`
  - (rest unchanged: phase, burnPlan, phaseStartTime, arrivalThreshold).

Use `effectiveX`, `effectiveY` in `computeBurnPlan` (burn plan is for current leg).

- [ ] **Step 2: issueMoveToForShip — same pattern**

In `issueMoveToForShip`: set `destinationX = targetX`, `destinationY = targetY`; compute `safe = getSafeWaypoint(pos.x, pos.y, targetX, targetY, bodies)`; set `effectiveX/Y` from safe or target; add NavigationOrder with `destinationX/Y` and `targetX: effectiveX`, `targetY: effectiveY`.

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm test`  
Expected: May fail in NavigationSystem or tests that create NavigationOrder without destination (next task).

- [ ] **Step 4: Commit**

```bash
git add src/game/CommandHandler.ts
git commit -m "feat: set destination and waypoint in move orders"
```

---

### Task 3: NavigationSystem uses destination for correction and arrival

**Files:** Modify: `src/engine/systems/NavigationSystem.ts`

- [ ] **Step 1: In-flight correction uses destination**

In the block where `needCorrection` is true (around line 46):
- Change `getSafeWaypoint(pos.x, pos.y, nav.targetX, nav.targetY, bodies)` to `getSafeWaypoint(pos.x, pos.y, nav.destinationX, nav.destinationY, bodies)`.
- When `safe != null`, set `nav.targetX = safe.x`, `nav.targetY = safe.y` and recompute burn plan to `(nav.targetX, nav.targetY)`. Do not change `nav.destinationX` or `nav.destinationY`.

- [ ] **Step 2: Arrival — distinguish waypoint vs destination**

When the ship is "arrived" (close to target and slow enough):
- Define "target equals destination" as: `Math.abs(nav.targetX - nav.destinationX) < 1 && Math.abs(nav.targetY - nav.destinationY) < 1` (1 km tolerance).
- If target equals destination: call `this.arrive(world, entityId, thruster)` (remove NavigationOrder) and return.
- Else (arrived at a waypoint): set `nav.targetX = nav.destinationX`, `nav.targetY = nav.destinationY`. Do not remove the order. Do not recompute burn plan here; next tick the correction logic may set target to a new waypoint if the segment to destination still crosses a body.

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm test`  
Expected: Failures in tests that create NavigationOrder without destinationX/Y (e.g. NavigationSystem.test.ts, CommandHandler.test.ts). Fix in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/engine/systems/NavigationSystem.ts
git commit -m "feat: use destination for waypoint correction; advance to destination on waypoint arrival"
```

---

### Task 4: Tests — add destination to all NavigationOrder creation

**Files:** Modify: `tests/engine/systems/NavigationSystem.test.ts`, `tests/game/CommandHandler.test.ts`, `tests/engine/systems/AITacticalSystem.test.ts` (if it creates NavigationOrder), any other test that adds NavigationOrder.

- [ ] **Step 1: NavigationSystem.test.ts**

In helper `createShipWithNav`, add `destinationX` and `destinationY` to the NavigationOrder object. Use the same values as `targetX`/`targetY` by default (e.g. `destinationX: opts.destinationX ?? opts.targetX ?? 10000`, `destinationY: opts.destinationY ?? opts.targetY ?? 0`). Ensure every test that creates a nav order has destination set (can default to target).

- [ ] **Step 2: CommandHandler.test.ts**

Update expectations: after `handler.issueMoveTo(10000, 0)`, assert `nav!.destinationX === 10000` and `nav!.destinationY === 0`, and when path is clear `nav!.targetX === 10000`, `nav!.targetY === 0`. For the "replaces existing" test, assert new order has `destinationX: 5000`, `destinationY: 5000`, `targetX: 5000`, `targetY: 5000`.

- [ ] **Step 3: AITacticalSystem and other tests**

Search for `addComponent.*NavigationOrder` or `COMPONENT.NavigationOrder` in tests; add `destinationX`, `destinationY` to any created NavigationOrder (same as targetX/targetY if no waypoint).

- [ ] **Step 4: Run tests**

Run: `npm test`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: add destination to NavigationOrder in tests"
```

---

## Chunk 2: UI and optional test

### Task 5: TrailRenderer and ShipDetailPanel use destination

**Files:** Modify: `src/rendering/TrailRenderer.ts`, `src/ui/ShipDetailPanel.ts`

- [ ] **Step 1: TrailRenderer destination marker**

Where the destination marker position is set (e.g. `marker.position.set(nav.targetX, nav.targetY, ...)`), change to use the final goal: `marker.position.set(nav.destinationX, nav.destinationY, ...)` so the player sees the intended destination, not the current waypoint.

- [ ] **Step 2: ShipDetailPanel order text**

Where the panel shows "Order: Move → (x, y)", show the destination: e.g. "Move → (round(destinationX), round(destinationY))" and optionally "via waypoint" when `targetX !== destinationX || targetY !== destinationY`.

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm test`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/rendering/TrailRenderer.ts src/ui/ShipDetailPanel.ts
git commit -m "feat: show destination in trail marker and ship panel"
```

---

### Task 6: Optional unit test for waypoint → destination advance

**Files:** Create or modify: `tests/engine/systems/NavigationSystem.test.ts`

- [ ] **Step 1: Add test: on arrival at waypoint, target becomes destination**

In NavigationSystem.test.ts, add a test that:
- Creates a ship with NavigationOrder where `targetX/Y` ≠ `destinationX/Y` (e.g. target = waypoint at (1000, 0), destination = (10000, 0)).
- Sets position close to target and velocity low (e.g. px=1005, py=0, vx=0, vy=0, targetX=1000, targetY=0, destinationX=10000, destinationY=0).
- Calls `system.update(world, 1, 10)`.
- Asserts NavigationOrder still exists and `nav.targetX === 10000`, `nav.targetY === 0` (target was updated to destination).

- [ ] **Step 2: Run test**

Run: `npm test -- tests/engine/systems/NavigationSystem.test.ts`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/engine/systems/NavigationSystem.test.ts
git commit -m "test: waypoint arrival advances target to destination"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full build and test**

Run: `npm run build && npm test`  
Expected: All pass.

- [ ] **Step 2: Manual check**

Run `npm run dev`, load demo scenario. Order a ship to a point on the far side of a planet: ship should go around and stop at the clicked destination, not at the first waypoint.

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-11-planet-avoidance-waypoints.md`. Ready to execute?**

Use **subagent-driven-development** (or **executing-plans**) to implement. Execute chunk by chunk with checkpoints.
