# Space War - Tactical Space Combat Game

## Context

Building a real-time tactical strategy game inspired by realistic space combat (The Expanse, Lost Fleet, Project Rho). The player commands a fleet from a tactical radar map view, dealing with Newtonian physics, light-speed sensor delay, and long-range missile/railgun combat. The game should feel like being in a CIC (Combat Information Center).

Patterns, architecture, and tech stack reused from: https://github.com/ttu/skirmish (turn-based tactical game, TypeScript/Three.js/Vite/ECS).

## Key Design Decisions

- **Role**: Fleet commander with a flagship. Single ship to 20+ ship fleets.
- **Physics**: Simplified Newtonian (inertia, no drag) with computer-assisted burn planning. Planets with gravity wells.
- **Weapons**: Missiles (travel time, interceptable), PDCs (short-range, anti-missile), Railguns (fast, hard to hit).
- **Detection**: Full fog of war with light-speed delay. Ships show at last-known positions. Go dark mechanic.
- **Ships**: Modular with class-based defaults (Corvette through Battleship + Carrier). Location-based damage.
- **Structure**: Skirmish/scenario-based, campaign-ready architecture.
- **AI**: Strategic (fleet objectives) + Tactical (per-ship decisions) with personalities.
- **Controls**: Hybrid - right-click for common actions, order panel for special commands. Pause to issue complex orders.

## Implementation Plan

### Phase 1: Core Engine & Physics
**Goal**: Ships moving on screen with Newtonian physics and gravity.

**Files to create:**
- `src/main.ts` - Entry point, creates game instance
- `src/core/GameLoop.ts` - Fixed timestep simulation + render interpolation
- `src/core/Camera.ts` - Orthographic pan/zoom (adapt from skirmish `src/core/Camera.ts`)
- `src/core/InputManager.ts` - Mouse/keyboard handling (adapt from skirmish `src/core/InputManager.ts`)
- `src/engine/ecs/World.ts` - ECS entity-component store (reuse from skirmish `src/engine/ecs/World.ts`)
- `src/engine/core/EventBus.ts` - Typed pub-sub (reuse from skirmish `src/engine/core/EventBus.ts`)
- `src/engine/core/GameTime.ts` - Pause, time scaling (1x/2x/4x)
- `src/engine/components/index.ts` - Components: Position, Velocity, Ship, Thruster
- `src/engine/systems/PhysicsSystem.ts` - Apply thrust, update velocity, update position, apply gravity
- `src/utils/OrbitalMechanics.ts` - Gravity force calculation
- `src/rendering/RadarRenderer.ts` - Grid, scale indicator, dark background
- `src/rendering/ShipRenderer.ts` - Ship icons (tactical symbols), selection rings
- `src/rendering/CelestialRenderer.ts` - Planet circles, gravity well rings
- `src/game/SpaceWarGame.ts` - Main orchestrator, wires everything together

**Verification**: Ships appear on radar map, drift with velocity, get pulled by planet gravity. Pan/zoom works. Pause stops simulation.

### Phase 2: Navigation & Trajectory
**Goal**: Player can order ships to move, computer calculates burns.

**Files to create:**
- `src/engine/systems/NavigationSystem.ts` - Execute burn plans, handle rotation
- `src/game/TrajectoryCalculator.ts` - Compute burn/flip/decelerate plans, intercept courses, orbit insertion
- `src/game/CommandHandler.ts` - Player clicks → ship orders
- `src/rendering/TrailRenderer.ts` - Ship trails (fading past path) and projected future paths (dotted)

**Components to add**: NavigationOrder, RotationState

**Verification**: Right-click to set destination, ship rotates and burns, flips at midpoint, decelerates to stop. Trajectory shown on radar. Gravity curves projected paths.

### Phase 3: Sensors & Fog of War
**Goal**: Enemy ships only visible when detected, with light-speed delay.

**Files to create:**
- `src/engine/systems/SensorSystem.ts` - Detection based on thermal signature vs distance, light-speed delay on position data
- `src/engine/components/sensor-components.ts` - SensorArray, ThermalSignature, DetectedContact (with data age)

**Verification**: Enemy ships appear/disappear based on signature. Position data shows age. Going dark (cutting thrust) reduces signature. Ships show at delayed positions.

### Phase 4: Weapons - Missiles
**Goal**: Ships can launch missile salvos that fly to targets.

**Files to create:**
- `src/engine/systems/MissileSystem.ts` - Missile flight, guidance, fuel consumption, gravity effects
- `src/engine/components/weapon-components.ts` - MissileLauncher, Missile, Ammo
- `src/rendering/MissileRenderer.ts` - Missile dots with trails, salvo grouping

