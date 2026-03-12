# Camera Lock to Reference Object — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional camera lock to a selected entity (ship or celestial) so the camera stays centered on it; lock is changeable mid-game and clear when the entity is destroyed.

**Architecture:** SpaceWarGame holds `referenceEntityId: EntityId | null`. Each render frame, if set and the entity exists and has Position, set camera position to that entity's position; when locked, ignore pan (WASD/drag). Focus animation clears the lock. UI: "Lock camera here" in ship detail (ship or celestial); lock status + "Free camera" in time controls.

**Tech Stack:** TypeScript, existing ECS (World, Position, COMPONENT), CameraController, TimeControls, ShipDetailPanel.

---

## File map

| File | Role |
|------|------|
| `src/game/SpaceWarGame.ts` | Add `referenceEntityId`, apply camera follow in `render()`, ignore pan when locked, clear lock when entity missing or on focus start; wire lock callbacks to UI. |
| `src/ui/TimeControls.ts` | Optional lock state (getter) + onClearLock callback; show "Camera: [name]" and "Free" button when locked. |
| `src/ui/ShipDetailPanel.ts` | Optional onLockCamera(entityId) callback; show "Lock camera here" when a ship or celestial is selected. |
| `docs/superpowers/specs/2026-03-12-camera-lock-reference-design.md` | Already written. |

---

## Chunk 1: Core lock state and camera follow

### Task 1: Reference state and camera follow in SpaceWarGame

**Files:**
- Modify: `src/game/SpaceWarGame.ts`

- [ ] **Step 1: Add reference lock state and apply camera follow**

In `SpaceWarGame`:
- Add private `referenceEntityId: EntityId | null = null`.
- Add `setCameraLock(entityId: EntityId | null): void` that sets `this.referenceEntityId = entityId`.
- Add `getCameraLock(): { entityId: EntityId; displayName: string } | null`: if `referenceEntityId` is null, return null; else get entity's Position (if missing return null and clear `referenceEntityId`); get display name from Ship.name or CelestialBody.name; return `{ entityId, displayName }` or null.
- In `render()`, after `updateCameraFocusAnimation()` and before using `camPos`: if `referenceEntityId != null`, get position via `world.getComponent(entityId, COMPONENT.Position)`. If missing, set `referenceEntityId = null`. Else call `camera.setPosition(pos.x, pos.y)`.
- When applying camera keyboard pan (`getCameraMovement()` and `camera.pan`): only call `camera.pan(...)` when `referenceEntityId == null` (so when locked, ignore pan).
- When applying camera drag (`cameraPanDrag` in `setupInput`): only pan when `referenceEntityId == null` (e.g. guard at start of the drag handler or have a getter `isCameraLocked()` and skip pan if true).
- In `startCameraFocusAnimation`: set `this.referenceEntityId = null` so focus clears the lock.

**Code references:**
- Position component: `COMPONENT.Position`, `Position.x`, `Position.y`.
- Ship name: `world.getComponent(id, COMPONENT.Ship)?.name`.
- Celestial name: `world.getComponent(id, COMPONENT.CelestialBody)?.name`.
- Use `COMPONENT` from `../engine/components`.

- [ ] **Step 2: Run build and tests**

```bash
cd /Users/ttu/src/github/space-war && npm run build && npm test
```

Expected: build passes, tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/game/SpaceWarGame.ts
git commit -m "feat: add camera lock state and follow reference entity each frame"
```

---

## Chunk 2: UI for lock and clear

### Task 2: TimeControls — lock indicator and Free camera

**Files:**
- Modify: `src/ui/TimeControls.ts`

- [ ] **Step 1: Extend TimeControls for lock state**

- Add to `TimeControlsCallbacks`: optional `getCameraLock?: () => { entityId: EntityId; displayName: string } | null` and `onClearCameraLock?: () => void`. Import `EntityId` from `../engine/types` in TimeControls.
- In the constructor, after the Loadout button (or before it), add a container for lock UI (e.g. `lockWrap`) that is initially empty/hidden.
- In `update()`: call `getCameraLock?.()`. If non-null, ensure lock UI exists: a span "Camera: {displayName}" and a button "Free". Wire button to `onClearCameraLock?.()`. If null, remove or hide the lock UI.
- Use a class like `camera-lock-wrap` and `camera-lock-free` for the button so CSS can style it. Keep the DOM minimal (one line: "Camera: X" + button).

- [ ] **Step 2: Wire SpaceWarGame to TimeControls**

In `SpaceWarGame.setupUI()`, where `TimeControls` is constructed, pass:
- `getCameraLock: () => this.getCameraLock()`
- `onClearCameraLock: () => this.setCameraLock(null)`

Ensure `getCameraLock()` and `setCameraLock()` are implemented from Task 1 (and that `getCameraLock` clears `referenceEntityId` when entity is missing, so the UI updates).

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/TimeControls.ts src/game/SpaceWarGame.ts
git commit -m "feat: show camera lock indicator and Free camera in time controls"
```

