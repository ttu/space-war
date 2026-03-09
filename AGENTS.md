# AGENTS.md

Context and instructions for AI coding agents working on this project.

## Project Overview

A browser-based real-time tactical space combat game. Fleet commander perspective with a tactical radar map view. Newtonian physics, light-speed sensor delay, missiles/PDCs/railguns. Built with Three.js orthographic top-down 2D view using an ECS (Entity Component System) architecture.

Inspired by: The Expanse, Lost Fleet, Project Rho.

**Tech Stack**: Three.js, TypeScript, Vite, Vitest

## Setup & Build

```bash
npm install
npm run dev      # Development server
npm run build    # Production build (tsc && vite build)
npm test         # Run tests once
npm run test:watch # Run tests (watch mode)
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
│   ├── components/index.ts          # ECS components (Position, Velocity, Ship, etc.)
│   ├── core/
│   │   ├── EventBus.ts              # Typed pub-sub event system
│   │   └── GameTime.ts              # Pause, time scaling (1x/2x/4x)
│   ├── ecs/
│   │   └── World.ts                 # ECS world (entities & components)
│   ├── systems/                     # ECS systems
│   │   └── PhysicsSystem.ts         # Newtonian movement + gravity
│   └── data/                        # Ship templates, scenarios (future)
├── game/                            # Game coordination
│   └── SpaceWarGame.ts              # Main orchestrator
├── rendering/                       # Three.js rendering
│   ├── RadarRenderer.ts             # Background grid
│   ├── ShipRenderer.ts              # Ship icons, selection, velocity vectors
│   └── CelestialRenderer.ts         # Planets, gravity wells, labels
├── ui/                              # DOM UI panels (future)
└── utils/
    └── OrbitalMechanics.ts          # Gravity calculations
```

## Code Conventions

- **TypeScript**: Strict typing; avoid `any`
- **Architecture**: ECS pattern — components hold data, systems hold logic
- **Three.js**: Orthographic camera; top-down 2D view; ship icons are geometric shapes
- **Units**: km for distance, km/s for velocity, km/s² for acceleration
- **Naming**: PascalCase for classes, camelCase for functions/variables
- **Testing**: Vitest; tests mirror `src/` structure under `tests/`

## Commit Conventions

- **Format**: `type: description` + optional bullet details
- **Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `ci`, `build`, `perf`
- **No scopes**: Use `feat:` not `feat(scope):`
- **Implementation steps**: Use types (`chore` setup, `feat` feature, etc.) not "Step X:"
- **Never commit with `--no-verify`** — run pre-commit hooks and fix failures

## Key Systems

| System           | Location                         | Purpose                                     |
| ---------------- | -------------------------------- | ------------------------------------------- |
| ECS World        | `engine/ecs/World.ts`            | Entity-component storage and queries        |
| EventBus         | `engine/core/EventBus.ts`        | Typed pub-sub event system                  |
| GameTime         | `engine/core/GameTime.ts`        | Pause state, time scaling                   |
| GameLoop         | `core/GameLoop.ts`               | Fixed timestep simulation + render interp   |
| Physics          | `engine/systems/PhysicsSystem.ts`| Newtonian movement, gravity from bodies     |
| Camera           | `core/Camera.ts`                 | Orthographic pan/zoom, screen↔world coords  |
| Input            | `core/InputManager.ts`           | Mouse/keyboard events → callbacks           |
| SpaceWarGame     | `game/SpaceWarGame.ts`           | Main orchestrator, wires all systems        |
| Orbital Math     | `utils/OrbitalMechanics.ts`      | Gravity acceleration, orbital velocity      |

## Documentation

- `docs/plans/2026-03-09-space-war-design.md` - Full game design and implementation plan

## Guidelines for Agents

1. **Read docs first** - Check `/docs` for design and architecture before implementing
2. **Follow ECS patterns** - Components hold data, systems hold logic; use the World for entity queries
3. **Use EventBus** for cross-system communication
4. **Run tests** - Use `npm test` to verify changes
5. **Always build and test after implementation** - Run `npm run build` and `npm test` before considering work complete
6. **Units matter** - Distances in km, velocities in km/s, gravity constant in km units (G_KM = 6.674e-20)
