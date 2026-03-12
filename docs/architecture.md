# Architecture

Technical architecture of the Space War game engine.

## Tech Stack

- **TypeScript** with strict typing
- **Three.js** for rendering (orthographic top-down 2D)
- **Vite** for bundling and dev server
- **Vitest** for unit tests
- **Playwright** for e2e tests

## ECS (Entity-Component-System)

The game uses an Entity-Component-System architecture where:

- **Entities** are simple IDs (`e_0`, `e_1`, ...)
- **Components** are plain data objects attached to entities
- **Systems** contain all logic, operating on entities with specific component combinations

### World (`src/engine/ecs/World.ts`)

Central entity-component store. Key operations:

```typescript
world.createEntity()                    // Returns EntityId
world.addComponent(entityId, type, data)
world.getComponent<T>(entityId, type)
world.hasComponent(entityId, type)
world.query(type1, type2, ...)          // Returns entities with ALL listed components
world.removeEntity(entityId)
```

### Components (`src/engine/components/`)

All component type constants are defined in the `COMPONENT` object. Components are organized across files:

| File | Components |
|------|-----------|
| `index.ts` | Position, Velocity, Facing, Ship, Thruster, Hull, ThermalSignature, CelestialBody, Selectable, NavigationOrder, BurnPlan, RotationState, Orders |
| `sensor-components.ts` | SensorArray, ContactTracker, DetectedContact |
| `weapon-components.ts` | MissileLauncher, Missile, PDC, Railgun, Projectile |
| `damage-components.ts` | ShipSystems |

#### Spatial Components

- **Position**: `{ x, y, prevX, prevY }` — km coordinates with previous frame for interpolation
- **Velocity**: `{ vx, vy }` — km/s
- **Facing**: `{ angle }` — radians, 0=right, π/2=up

#### Ship Components

- **Ship**: `{ name, hullClass, faction, flagship }` — faction is `'player'|'enemy'|'neutral'`
- **Thruster**: `{ maxThrust, thrustAngle, throttle, rotationSpeed }` — thrust in km/s²
- **Hull**: `{ current, max, armor }`
- **ThermalSignature**: `{ baseSignature, thrustMultiplier }`
- **ShipSystems**: `{ reactor, engines, sensors }` — each has `{ current, max }`

#### Navigation Components

- **NavigationOrder**: `{ targetX, targetY, phase, burnPlan, phaseStartTime, arrivalThreshold }`
  - Phases: `'rotating' → 'accelerating' → 'flipping' → 'decelerating' → 'arrived'`
- **BurnPlan**: `{ accelTime, coastTime, decelTime, totalTime, flipAngle, burnDirection }`
- **RotationState**: `{ currentAngle, targetAngle, rotating }`

#### Sensor Components

- **SensorArray**: `{ maxRange, sensitivity }` — detection threshold
- **ContactTracker**: `{ faction, contacts: Map<EntityId, DetectedContact> }` — per-faction shared
- **DetectedContact**: `{ entityId, lastKnownX/Y, lastKnownVx/Vy, detectionTime, receivedTime, signalStrength, lost, lostTime }`

#### Weapon Components

- **MissileLauncher**: `{ salvoSize, reloadTime, lastFiredTime, maxRange, missileAccel, ammo, seekerRange, seekerSensitivity, integrity }`
- **Missile**: `{ targetId, launcherFaction, count, fuel, accel, seekerRange, seekerSensitivity, guidanceMode, armed, armingDistance }`
- **PDC**: `{ range, fireRate, lastFiredTime, damagePerHit, integrity }`
- **Railgun**: `{ projectileSpeed, maxRange, reloadTime, lastFiredTime, damage, integrity }`
- **Projectile**: `{ shooterId, targetId, faction, damage, hitRadius }`

### Systems (`src/engine/systems/`)

Systems run each simulation tick (0.1s fixed timestep). Execution order matters.

| System | Purpose |
|--------|---------|
| NavigationSystem | Executes burn plans; in-flight course correction when path nears a planet |
| PhysicsSystem | Applies thrust, gravity, updates positions |
| CollisionSystem | Celestial danger zones (1.5× radius), damage/destruction |
| SensorSystem | Detection, light-speed delay, contact tracking |
| MissileSystem | Missile guidance (PN), fuel, detonation |
| PDCSystem | Auto-targets incoming missiles |
| RailgunSystem | Projectile travel and impact |
| DamageSystem | Processes hit events, applies damage |
| AIStrategicSystem | Fleet-level AI decisions |
| AITacticalSystem | Per-ship AI weapon/movement execution |
| VictorySystem | Win/loss condition checking |

## Event System

### EventBus (`src/engine/core/EventBus.ts`)

Typed publish-subscribe system for cross-system communication. Supports:

- Type-specific subscriptions: `eventBus.on('MissileLaunched', handler)`
- Universal subscriptions: `eventBus.onAll(handler)`
- Event history: `eventBus.getHistory('RailgunHit')`

