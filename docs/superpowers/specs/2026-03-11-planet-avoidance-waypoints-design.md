# Planet Avoidance: Preserve Destination + Waypoint System

**Date**: 2026-03-11
**Status**: Approved

## Summary

Ships keep the **original destination** when going around planets. A waypoint is used only as the current leg target; when the ship reaches a waypoint, the next leg target becomes the destination (or a new waypoint if the path is still blocked). Destination is stored explicitly and never overwritten by avoidance.

**Strategy**: Store-only final destination, recompute next waypoint when path is blocked (each tick) and when arriving at a waypoint (set current target = destination; next tick may set target to a new waypoint).

## Scope

- **NavigationOrder**: add immutable `destinationX`, `destinationY`; keep `targetX`, `targetY` as current leg (waypoint or destination).
- **CommandHandler**: when issuing move, set destination = clicked/requested point; set target = waypoint or destination.
- **NavigationSystem**: in-flight correction uses destination (not current target) for waypoint computation; on arrival at waypoint, set target = destination; on arrival at destination, remove order.
- **UI / AI**: consume destination for display; AI continues to pass goal to `issueMoveToForShip` (destination = that goal).

## Design

### 1. Data model

- **NavigationOrder** (in `src/engine/components/index.ts`):
  - Add `destinationX: number`, `destinationY: number` (km). Immutable for the life of the order.
  - Keep `targetX`, `targetY` as the current leg endpoint (either a bypass waypoint or the destination).
  - Semantics: ship is always “going to” `(destinationX, destinationY)`; `(targetX, targetY)` is where it is heading this leg.

### 2. Issuing a move order

- **CommandHandler.issueMoveTo(targetX, targetY)** and **issueMoveToForShip(shipId, targetX, targetY)**:
  - Set `destinationX = targetX`, `destinationY = targetY` (the requested goal).
  - Get bodies; call `getSafeWaypoint(pos.x, pos.y, destinationX, destinationY, bodies)`.
  - If result is non-null, set `targetX, targetY` to the waypoint; else set `targetX = destinationX`, `targetY = destinationY`.
  - Compute burn plan to `(targetX, targetY)`. Add NavigationOrder with `destinationX/Y`, `targetX/Y`, and existing fields.

### 3. NavigationSystem (per tick)

- **In-flight correction** (existing caution-radius and segment-interior checks):
  - When correction is needed, set `(targetX, targetY) = getSafeWaypoint(pos.x, pos.y, nav.destinationX, nav.destinationY, bodies)`.
  - If waypoint is non-null, update `nav.targetX`, `nav.targetY` and recompute `burnPlan` to the new target. Do **not** change `destinationX` or `destinationY`.

- **Arrival**:
  - When close to target and slow enough:
    - If current target equals destination (within small tolerance): remove `NavigationOrder` (trip complete).
    - Else (arrived at a waypoint): set `nav.targetX = nav.destinationX`, `nav.targetY = nav.destinationY`. Do not remove the order. Next tick, correction logic may set target to a new waypoint if the segment to destination still crosses a body.

### 4. Equality for “arrived at destination”

- Treat target as destination if `|targetX - destinationX|` and `|targetY - destinationY|` are both below a small epsilon (e.g. 1 km) to avoid floating-point issues.

### 5. Backward compatibility

- Existing code that creates `NavigationOrder` without `destinationX/Y`: at read sites, treat missing destination as target (e.g. `destinationX = nav.destinationX ?? nav.targetX`). When **creating** orders, always set destination (CommandHandler and any direct addComponent of NavigationOrder). Optional: when adding the component, require destination and set it in all current call sites so no reader needs fallback.

### 6. Call sites

| Location | Change |
|----------|--------|
| `src/engine/components/index.ts` | Add `destinationX`, `destinationY` to `NavigationOrder` interface. |
| `src/game/CommandHandler.ts` | In `issueMoveTo` and `issueMoveToForShip`: set destination = requested point; target = waypoint or destination; pass both in NavigationOrder. |
| `src/engine/systems/NavigationSystem.ts` | Use `nav.destinationX/Y` in getSafeWaypoint for correction; on arrival, if target ≠ destination set target = destination else remove order. |
| `src/rendering/TrailRenderer.ts` | Use `destinationX/Y` for “moving to” marker (so player sees final goal). |
| `src/ui/ShipDetailPanel.ts` | Show destination (and optionally “via waypoint” when target ≠ destination). |
| `src/engine/systems/AIStrategicSystem.ts` | No change: still passes goal to tactical; tactical calls `issueMoveToForShip(shipId, goalX, goalY)` — that goal becomes destination. |

### 7. PlanetAvoidance

- No API change. Continue to use `getSafeWaypoint(fromX, fromY, toX, toY, bodies)` with `to` = destination when computing the next waypoint.

## Testing

- **Unit tests** (`tests/game/PlanetAvoidance.test.ts` or NavigationSystem):
  - When path to destination is blocked, getSafeWaypoint(pos, dest, bodies) returns waypoint; target is set to waypoint, destination unchanged.
  - Arrival: when target equals destination, order is removed; when target was waypoint, target is set to destination and order remains.
- **Manual / E2E**: Move order behind a planet; ship goes around and stops at the clicked position. Multiple planets: ship proceeds via waypoints to final destination.

## Error handling

- If `getSafeWaypoint` returns null (e.g. no bodies, or path clear), target remains destination.
- If ship is inside caution radius, existing escape waypoint logic still uses destination as goal for getSafeWaypoint.
