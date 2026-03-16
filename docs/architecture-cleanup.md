# Architecture Cleanup TODO

Identified 2026-03-15. Goal: clean separation of engine/game/rendering/UI layers.

## 1. Move pure math utilities to engine/utils/ ✅

- [x] Move `src/game/TrajectoryCalculator.ts` → `src/engine/utils/TrajectoryCalculator.ts`
- [x] Move `src/game/PlanetAvoidance.ts` → `src/engine/utils/PlanetAvoidance.ts`
- [x] Move `src/game/FiringComputer.ts` → `src/engine/utils/FiringComputer.ts`
- [x] Update all import paths (NavigationSystem, AIStrategicSystem, AITacticalSystem, CommandHandler, ShipDetailPanel, ActiveMissilesPanel)
- [x] Run build + tests to verify

## 2. Extract PlayerInteractionHandler from SpaceWarGame ✅

- [x] Create `src/game/PlayerInteractionHandler.ts`
- [x] Move `handleRightClick` logic (SpaceWarGame lines 579-676)
- [x] Move `tryStartWaypointDrag` / `handleWaypointDragEnd` logic (lines 720-785)
- [x] Move `handleDeleteWaypoint` logic (lines 686-717) — currently bypasses CommandHandler
- [x] Route waypoint mutations through CommandHandler instead of direct component mutation
- [x] Run build + tests to verify

## 3. Decouple AITacticalSystem from CommandHandler ✅

- [x] Define AI command event types (e.g. `AIMoveOrder`, `AIFireWeapon`) in `engine/types.ts`
- [x] AITacticalSystem emits command events via EventBus instead of calling CommandHandler directly
- [x] CommandHandler subscribes to AI command events and executes them
- [x] Remove `CommandHandler` import from AITacticalSystem
- [x] Run build + tests to verify

## 4. Fix DamageSystem event handling ✅

- [x] Replace `getHistory()` polling with `eventBus.subscribe('RailgunHit', ...)` and `subscribe('MissileImpact', ...)`
- [x] Remove `lastProcessedIndex` tracking
- [x] Verify no unbounded history growth issue remains
- [x] Run build + tests to verify

## 5. Extract CameraAnimator from SpaceWarGame

- [ ] Create `src/core/CameraAnimator.ts`
- [ ] Move camera focus animation state machine (SpaceWarGame lines 932-991)
- [ ] Move related state: `focusTarget`, `focusStartPos`, `focusStartZoom`, `focusProgress` (lines 112-127)
- [ ] SpaceWarGame delegates to CameraAnimator
- [ ] Run build + tests to verify

## 6. Fix cross-layer constants

- [ ] Move `DANGER_ZONE_MULTIPLIER` from CollisionSystem to `src/engine/constants.ts` or onto `CelestialBody` component
- [ ] Update imports in CollisionSystem and CelestialRenderer
- [ ] Run build + tests to verify

## 7. Pre-compute hit probabilities

- [ ] Add hit probability data to missile entities or contact components
- [ ] Compute in a system (MissileSystem or a new HitProbabilitySystem) rather than in UI panels
- [ ] ShipDetailPanel and ActiveMissilesPanel read pre-computed data instead of importing FiringComputer
- [ ] Run build + tests to verify

## 8. Make TimeControls event-driven

- [ ] TimeControls subscribes to EventBus for `RailgunFired` (targeting readout display)
- [ ] Remove SpaceWarGame's `RailgunFired` subscription that manipulates TimeControls DOM
- [ ] Emit `GamePaused`/`GameResumed`/`SpeedChanged` events from SpaceWarGame when state changes
- [ ] TimeControls reacts to those events instead of polling via `update()`
- [ ] Run build + tests to verify

## 9. Cleanup dead code

- [ ] Remove `Orders` / `OrderType` from `engine/components/index.ts` (replaced by `NavigationOrder`)
- [ ] Remove unused event types (`GamePaused`, `GameResumed`, `SpeedChanged`) if not wired up in #8
- [ ] Deduplicate missile entity creation in CommandHandler (`launchMissile` vs `launchMissileFromShip`)
- [ ] Evaluate moving `Selectable` component out of engine (UI-only concern)
- [ ] Run build + tests to verify

## 10. Handle victory/defeat events

- [ ] Add subscriber for `VictoryAchieved` / `DefeatSuffered` events
- [ ] Implement appropriate game response (pause, show modal, etc.)
- [ ] Run build + tests to verify
