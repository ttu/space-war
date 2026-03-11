# AI and Player Planet Evasion

**Date**: 2026-03-11
**Status**: Approved

## Summary

Both enemy AI and player move orders will avoid flying through celestial body danger zones (2× radius). When the straight-line path from ship to target intersects a danger zone, a bypass waypoint is computed and used instead; re-issuing on arrival handles multi-leg paths.

## Scope

- **Player**: `CommandHandler.issueMoveTo` — when the player clicks a move target, if the path intersects a danger zone, the issued order uses a safe waypoint (same arrival/re-evaluation behavior as today).
- **AI**: `AIStrategicSystem` sets `intent.moveToX/Y`. Before assigning, if segment ship→goal intersects a danger zone, assign a safe waypoint instead of the raw goal. Tactical AI and CommandHandler unchanged; `issueMoveToForShip` receives already-safe coordinates.

## Design

### 1. Shared avoidance helper

Introduce a small module used by both CommandHandler and AIStrategicSystem:

- **Location**: `src/game/PlanetAvoidance.ts` (or `src/utils/PlanetAvoidance.ts`). Game layer is appropriate because it serves both UI-driven commands and AI.
- **API**:
  - `getBodiesFromWorld(world: World): { x: number; y: number; radius: number }[]`  
    Query `COMPONENT.Position` + `COMPONENT.CelestialBody`; return list with `x`, `y`, and **danger radius** = `body.radius * DANGER_ZONE_MULTIPLIER` (use same constant as CollisionSystem: 2).
  - `segmentIntersectsCircle(ax, ay, bx, by, cx, cy, r): boolean`  
    True if segment A→B intersects (or lies inside) circle center (cx, cy) radius r. Handles segment entirely inside circle.
  - `getSafeWaypoint(fromX, fromY, toX, toY, bodies): { x: number; y: number } | null`  
    If segment from→to does not intersect any body’s danger circle, return `null` (use original target). Otherwise find the first blocking body along the segment (or closest to segment), compute a single bypass waypoint outside that body’s danger zone that goes “around” it toward the goal, and return `{ x, y }`. Callers use this as the effective target (player: pass to burn plan; AI: set as intent.moveToX/Y).

### 2. Bypass waypoint algorithm

- **Which body**: For each body whose danger circle intersects the segment, pick the one whose center is closest to the segment (or first intersection along the segment from `from`). Use that body only for this leg.
- **Bypass point**: Require point P outside danger circle such that:
  - P is on the “correct side” of the body (so path from ship to P doesn’t cross the body again).
  - Direction from ship to P is roughly toward the original goal (minimize detour).
- **Concrete approach**: Use the two tangent-from-point (ship) to circle (danger zone) and choose the tangent point that is closer to the goal `(toX, toY)`. If the ship is already inside the danger zone, return a point in the direction away from the body center (escape vector) at distance dangerRadius + margin.
- **Margin**: Add a small clearance (e.g. 10% of danger radius or fixed 50 km) so the waypoint is clearly outside the zone.

### 3. CommandHandler changes

- **issueMoveTo(targetX, targetY)**: Before computing the burn plan, get bodies from world. Call `getSafeWaypoint(shipPos.x, shipPos.y, targetX, targetY, bodies)`. If result is non-null, use result as `(targetX, targetY)` for the rest of the method (burn plan and NavigationOrder target). Otherwise use original target.
- **issueMoveToForShip(shipId, targetX, targetY)**: Same: get bodies, `getSafeWaypoint(pos.x, pos.y, targetX, targetY, bodies)`, substitute target if non-null. Ensures AI-issued moves (which already may have been adjusted by strategic) are still safe when called with a “raw” goal from older code paths, and keeps one code path for “issue move” logic.

CommandHandler needs access to `World` (it already has it). No new dependencies other than the avoidance helper.

### 4. AIStrategicSystem changes

- In `setEngage` and `setDisengage`, after computing the desired goal `(bestX, bestY)` or `(retreatX, retreatY)`, get bodies from world and call `getSafeWaypoint(pos.x, pos.y, goalX, goalY, bodies)`. If non-null, set `intent.moveToX/Y` to the returned waypoint; otherwise set to the goal. No other logic changes; re-evaluation on next strategic tick will issue the next leg toward the same (or updated) goal after arrival.

### 5. Constants and collision consistency

- Use the same danger zone multiplier as CollisionSystem (2× radius). Optionally export a constant from CollisionSystem (e.g. `DANGER_ZONE_MULTIPLIER`) and import it in PlanetAvoidance so the definition lives in one place.

## Files

| File | Change |
|------|--------|
| `src/game/PlanetAvoidance.ts` | **NEW** — getBodiesFromWorld, segmentIntersectsCircle, getSafeWaypoint |
| `src/engine/systems/CollisionSystem.ts` | Export DANGER_ZONE_MULTIPLIER (or constant in a shared place) if desired |
| `src/game/CommandHandler.ts` | issueMoveTo + issueMoveToForShip: get bodies, getSafeWaypoint, substitute target |
| `src/engine/systems/AIStrategicSystem.ts` | setEngage/setDisengage: get bodies, getSafeWaypoint, set moveToX/Y from result or goal |

## Testing

- **Unit tests** (`tests/game/PlanetAvoidance.test.ts` or under `tests/utils/`):
  - segmentIntersectsCircle: segment misses circle (false); segment crosses circle (true); segment entirely inside (true); segment from inside to outside (true); endpoint on circle boundary (true).
  - getSafeWaypoint: no bodies → null; path clear of one body → null; path blocked by one body → waypoint outside circle, roughly toward goal; two bodies, first blocks → waypoint around first.
- **Integration / manual**: Start demo scenario, order player ship through a planet: path should go around. Spawn enemy near a planet, engage: enemy should not fly into the planet.

## Error handling

- If body list is empty, getSafeWaypoint returns null (use original target).
- If tangent math fails (e.g. degenerate circle), fall back to a point along the escape direction at dangerRadius + margin.