### Event Types

| Event | Data | Emitted By |
|-------|------|-----------|
| SimulationTick | dt, elapsed | GameLoop |
| ShipCreated | entityId, name, faction | ScenarioLoader |
| ShipDestroyed | entityId, name, faction | DamageSystem |
| ThrustStarted/Stopped | entityId | NavigationSystem |
| MissileLaunched | shooterId, targetId, count | CommandHandler |
| MissileIntercepted | missileId, interceptorId | PDCSystem |
| MissileImpact | missileId, targetId, count | MissileSystem |
| RailgunFired | shooterId, targetId | CommandHandler |
| RailgunHit | projectileId, targetId, damage | RailgunSystem |
| CelestialCollision | entityId, bodyName, collision: 'impact'\|'atmosphere' | CollisionSystem |
| PDCFiring | shipId, targetMissileId | PDCSystem |
| ShipDetected | detectorFaction, entityId | SensorSystem |
| ShipLostContact | detectorFaction, entityId | SensorSystem |
| SystemDamaged | entityId, system, health | DamageSystem |
| ShipDisabled | entityId | DamageSystem |
| ContactUpdated | faction | SensorSystem |
| VictoryAchieved | — | VictorySystem |
| DefeatSuffered | — | VictorySystem |

## Game Loop

### GameLoop (`src/core/GameLoop.ts`)

Fixed timestep simulation with render interpolation:

- **Simulation tick**: 0.1s (10 Hz)
- **Render**: requestAnimationFrame (60 Hz)
- **Interpolation alpha**: fraction of tick elapsed, used for smooth rendering
- **Delta cap**: 0.25s max to prevent spiral of death

### GameTime (`src/engine/core/GameTime.ts`)

- Tracks total simulation elapsed time (seconds)
- Pause/resume state (starts paused)
- Time scaling: 1x, 2x, 4x, 10x, 20x, 50x, 100x
- Formats as `T+MM:SS`

## Rendering

All rendering uses Three.js with an orthographic camera looking down the Z axis.

| Renderer | Purpose |
|----------|---------|
| RadarRenderer | Adaptive background grid with scale labels |
| ShipRenderer | Tactical diamond icons, selection rings, velocity vectors, fog opacity |
| CelestialRenderer | Planet/moon/station circles, gravity rings, labels |
| TrailRenderer | Ship trails (history), trajectory projections, destination markers |
| MissileRenderer | Salvo dot clusters with trails |
| ProjectileRenderer | Railgun projectile dots |

### Camera (`src/core/Camera.ts`)

- Orthographic projection, top-down (Z=-5 looking down)
- Zoom range: 100 km to 5,000,000 km
- Pan via mouse drag or WASD/arrow keys
- Coordinate conversion: `screenToWorld()`, `worldToScreen()`
- **Camera lock:** Optional reference entity (ship or celestial); when set, SpaceWarGame sets camera position to that entity each frame and disables pan until "Free" is used.

## Game Coordination

### SpaceWarGame (`src/game/SpaceWarGame.ts`)

Main orchestrator that:

1. Creates the ECS world, event bus, game time, and all systems
2. Sets up Three.js scene and renderers
3. Initializes UI panels
4. Manages input handling (selection, orders, camera)
5. Runs fixed update (all systems) and render (all renderers) loops
6. Loads scenarios via ScenarioLoader

### CommandHandler (`src/game/CommandHandler.ts`)

Translates player and AI intentions into game actions:

- `issueMoveTo(x, y)` — move selected ships to position
- `launchMissile(targetId, gameTime)` — fire missiles from selected ships
- `fireRailgun(targetId, gameTime)` — fire railguns from selected ships
- Per-ship variants for AI use: `issueMoveToForShip()`, `launchMissileFromShip()`, `fireRailgunFromShip()`

Move orders (player and AI) avoid celestial danger zones (1.5× body radius): when the straight-line path would intersect a body, a bypass waypoint is computed via **PlanetAvoidance** and used as the navigation target. See `docs/superpowers/specs/2026-03-11-ai-evade-planets-design.md`.

### PlanetAvoidance (`src/game/PlanetAvoidance.ts`)

Shared logic for path-vs-planet checks:

- `getBodiesFromWorld(world)` — celestial bodies with danger radius (same as CollisionSystem)
- `segmentIntersectsCircle()` — segment/circle intersection
- `getSafeWaypoint(from, to, bodies)` — returns a bypass waypoint or null if path is clear

Ships also **adjust course in flight**: each tick, NavigationSystem checks whether the segment from the ship’s current position to its nav target intersects any body’s avoidance zone; if so, it replaces the target with a safe waypoint and recomputes the burn plan so the ship curves away from the planet.

### TrajectoryCalculator (`src/game/TrajectoryCalculator.ts`)

Pure math functions for navigation planning:

