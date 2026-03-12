# Camera Lock to Reference Object — Design

**Date:** 2026-03-12

## Goal

Allow the player to lock the camera to a specific object (e.g. Earth) so the game treats that object as the visual center: the camera follows its position every frame and everything else appears to move around it. No view rotation — map orientation stays fixed. The lock is changeable mid-game (switch to another object or clear the lock).

## Requirements

- **Position lock only:** Camera center = reference entity position each frame when lock is active.
- **Changeable mid-game:** User can set lock to a celestial or ship, or clear lock (free camera).
- **No simulation change:** Physics and positions remain in the existing inertial world frame; only the camera follows the reference.
- **Pan/zoom still work:** When locked, camera position is driven by the reference each frame; user can still zoom. Pan (WASD/drag) can either be disabled while locked or applied as an offset; design choice below.

## Scope

- **In scope:** Reference-entity selection, camera follow each frame, UI to set/clear lock (and optionally choose target).
- **Out of scope:** View rotation (body-fixed “up”), changing simulation reference frame, persistence of lock across scenario reload.

## Approach: Follow Position Only

1. **Reference entity id:** Game (or a small dedicated module) holds an optional `referenceEntityId: EntityId | null`. When non-null and the entity exists and has a Position, the camera center is set to that position every frame (after systems run, before or during render).
2. **Who drives the camera:** `SpaceWarGame` already has access to the camera and the world; each frame in `render()` it can read the reference entity’s position and call `camera.setPosition(x, y)` when lock is active. No need for a separate “reference frame” transform; the camera is the view.
3. **Pan/zoom while locked:** Pan (WASD/drag) is **ignored** while a reference is locked so the object stays centered. Zoom remains allowed. If we later want “offset from reference,” we can add a small pan-offset state.
4. **Selection of reference:** User must be able to:
   - Lock to a celestial: e.g. from ship detail panel “Selected celestial” or a new “Lock camera to this” on celestials.
   - Lock to a ship: e.g. “Lock camera” in fleet panel or ship detail (same as focus but persistent).
   - Clear lock: e.g. “Free camera” or “Clear lock” control.

## UI

- **Set lock:** When the user has selected a celestial (existing “selected celestial” in ship detail) or a ship, a control “Lock camera here” (or “Center on [name]”) sets `referenceEntityId` to that entity.
- **Clear lock:** A visible indicator when lock is active (e.g. “Camera: Earth” in time controls or a small pill) with a “Free camera” / “Clear” action that sets `referenceEntityId = null`.
- **Change lock:** Selecting another ship/celestial and choosing “Lock camera here” switches the reference; no need to clear first.

## Edge Cases

- **Reference entity destroyed (e.g. ship):** When the locked entity is removed from the world, clear the lock and revert to free camera (optionally snap camera to last known position to avoid jump).
- **Reference entity not found:** If entity no longer exists at tick start, clear lock.
- **Focus animation:** When “focus on ship/contact” runs, it animates the camera. If lock is active, either (a) clear lock when starting a focus animation, or (b) ignore focus animation while locked. (a) is simpler: focus implies “go here,” so clear lock and animate.

## Files to Touch

- **`src/game/SpaceWarGame.ts`:** Hold `referenceEntityId`, in `render()` set camera position from reference when set; ignore pan when locked; clear reference when entity missing; wire UI to set/clear.
- **`src/ui/TimeControls.ts` or similar:** Show lock status and “Free camera” when locked. Alternatively a small control in ship detail / fleet panel for “Lock camera here” and a shared “Camera: X” + “Free” in a top bar or time controls.
- **`src/ui/ShipDetailPanel.ts`:** “Lock camera here” for selected ship and for selected celestial (if present).

No new engine types or ECS components; this is a view/camera and UI feature only.

## Testing

- **Unit:** Optional small helper “get reference position from world” with mock world (entity present / missing).
- **Manual / E2E:** Load scenario, lock camera to a planet, advance time — planet stays centered; lock to ship, ship stays centered; clear lock, pan works again; lock to ship, destroy ship — lock clears.

## Summary

Single optional `referenceEntityId` in the game orchestrator; each frame when set and entity exists, set camera position to that entity’s position and ignore pan; when entity is gone, clear lock. UI to set lock (from selection: ship or celestial), show lock state, and clear. No rotation, no simulation change.
