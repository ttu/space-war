# Multi-Waypoint Planet Avoidance

**Date**: 2026-03-15
**Status**: Approved

## Problem

`getSafeWaypoint` generates only one waypoint around the nearest blocking body. When the destination is on the other side of a planet:

1. The tangent waypoint doesn't clear the planet fully (segment from waypoint to destination still clips the same planet's avoidance radius)
2. In-flight correction detects this every tick and re-routes, causing oscillating/erratic paths
3. Multiple planets in the path are only discovered one at a time mid-flight, causing jarring stop-and-redirect cycles

## Solution: Recursive Segment Splitting

Replace single-waypoint generation with recursive multi-waypoint planning that pre-computes a clear path around all blocking bodies at order time.

### Algorithm

```
getSafeWaypoints(from, to, bodies, depth=0):
  if depth > 8: return []  // safety cap
  find closest blocking body on segment from→to
  if none: return []  // path is clear

  compute waypoint W around the blocking body (tangent + BYPASS_MARGIN)
  before = getSafeWaypoints(from, W, bodies, depth+1)
  after  = getSafeWaypoints(W, to, bodies, depth+1)
  return [...before, W, ...after]
```

### Files Changed

**PlanetAvoidance.ts**
- Add `getSafeWaypoints()` function with recursive segment splitting
- Existing `getSafeWaypoint()` kept for in-flight correction (single-waypoint safety net)

**CommandHandler.ts**
- `issueMoveTo` and `issueMoveToForShip` use `getSafeWaypoints()`:
  - First waypoint becomes `targetX/Y`
  - Remaining waypoints go into `nav.waypoints[]`
  - `destinationX/Y` stays as the final click target

**NavigationSystem.ts**
- Modify avoidance-waypoint arrival branch: when arriving at an avoidance waypoint (`!atDestination`), check `waypoints.length > 0` and shift next waypoint as new `targetX/Y` before falling back to destination
- Ships fly through intermediate waypoints at speed (no stop)

### What Stays the Same

- In-flight correction uses single `getSafeWaypoint` as safety net for moving planets
- Fly-through behavior at intermediate waypoints (distance-only arrival, no speed check)
- Turn-factor speed blending at waypoints
- Tangent point math and BYPASS_MARGIN scaling
- All existing tests pass unchanged