- `computeBurnPlan()` — brachistochrone trajectory (accel → flip → decel)
- `angleBetweenPoints()`, `normalizeAngle()`, `shortestAngleDelta()`

### FiringComputer (`src/game/FiringComputer.ts`)

Lead targeting for railguns:

- `computeLeadSolution()` — intercept point calculation
- `hitProbability()` — range and transverse speed model (0-1)

## Data Layer

### Ship Templates (`src/engine/data/ShipTemplates.ts`)

6 hull classes: Corvette, Frigate, Destroyer, Cruiser, Battleship, Carrier. Each defines hull, armor, thrust, rotation speed, thermal signature, and default module loadout.

### Module Templates (`src/engine/data/ModuleTemplates.ts`)

Predefined weapon and sensor modules in 4 tiers (Light → Battleship/Carrier). Covers missile launchers, PDCs, railguns, and sensors.

### Scenario Loader (`src/engine/data/ScenarioLoader.ts`)

Loads JSON scenario definitions into the ECS world. Creates entities with all components from templates, sets up faction contact trackers, and initializes AI for enemy ships.

## UI Layer (`src/ui/`)

DOM-based panels overlaid on the Three.js canvas:

| Panel | Purpose |
|-------|---------|
| TimeControls | Pause/speed buttons, clock display, targeting readout |
| FleetPanel | Ship roster with hull bars, selection highlighting |
| ShipDetailPanel | Selected ship stats, weapon status, contact info |
| OrderBar | Move/Fire Missile/Fire Railgun context buttons |
| CombatLog | Scrollable event history (max 100 entries) |

## Units

| Quantity | Unit |
|----------|------|
| Distance | km |
| Velocity | km/s |
| Acceleration | km/s² |
| Time | seconds |
| Angles | radians |
| Gravity constant | G_KM = 6.674e-20 km³/(kg·s²) |
| Light speed | 299,792 km/s |

## File Structure

```
src/
├── main.ts                          # Entry point
├── core/
│   ├── Camera.ts                    # Orthographic pan/zoom
│   ├── GameLoop.ts                  # Fixed timestep + interpolation
│   └── InputManager.ts              # Mouse/keyboard events
├── engine/
│   ├── types.ts                     # Core types
│   ├── components/
│   │   ├── index.ts                 # Core components + re-exports
│   │   ├── sensor-components.ts     # Sensor/contact types
│   │   ├── weapon-components.ts     # Weapon/projectile types
│   │   └── damage-components.ts     # Ship systems types
│   ├── core/
│   │   ├── EventBus.ts              # Typed pub-sub
│   │   └── GameTime.ts              # Time management
│   ├── ecs/
│   │   └── World.ts                 # ECS store
│   ├── systems/
│   │   ├── PhysicsSystem.ts         # Newtonian + gravity
│   │   ├── NavigationSystem.ts      # Burn plan execution
│   │   ├── CollisionSystem.ts       # Celestial danger zones
│   │   ├── SensorSystem.ts          # Detection + fog of war
│   │   ├── MissileSystem.ts         # Missile guidance
│   │   ├── PDCSystem.ts             # Point defense
│   │   ├── RailgunSystem.ts         # Railgun projectiles
│   │   ├── DamageSystem.ts          # Damage processing
│   │   ├── AIStrategicSystem.ts     # Fleet AI
│   │   ├── AITacticalSystem.ts      # Ship AI
│   │   └── VictorySystem.ts         # Win/loss conditions
│   └── data/
│       ├── ShipTemplates.ts         # Hull class definitions
│       ├── ModuleTemplates.ts       # Weapon/sensor modules
│       ├── ScenarioLoader.ts        # Scenario loading
│       └── scenarios/               # Scenario definitions
├── game/
│   ├── SpaceWarGame.ts              # Main orchestrator
│   ├── CommandHandler.ts            # Player/AI commands
│   ├── PlanetAvoidance.ts           # Path vs planet avoidance
│   ├── TrajectoryCalculator.ts      # Burn planning math
│   ├── FiringComputer.ts            # Lead targeting
│   ├── SelectionManager.ts          # Ship selection
│   └── Selection.ts                 # Box select utility
├── rendering/
│   ├── RadarRenderer.ts             # Background grid
│   ├── ShipRenderer.ts              # Ship icons
│   ├── CelestialRenderer.ts         # Planets/stations
│   ├── TrailRenderer.ts             # Trails + projections
│   ├── MissileRenderer.ts           # Missile salvos
│   └── ProjectileRenderer.ts        # Railgun rounds
├── ui/
│   ├── TimeControls.ts              # Clock + speed
│   ├── FleetPanel.ts                # Ship roster
│   ├── ShipDetailPanel.ts           # Selected ship info
│   ├── OrderBar.ts                  # Order buttons
│   └── CombatLog.ts                 # Event log
└── utils/
    └── OrbitalMechanics.ts          # Gravity math
```