### Task 3: ShipDetailPanel — Lock camera here

**Files:**
- Modify: `src/ui/ShipDetailPanel.ts`
- Modify: `src/game/SpaceWarGame.ts`

- [ ] **Step 1: Add Lock camera button to ShipDetailPanel**

- Add to constructor (or optional callback): `onLockCamera?: (entityId: EntityId) => void`.
- In `update()`, when rendering a **ship** detail (`renderShipDetail`) or **celestial** detail (`renderCelestialDetail`): after the name line (or at end of content for that entity), if `onLockCamera` is provided, add a button "Lock camera here" that calls `onLockCamera(id)` with the current entity id (ship or celestial). Use a single button per selection; if multiple ships are selected, only show for the first or for each (design: show for first selected ship, or for the single selected celestial). Prefer: show one "Lock camera here" when there is exactly one selected ship or one selected celestial.
- In `renderCelestialDetail`, add the same button after the orbital info (or after name) that calls `onLockCamera(entityId)`.
- In `renderShipDetail`, for the first ship in the list (or each ship), add "Lock camera here" that calls `onLockCamera(id)`. To avoid duplicate buttons when multiple ships selected, add the button once after the first ship's block (e.g. after first `addSeparator`) or in the header area when selection is single. Simplest: add inside `renderShipDetail` after the name line, and in `renderCelestialDetail` after the name line; when multiple ships are selected we'll show one button per ship (each locks to that ship). Alternatively: only show "Lock camera here" when `ids.length === 1` (single ship) or when celestial is selected. Choose single-selection only for clarity: if `ids.length === 1` and not celestial, show for that ship; if celestial, show for celestial.

- [ ] **Step 2: Wire SpaceWarGame to ShipDetailPanel**

In `SpaceWarGame` where `ShipDetailPanel` is constructed, pass `onLockCamera: (entityId) => this.setCameraLock(entityId)`.

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/ShipDetailPanel.ts src/game/SpaceWarGame.ts
git commit -m "feat: add Lock camera here in ship/celestial detail panel"
```

---

## Chunk 3: Polish and docs

### Task 4: Info overlay and docs

**Files:**
- Modify: `src/game/SpaceWarGame.ts` (info overlay text, if present)
- Modify: `docs/architecture.md` or `docs/game-guide.md` (short note on camera lock)

- [ ] **Step 1: Update info overlay**

If there is an info overlay (e.g. "WASD: Pan | ..."), add a short note like "Lock: select ship/planet → Lock camera here; Free in time bar."

- [ ] **Step 2: Document camera lock**

In `docs/game-guide.md` (or architecture) add one sentence or bullet: camera can be locked to a ship or celestial from the detail panel; use "Free camera" in the time bar to clear.

- [ ] **Step 3: Run build and tests**

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/game/SpaceWarGame.ts docs/
git commit -m "docs: mention camera lock in overlay and game guide"
```

---

## Verification

- Manual: Load demo scenario, select Terra, click "Lock camera here" → Terra stays centered as time runs. Select a ship, Lock camera here → ship stays centered. Click "Free" → pan works again. Lock to a ship, destroy it (e.g. with enemy fire) → lock clears.
- E2E: Optional — add a small e2e step that sets lock and asserts camera position near target after a tick (if e2e supports it).

Plan complete. Execute in order; each task’s commit is a checkpoint.
