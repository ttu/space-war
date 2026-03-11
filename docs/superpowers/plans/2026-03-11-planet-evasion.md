# Planet Evasion (Player + AI) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both player and enemy AI move orders avoid celestial danger zones (2× radius) by substituting a safe bypass waypoint when the straight-line path would intersect a body.

**Architecture:** A new `PlanetAvoidance` module in `src/game/` provides `getBodiesFromWorld`, `segmentIntersectsCircle`, and `getSafeWaypoint`. CommandHandler uses it in `issueMoveTo` and `issueMoveToForShip`; AIStrategicSystem uses it in `setEngage` and `setDisengage`. Danger radius matches CollisionSystem (export `DANGER_ZONE_MULTIPLIER`).

**Tech Stack:** TypeScript, Vitest, existing ECS (World, components).

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/engine/systems/CollisionSystem.ts` | Export `DANGER_ZONE_MULTIPLIER` (keep constant, add export). |
| `src/game/PlanetAvoidance.ts` | **NEW** — `getBodiesFromWorld(world)`, `segmentIntersectsCircle(ax,ay,bx,by,cx,cy,r)`, `getSafeWaypoint(fromX,fromY,toX,toY,bodies)`; use tangent-point or escape-vector bypass. |
| `src/game/CommandHandler.ts` | In `issueMoveTo` and `issueMoveToForShip`, get bodies, call `getSafeWaypoint`, substitute target when non-null. |
| `src/engine/systems/AIStrategicSystem.ts` | In `setEngage` and `setDisengage`, get bodies, call `getSafeWaypoint`, set `intent.moveToX/Y` from result or goal. |
| `tests/game/PlanetAvoidance.test.ts` | **NEW** — Unit tests for segmentIntersectsCircle and getSafeWaypoint. |

---

## Chunk 1: CollisionSystem export + PlanetAvoidance module (TDD)

### Task 1: Export danger zone constant

**Files:** Modify: `src/engine/systems/CollisionSystem.ts`

- [ ] **Step 1: Export the constant**

Change the constant to an exported named constant so PlanetAvoidance can use the same value:

```ts
/** Danger zone extends to this multiplier of body radius. */
export const DANGER_ZONE_MULTIPLIER = 2;
```

Update the usage in the same file from `DANGER_ZONE_MULTIPLIER` to the same name (no change if already using it). Ensure the `dangerRadius` calculation still uses it.

- [ ] **Step 2: Run build and tests**

Run: `npm run build && npm test`  
Expected: PASS (no behavior change).

- [ ] **Step 3: Commit**

```bash
git add src/engine/systems/CollisionSystem.ts
git commit -m "refactor: export DANGER_ZONE_MULTIPLIER for reuse"
```

---

### Task 2: PlanetAvoidance — segmentIntersectsCircle (TDD)

**Files:** Create: `tests/game/PlanetAvoidance.test.ts`, Create: `src/game/PlanetAvoidance.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/game/PlanetAvoidance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { segmentIntersectsCircle } from '../../src/game/PlanetAvoidance';

