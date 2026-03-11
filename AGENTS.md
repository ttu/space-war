# AGENTS.md

Context and instructions for AI coding agents working on this project.

## Project Overview

A browser-based real-time tactical space combat game. Fleet commander perspective with a tactical radar map view. Newtonian physics, light-speed sensor delay, missiles/PDCs/railguns. Built with Three.js orthographic top-down 2D view using an ECS (Entity Component System) architecture.

Inspired by: The Expanse, Lost Fleet, Project Rho.

**Tech Stack**: Three.js, TypeScript, Vite, Vitest, Playwright (e2e)

## Setup & Build

```bash
npm install
npm run dev      # Development server
npm run build    # Production build (tsc && vite build)
npm test         # Run unit tests once
npm run test:watch # Run unit tests (watch mode)
npm run test:e2e # Run Playwright e2e tests (requires: npx playwright install)
```

## Project Structure

```
src/
├── main.ts                          # Entry point
├── core/                            # Input & Camera
│   ├── Camera.ts                    # Orthographic pan/zoom (top-down)
│   ├── GameLoop.ts                  # Fixed timestep + render interpolation
│   └── InputManager.ts              # Mouse/keyboard event handling
├── engine/                          # Game engine (ECS-based)
│   ├── types.ts                     # Core types (EntityId, Component, World, GameEvent)
│   ├── components/                  # ECS components
│   │   ├── index.ts                 # Core components + re-exports
│   │   ├── sensor-components.ts     # Sensor/contact types
│   │   ├── weapon-components.ts     # Weapon/projectile types
│   │   └── damage-components.ts     # Ship systems types
│   ├── core/
│   │   ├── EventBus.ts              # Typed pub-sub event system
│   │   └── GameTime.ts              # Pause, time scaling (1x–100x)
│   ├── ecs/
│   │   └── World.ts                 # ECS world (entities & components)
│   ├── systems/                     # ECS systems (10 systems)
│   │   ├── PhysicsSystem.ts         # Newtonian movement + gravity
│   │   ├── NavigationSystem.ts      # Burn plan execution
│   │   ├── SensorSystem.ts          # Detection + fog of war
│   │   ├── MissileSystem.ts         # Missile guidance (PN)
│   │   ├── PDCSystem.ts             # Point defense
│   │   ├── RailgunSystem.ts         # Railgun projectiles
│   │   ├── DamageSystem.ts          # Damage processing
│   │   ├── AIStrategicSystem.ts     # Fleet AI decisions
│   │   ├── AITacticalSystem.ts      # Per-ship AI
│   │   └── VictorySystem.ts         # Win/loss conditions
│   └── data/                        # Ship templates, scenarios
│       ├── ShipTemplates.ts         # Hull class definitions
│       ├── ModuleTemplates.ts       # Weapon/sensor modules
│       ├── ScenarioLoader.ts        # Scenario loading
│       └── scenarios/               # Scenario definitions
├── game/                            # Game coordination
│   ├── SpaceWarGame.ts              # Main orchestrator
│   ├── CommandHandler.ts            # Player/AI commands
│   ├── TrajectoryCalculator.ts      # Burn planning math
│   ├── FiringComputer.ts            # Lead targeting
│   ├── SelectionManager.ts          # Ship selection
│   └── Selection.ts                 # Box select utility
├── rendering/                       # Three.js rendering
│   ├── RadarRenderer.ts             # Background grid
│   ├── ShipRenderer.ts              # Ship icons, selection, velocity vectors
│   ├── CelestialRenderer.ts         # Planets, gravity wells, labels
│   ├── TrailRenderer.ts             # Ship trails + trajectory projections
│   ├── MissileRenderer.ts           # Missile salvos + trails
│   └── ProjectileRenderer.ts        # Railgun projectile dots
├── ui/                              # DOM UI panels
│   ├── TimeControls.ts              # Clock + speed buttons
│   ├── FleetPanel.ts                # Ship roster
│   ├── ShipDetailPanel.ts           # Selected ship info
│   ├── OrderBar.ts                  # Order buttons
│   └── CombatLog.ts                 # Event log
└── utils/
    └── OrbitalMechanics.ts          # Gravity calculations
```

