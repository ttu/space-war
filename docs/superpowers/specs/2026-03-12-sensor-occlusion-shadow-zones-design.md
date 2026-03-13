# Sensor Occlusion & Shadow Zone Visualization

**Date**: 2026-03-12
**Status**: Approved

## Problem

Celestial bodies (stars, planets, moons) are transparent to sensors. Ships behind a planet relative to a sensor ship are still detected. There is no way to visualize blind spots created by celestial bodies.

## Design Decisions

- **Full occlusion**: A celestial body completely blocks sensor line-of-sight — no partial/diffraction effects.
- **Occluding bodies**: Stars, planets, moons only (not stations or asteroids — too small to matter).
- **Per-ship shadow zones**: Visual overlay shows blind spots relative to selected ship(s), not a global shadow.
- **UI toggle**: Button in OrderBar + `V` keyboard shortcut.

## Section 1: Sensor Occlusion (Gameplay Logic)

**File**: `src/engine/systems/SensorSystem.ts`

Modify `getBestDetection()` to check line-of-sight before evaluating signal strength.

### Algorithm

For each sensor→target pair, before computing signal strength:

1. Gather all occluding bodies (entities with `CelestialBody` where `bodyType` is `'star'`, `'planet'`, or `'moon'`) — cached once per `update()` call.
2. For each occluding body, test if the body's circle (center + radius) intersects the line segment from sensor position to target position.
3. **Circle-line-segment intersection**: Compute the closest point on the segment to the body center. If the distance from that closest point to the body center is less than the body's radius, the line of sight is blocked.
4. If any body blocks the line → skip this sensor ship for this target (try next sensor).

### Performance

~10 bodies × ~20 sensor-target pairs = ~200 circle-line tests per tick. Negligible.

## Section 2: Shadow Zone Visualization

**File**: New `src/rendering/SensorOcclusionRenderer.ts`

A dedicated renderer (separate from `CelestialRenderer`) since shadow zones are per-ship state.

### What It Draws

For each selected ship, for each occluding body:

1. Compute two tangent lines from the ship position to the body's circle (using actual body radius).
2. Draw a filled wedge/triangle mesh from the body outward, between the two tangent lines.
3. Extend the wedge to a large distance (10× sensor max range — effectively infinite on screen).
4. **Style**: Semi-transparent dark fill (`0x000000` at ~15% opacity), subtle edge lines.

### Edge Cases

- Ship inside a body: Skip (shouldn't happen due to CollisionSystem).
- Ship very close to a body: Wedge becomes very wide — correct behavior (nearly half the sky is blocked).
- Multiple ships selected: Each ship gets its own wedge set. Overlapping translucent fills naturally darken.

### Visibility

- Only rendered when toggle is enabled AND at least one ship is selected.
- Hidden when toggle is off or no ships selected.

### Performance

~10 bodies × ~4 selected ships = ~40 wedge meshes max. Trivial for Three.js.

## Section 3: UI Toggle

### Button

Add a "Shadows" toggle button to `OrderBar`. Styled as a view toggle (distinct from command buttons).

### Keyboard

`V` key toggles shadow overlay on/off via `InputManager`.

### State Flow

1. `OrderBar` exposes `onShadowToggle: (enabled: boolean) => void` callback.
2. `InputManager` listens for `V` keypress, triggers the same toggle.
3. `SpaceWarGame` holds `shadowsEnabled: boolean` state, passes to `SensorOcclusionRenderer.update()`.
4. Renderer checks `enabled` flag + selected ship positions — hides all meshes if disabled or no selection.

### Visual Feedback

Button highlights with `active` class when enabled (same pattern as existing order buttons).

## Files Changed

| File | Change |
|------|--------|
| `src/engine/systems/SensorSystem.ts` | Add LOS check with circle-line-segment intersection |
| `src/rendering/SensorOcclusionRenderer.ts` | New — wedge mesh rendering for shadow zones |
| `src/ui/OrderBar.ts` | Add "Shadows" toggle button |
| `src/core/InputManager.ts` | Add `V` key binding |
| `src/game/SpaceWarGame.ts` | Wire toggle state, pass to renderer |
| `tests/engine/systems/SensorSystem.test.ts` | Tests for occlusion logic |