describe('segmentIntersectsCircle', () => {
  it('returns false when segment is far from circle', () => {
    expect(segmentIntersectsCircle(0, 0, 10, 0, 5, 5, 1)).toBe(false);
  });

  it('returns true when segment crosses circle', () => {
    expect(segmentIntersectsCircle(0, 0, 10, 0, 5, 0, 2)).toBe(true);
  });

  it('returns true when segment is entirely inside circle', () => {
    expect(segmentIntersectsCircle(1, 0, 2, 0, 0, 0, 5)).toBe(true);
  });

  it('returns true when one endpoint is on circle boundary', () => {
    expect(segmentIntersectsCircle(0, 0, 3, 0, 0, 0, 3)).toBe(true);
  });

  it('returns true when segment goes from inside to outside', () => {
    expect(segmentIntersectsCircle(0, 0, 10, 0, 0, 0, 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/game/PlanetAvoidance.test.ts`  
Expected: FAIL (module/function not found or not implemented).

- [ ] **Step 3: Implement segmentIntersectsCircle**

Create `src/game/PlanetAvoidance.ts` with:

- Helper: point-to-segment distance or segment–circle intersection logic. Segment (ax,ay)-(bx,by) intersects circle (cx,cy,r) if: (1) either endpoint is inside circle (distance ≤ r), or (2) closest point on segment to center is on the segment and distance ≤ r.
- Implement and export `segmentIntersectsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean`.

Reference: closest point on segment to (cx,cy) — project (cx,cy) onto line, clamp to segment, then compare distance to r.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/game/PlanetAvoidance.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/PlanetAvoidance.ts tests/game/PlanetAvoidance.test.ts
git commit -m "feat: add segmentIntersectsCircle for planet avoidance"
```

---

### Task 3: PlanetAvoidance — getBodiesFromWorld and getSafeWaypoint (TDD)

**Files:** Modify: `src/game/PlanetAvoidance.ts`, Modify: `tests/game/PlanetAvoidance.test.ts`

- [ ] **Step 1: Add types and getBodiesFromWorld**

In `PlanetAvoidance.ts`:

- Import `World` from `../engine/types`, `COMPONENT`, `Position`, `CelestialBody` from `../engine/components`, and `DANGER_ZONE_MULTIPLIER` from `../engine/systems/CollisionSystem`.
- Define type `BodyDanger = { x: number; y: number; radius: number }` (danger radius = body.radius * DANGER_ZONE_MULTIPLIER).
- Implement and export `getBodiesFromWorld(world: World): BodyDanger[]`: query world for COMPONENT.Position + COMPONENT.CelestialBody, map to `{ x: pos.x, y: pos.y, radius: body.radius * DANGER_ZONE_MULTIPLIER }`.

- [ ] **Step 2: Write failing tests for getSafeWaypoint**

Add to `tests/game/PlanetAvoidance.test.ts`:

```ts
import { getSafeWaypoint } from '../../src/game/PlanetAvoidance';

describe('getSafeWaypoint', () => {
  it('returns null when bodies array is empty', () => {
    expect(getSafeWaypoint(0, 0, 100, 0, [])).toBeNull();
  });

  it('returns null when path does not intersect any body', () => {
    const bodies = [{ x: 50, y: 50, radius: 10 }];
    expect(getSafeWaypoint(0, 0, 100, 0, bodies)).toBeNull();
  });

  it('returns a waypoint outside circle when path is blocked', () => {
    const bodies = [{ x: 50, y: 0, radius: 10 }]; // danger radius 10
    const result = getSafeWaypoint(0, 0, 100, 0, bodies);
    expect(result).not.toBeNull();
    if (result) {
      const dist = Math.sqrt((result.x - 50) ** 2 + (result.y - 0) ** 2);
      expect(dist).toBeGreaterThanOrEqual(10);
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/game/PlanetAvoidance.test.ts`  
Expected: Fail on getSafeWaypoint (not implemented or wrong).

- [ ] **Step 4: Implement getSafeWaypoint**

In `PlanetAvoidance.ts`:

- Implement `getSafeWaypoint(fromX: number, fromY: number, toX: number, toY: number, bodies: BodyDanger[]): { x: number; y: number } | null`.
- If bodies.length === 0, return null.
- For each body, if segment (from, to) intersects body circle (center body.x, body.y, radius body.radius), consider it blocking. Pick the blocking body whose center is closest to the segment (or first along the segment).
- If none block, return null.
- Bypass: compute tangent-from-point (fromX, fromY) to circle (body.x, body.y, body.radius). Use the two tangent points and choose the one closer to (toX, toY). Return that point with optional small margin (e.g. +5% on distance). If from is inside the circle, return point in direction away from body at distance body.radius + margin.
- Export `getSafeWaypoint`.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/game/PlanetAvoidance.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/PlanetAvoidance.ts tests/game/PlanetAvoidance.test.ts
git commit -m "feat: add getBodiesFromWorld and getSafeWaypoint for planet avoidance"
```

---

## Chunk 2: Wire CommandHandler and AIStrategicSystem

### Task 4: CommandHandler uses PlanetAvoidance

**Files:** Modify: `src/game/CommandHandler.ts`

- [ ] **Step 1: Integrate in issueMoveTo**

- Import `getBodiesFromWorld` and `getSafeWaypoint` from `./PlanetAvoidance`.
- At the start of the loop in `issueMoveTo` (for each ship id in toCommand), after getting pos, vel, thruster:  
  `const bodies = getBodiesFromWorld(this.world);`  
  `const safe = getSafeWaypoint(pos.x, pos.y, targetX, targetY, bodies);`  
  `const effectiveX = safe ? safe.x : targetX;`  
  `const effectiveY = safe ? safe.y : targetY;`  
  Use `effectiveX`, `effectiveY` in `computeBurnPlan` and in `NavigationOrder` (targetX/targetY stored in the order should be the effective waypoint).

- [ ] **Step 2: Integrate in issueMoveToForShip**

- Same pattern: get bodies, `getSafeWaypoint(pos.x, pos.y, targetX, targetY, bodies)`, use effective target for burn plan and NavigationOrder.

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm test`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/game/CommandHandler.ts
git commit -m "feat: player and AI move orders avoid planet danger zones"
```

---

### Task 5: AIStrategicSystem uses PlanetAvoidance

**Files:** Modify: `src/engine/systems/AIStrategicSystem.ts`

- [ ] **Step 1: Use getSafeWaypoint in setEngage**

- Import `getBodiesFromWorld` and `getSafeWaypoint` from `../../game/PlanetAvoidance`.
- In `setEngage`, after computing bestX, bestY (and setting intent.objective, intent.targetId):  
  `const bodies = getBodiesFromWorld(world);`  
  `const safe = getSafeWaypoint(pos.x, pos.y, bestX, bestY, bodies);`  
  If safe: set `intent.moveToX = safe.x`, `intent.moveToY = safe.y`. Else: set `intent.moveToX = bestX`, `intent.moveToY = bestY` (only when bestId !== undefined).

- [ ] **Step 2: Use getSafeWaypoint in setDisengage**

- In `setDisengage`, after computing retreat point (pos.x + nx * RETREAT_DISTANCE_KM, pos.y + ny * RETREAT_DISTANCE_KM):  
  `const bodies = getBodiesFromWorld(world);`  
  `const safe = getSafeWaypoint(pos.x, pos.y, intent.moveToX!, intent.moveToY!, bodies);`  
  If safe: set `intent.moveToX = safe.x`, `intent.moveToY = safe.y`. (Otherwise keep already-set moveToX/Y.)

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm test`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/systems/AIStrategicSystem.ts
git commit -m "feat: AI strategic waypoints avoid planet danger zones"
```

---

## Chunk 3: Verification and docs

### Task 6: Manual verification and docs

- [ ] **Step 1: Manual check**

- Run `npm run dev`, load demo scenario. Order player ship to a point on the far side of a planet: path should curve around. Observe enemy ships engaging near a planet: they should not fly into the danger zone.

- [ ] **Step 2: Update docs (if needed)**

- In `docs/architecture.md` or relevant doc, add a short note that move orders (player and AI) avoid celestial danger zones via bypass waypoints. Reference `PlanetAvoidance` and the spec.

- [ ] **Step 3: Final test run**

Run: `npm run build && npm test`  
Expected: All pass.

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-11-planet-evasion.md`. Ready to execute?**

Use **subagent-driven-development** (or **executing-plans**) to implement. Execute chunk by chunk with checkpoints.
