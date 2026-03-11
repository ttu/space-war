# Space War

A real-time tactical space combat game where you command a fleet from a CIC (Combat Information Center) radar display. Newtonian physics, light-speed sensor delay, and realistic weapon systems.

Inspired by The Expanse, Lost Fleet, and Project Rho.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Three.js](https://img.shields.io/badge/Three.js-orthographic-green) ![Vite](https://img.shields.io/badge/Vite-dev%20%2B%20build-purple)

## Features

- **Newtonian physics** — no friction, inertia matters, computer-assisted burn planning
- **Fog of war** — inverse-square thermal detection with light-speed delay
- **Three weapon types** — guided missiles, point defense cannons, railguns with lead targeting
- **Six ship classes** — Corvette, Frigate, Destroyer, Cruiser, Battleship, Carrier
- **Subsystem damage** — hull, engines, sensors, reactor, and weapons can be damaged independently
- **Fleet AI** — strategic fleet decisions + tactical per-ship weapon management
- **Time control** — pause to issue orders, accelerate up to 100x

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Controls

| Input | Action |
|-------|--------|
| Left-click | Select ship |
| Shift+click | Add to selection |
| Left-drag | Box select |
| Right-click space | Move selected ships |
| Right-click enemy | Fire weapons at target |
| Scroll wheel | Zoom |
| Right-drag / WASD | Pan camera |
| Space | Pause / Resume |

Use the order bar buttons (Move, Fire Missile, Fire Railgun) to set specific actions before right-clicking.

## Development

```bash
npm run dev          # Development server
npm run build        # Production build (tsc && vite build)
npm test             # Unit tests (Vitest)
npm run test:watch   # Unit tests (watch mode)
npm run test:e2e     # E2E tests (Playwright)
```

## Architecture

ECS (Entity-Component-System) architecture with Three.js orthographic rendering.

- **Components** hold data (position, velocity, hull, weapons, sensors)
- **Systems** hold logic (physics, navigation, sensors, missiles, PDC, railgun, damage, AI)
- **EventBus** for cross-system communication
- **Fixed timestep** simulation at 10 Hz with render interpolation

See [docs/](docs/) for detailed documentation:

- [Game Design](docs/design.md) — design principles and decisions
- [Architecture](docs/architecture.md) — technical systems reference
- [Game Guide](docs/game-guide.md) — how to play

## Tech Stack

- **TypeScript** — strict typing throughout
- **Three.js** — orthographic top-down 2D rendering
- **Vite** — bundling and dev server
- **Vitest** — unit testing
- **Playwright** — end-to-end testing