## Code Conventions

- **TypeScript**: Strict typing; avoid `any`
- **Architecture**: ECS pattern — components hold data, systems hold logic
- **Three.js**: Orthographic camera; top-down 2D view; ship icons are geometric shapes
- **Units**: km for distance, km/s for velocity, km/s² for acceleration
- **Naming**: PascalCase for classes, camelCase for functions/variables
- **Testing**: Vitest for unit tests (mirror `src/` under `tests/`); Playwright for e2e (see `e2e/`)

## Commit Conventions

- **Format**: `type: description` + optional bullet details
- **Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `ci`, `build`, `perf`
- **No scopes**: Use `feat:` not `feat(scope):`
- **Implementation steps**: Use types (`chore` setup, `feat` feature, etc.) not "Step X:"
- **Never commit with `--no-verify`** — run pre-commit hooks and fix failures

## Key Systems

| System           | Location                          | Purpose                                     |
| ---------------- | --------------------------------- | ------------------------------------------- |
| ECS World        | `engine/ecs/World.ts`             | Entity-component storage and queries        |
| EventBus         | `engine/core/EventBus.ts`         | Typed pub-sub event system                  |
| GameTime         | `engine/core/GameTime.ts`         | Pause state, time scaling                   |
| GameLoop         | `core/GameLoop.ts`                | Fixed timestep simulation + render interp   |
| Physics          | `engine/systems/PhysicsSystem.ts` | Newtonian movement, gravity from bodies     |
| Navigation       | `engine/systems/NavigationSystem.ts` | Brachistochrone burn plan execution      |
| Sensors          | `engine/systems/SensorSystem.ts`  | Detection, light-speed delay, fog of war    |
| Missiles         | `engine/systems/MissileSystem.ts` | Proportional navigation guidance            |
| PDC              | `engine/systems/PDCSystem.ts`     | Auto point defense against missiles         |
| Railgun          | `engine/systems/RailgunSystem.ts` | Projectile travel and impact                |
| Damage           | `engine/systems/DamageSystem.ts`  | Hull/subsystem/weapon damage processing     |
| AI Strategic     | `engine/systems/AIStrategicSystem.ts` | Fleet-level AI decisions                |
| AI Tactical      | `engine/systems/AITacticalSystem.ts`  | Per-ship AI weapon/movement             |
| Victory          | `engine/systems/VictorySystem.ts` | Win/loss condition checking                 |
| Camera           | `core/Camera.ts`                  | Orthographic pan/zoom, screen↔world coords  |
| Input            | `core/InputManager.ts`            | Mouse/keyboard events → callbacks           |
| SpaceWarGame     | `game/SpaceWarGame.ts`            | Main orchestrator, wires all systems        |
| CommandHandler   | `game/CommandHandler.ts`          | Player/AI commands → game actions           |
| FiringComputer   | `game/FiringComputer.ts`          | Railgun lead targeting + hit probability    |
| TrajectoryCalc   | `game/TrajectoryCalculator.ts`    | Brachistochrone burn planning math           |

## Documentation

- `docs/design.md` - Game design principles and decisions
- `docs/architecture.md` - Technical architecture and systems reference
- `docs/game-guide.md` - How to play the game

## Guidelines for Agents

1. **Read docs first** - Check `/docs` for design and architecture before implementing
2. **Follow ECS patterns** - Components hold data, systems hold logic; use the World for entity queries
3. **Use EventBus** for cross-system communication
4. **Run tests** - Use `npm test` to verify changes
5. **Always build and test after implementation** - Run `npm run build` and `npm test` before considering work complete
6. **Units matter** - Distances in km, velocities in km/s, gravity constant in km units (G_KM = 6.674e-20)
