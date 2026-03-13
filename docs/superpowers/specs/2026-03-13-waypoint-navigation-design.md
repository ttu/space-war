# Waypoint Navigation System

## Summary

Add a waypoint queue to ship navigation. Players can build multi-leg routes using shift+right-click, drag waypoints to reposition them, and delete waypoints with hover+Delete key. Selected ships show full interactive waypoint markers; unselected ships show a subtle dotted path.

## Data Model

Add `waypoints` array to `NavigationOrder`:

```typescript
export interface NavigationOrder extends Component {
  type: 'NavigationOrder';
  destinationX: number;  // Current leg destination
  destinationY: number;
  targetX: number;       // Current target (may differ due to planet avoidance)
  targetY: number;
  waypoints: { x: number; y: number }[];  // Queue of future legs after current destination
  phase: NavPhase;
  burnPlan: BurnPlan;
  phaseStartTime: number;
  arrivalThreshold: number;
}
```

## Input Behavior

| Action | Effect |
|--------|--------|
| Right-click | Clear all waypoints, set new single destination (current behavior) |
| Shift+right-click | Append new point to end of waypoints queue |
| Hover waypoint + Delete key | Remove that waypoint from the queue |
| Left-click drag on waypoint marker | Move waypoint to new position |

## Navigation Logic (NavigationSystem)

On arrival at current `destinationX/Y`:
- If `waypoints.length > 0`: shift first waypoint, set as new `destinationX/Y`, recompute burn plan
- If empty: arrive and remove NavigationOrder (unchanged behavior)

## CommandHandler Changes

- `issueMoveTo(x, y)` — replaces entire route (clears waypoints, sets new destination). Current behavior preserved.
- `issueMoveTo(x, y, append: true)` — if ship has no NavigationOrder, creates one with destination. If ship already has a NavigationOrder, appends `{x, y}` to end of `waypoints` array.
- Same pattern for `issueMoveToForShip` (AI usage unaffected — AI never appends waypoints).

## InputManager Changes

Add `shiftKey` to `rightClick` event type:
```typescript
{ type: 'rightClick'; screenX: number; screenY: number; shiftKey: boolean }
```

## Rendering (TrailRenderer)

**Selected ships:**
- Full waypoint markers (diamond+crosshair, matching existing destination marker style) at each waypoint position
- Numbered labels (1, 2, 3...) next to each waypoint marker
- Connecting lines between destination and waypoints

**Unselected ships:**
- Subtle dotted line through all waypoints (no interactive markers)

**Trajectory projection:**
- Multi-leg projection: simulate PN guidance through current destination, then each waypoint in sequence to final destination

## Waypoint Interaction (SpaceWarGame)

**Drag:**
- On left mousedown, check if cursor is near a waypoint marker of a selected player ship (pick radius: `zoom * 0.04`)
- If hit: enter drag mode. Track which ship + waypoint index is being dragged.
- On mousemove during drag: update waypoint position in the NavigationOrder
- On mouseup: commit (waypoint stays at new position). If dragging the destination (index -1), update destinationX/Y and recompute burn plan.
- Drag suppresses normal click/box-select behavior (same pattern as existing left-drag for box select)

**Delete:**
- Track cursor position each mousemove. On Delete/Backspace keypress, find nearest waypoint marker within pick radius for any selected player ship.
- Remove that waypoint from the array. Subsequent waypoints shift down.
- If the destination itself is deleted, pop the next waypoint as the new destination (or remove NavigationOrder if no waypoints remain).

## Files Modified

1. `src/engine/components/index.ts` — add `waypoints` to NavigationOrder
2. `src/game/CommandHandler.ts` — `issueMoveTo` / `issueMoveToForShip` get `append` param
3. `src/engine/systems/NavigationSystem.ts` — waypoint advancement on arrival
4. `src/core/InputManager.ts` — pass `shiftKey` on rightClick events
5. `src/game/SpaceWarGame.ts` — wire shift+right-click, waypoint drag/delete interaction
6. `src/rendering/TrailRenderer.ts` — waypoint markers, multi-leg projection, connecting lines, numbered labels