**Verification**: Select ship, target enemy, launch missile salvo. Missiles fly toward predicted intercept point, affected by gravity. Missiles run out of fuel if target too far.

### Phase 5: Weapons - PDC & Railguns
**Goal**: Complete weapons triangle.

**Files to create:**
- `src/engine/systems/PDCSystem.ts` - Auto-target incoming missiles, close-range ship damage
- `src/engine/systems/RailgunSystem.ts` - Firing solution calculation, projectile travel, hit probability
- `src/game/FiringComputer.ts` - Hit probability estimation, lead targeting, solution quality display

**Components to add**: PDC, Railgun, Projectile

**Verification**: PDCs auto-shoot incoming missiles. Railgun shows hit probability, fires at predicted position. Missiles can be shot down. All three weapon types interact correctly.

### Phase 6: Damage & Ship Systems
**Goal**: Hits cause meaningful system damage.

**Files to create:**
- `src/engine/systems/DamageSystem.ts` - Hit resolution, location-based damage (hull, reactor, engines, sensors, weapons)

**Components to add**: ShipSystems (hull, reactor, engines, sensors, individual weapons with health)

**Verification**: Hits damage specific systems. Damaged engines reduce thrust. Damaged sensors reduce detection. Destroyed weapons stop firing. Ship destroyed when hull reaches zero.

### Phase 7: Ships & Loadouts
**Goal**: Multiple ship classes with module customization.

**Files to create:**
- `src/engine/data/ShipTemplates.ts` - Hull classes (Corvette→Carrier) with stats and default loadouts
- `src/engine/data/ModuleTemplates.ts` - All module definitions
- `src/engine/data/ScenarioLoader.ts` - JSON scenario → ECS entities
- `src/ui/ShipConfigScreen.ts` - Pre-battle loadout editor

**Verification**: Load scenario with different ship classes. Ships behave according to their stats. Player can swap modules before battle.

### Phase 8: AI
**Goal**: Enemy fleet makes tactical decisions.

**Files to create:**
- `src/engine/systems/AIStrategicSystem.ts` - Fleet-level goals, formation, engage/disengage decisions
- `src/engine/systems/AITacticalSystem.ts` - Per-ship: when to fire, thrust decisions, PDC management, go dark

**Verification**: AI fleet maneuvers toward objectives, launches missiles at appropriate range, uses PDCs defensively, retreats damaged ships.

### Phase 9: UI Panels
**Goal**: Full tactical interface.

**Files to create:**
- `src/ui/FleetPanel.ts` - Ship roster with status bars
- `src/ui/ShipDetailPanel.ts` - Selected ship systems, weapons, orders
- `src/ui/OrderBar.ts` - Context-sensitive command buttons
- `src/ui/TimeControls.ts` - Pause/speed buttons, game clock
- `src/ui/CombatLog.ts` - Scrollable event log
- `src/game/SelectionManager.ts` - Click/shift-click/box select ships

**Verification**: All panels display correct info. Orders can be issued from UI. Multi-select works. Combat log shows events.

### Phase 10: Scenarios & Victory
**Goal**: Playable scenarios with objectives.

**Files to create:**
- `src/engine/systems/VictorySystem.ts` - Win/loss condition checking
- `scenarios/tutorial.json` - 1v1 ship combat tutorial
- `scenarios/patrol.json` - Small fleet vs pirates near asteroid belt
- `scenarios/fleet-action.json` - Matched fleets in open space
- `scenarios/ambush.json` - Enemy hiding dark near planet

**Verification**: Each scenario loads and plays to completion. Victory/defeat triggers correctly.

## Tech Stack
- TypeScript (strict mode)
- Three.js (orthographic camera, top-down 2D view)
- Vite (build tool)
- Vitest (testing)

## Key Patterns to Reuse from Skirmish
- `World.ts` - ECS entity-component store
- `EventBus.ts` - Typed pub-sub event system
- `Camera.ts` - Orthographic pan/zoom
- `InputManager.ts` - Keyboard/mouse handling
- Unit template / factory pattern for ship creation
- Scenario JSON loading pattern
- Post-processing pipeline structure (bloom for engine glow, weapon fire)

## Verification Plan
1. Each phase has specific verification criteria listed above
2. Write unit tests for physics, navigation math, damage calculation, sensor detection
3. Visual verification: ships move correctly, missiles fly, PDCs intercept, fog of war works
4. Playtest each scenario end-to-end after Phase 10
