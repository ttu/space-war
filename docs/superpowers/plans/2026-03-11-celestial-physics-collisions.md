# Celestial Physics & Collisions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make celestial bodies orbit via real physics (moons orbit planets, planets orbit stars), destroy/damage entities that get too close, and render danger zones.

**Architecture:** Give celestial bodies Velocity components so existing PhysicsSystem moves them under gravity. Add a new CollisionSystem that checks proximity to celestial bodies each tick — instant kill inside radius, linear damage in 2x radius zone. Add `CelestialCollision` event type and danger zone rendering.

**Tech Stack:** TypeScript, Three.js, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/engine/types.ts` | Modify | Add `CelestialCollision` event type |
| `src/engine/components/index.ts` | Modify | Add `'star'` to CelestialBody bodyType |
| `src/engine/data/ScenarioLoader.ts` | Modify | Add `vx`/`vy` to ScenarioCelestial, create Velocity for celestials |
| `src/engine/data/scenarios/demo.ts` | Modify | Add Sol, give Terra/Luna orbital velocities |
| `src/engine/systems/CollisionSystem.ts` | Create | Proximity damage/destruction near celestial bodies |
| `src/rendering/CelestialRenderer.ts` | Modify | Danger zone ring, star color |
| `src/game/SpaceWarGame.ts` | Modify | Wire CollisionSystem into fixedUpdate |
| `src/ui/CombatLog.ts` | Modify | Handle CelestialCollision event display |
| `tests/engine/systems/CollisionSystem.test.ts` | Create | Unit tests for collision logic |

---

### Task 1: Add CelestialCollision Event Type and Star Body Type

**Files:**
- Modify: `src/engine/types.ts:20-42`
- Modify: `src/engine/components/index.ts:62-68`

- [ ] **Step 1: Add CelestialCollision to GameEventType**

In `src/engine/types.ts`, add `'CelestialCollision'` to the `GameEventType` union:

```typescript
export type GameEventType =
  | 'SimulationTick'
  | 'ShipCreated'
  | 'ShipDestroyed'
  // ... existing types ...
  | 'DefeatSuffered'
  | 'CelestialCollision';
```

- [ ] **Step 2: Add 'star' to CelestialBody bodyType**

In `src/engine/components/index.ts` line 67, change:
```typescript
bodyType: 'planet' | 'moon' | 'station' | 'asteroid';
```
to:
```typescript
bodyType: 'star' | 'planet' | 'moon' | 'station' | 'asteroid';
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/engine/components/index.ts
git commit -m "feat: add CelestialCollision event type and star body type"
```

---

### Task 2: CollisionSystem — Tests First

**Files:**
- Create: `tests/engine/systems/CollisionSystem.test.ts`
- Create: `src/engine/systems/CollisionSystem.ts`

- [ ] **Step 1: Write failing tests for CollisionSystem**

Create `tests/engine/systems/CollisionSystem.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { CollisionSystem } from '../../../src/engine/systems/CollisionSystem';
import type { GameEvent } from '../../../src/engine/types';
import {
  Position, Velocity, Hull, Ship, CelestialBody, COMPONENT,
} from '../../../src/engine/components';
import type { Missile, Projectile } from '../../../src/engine/components';

function createPlanet(
  world: WorldImpl,
  opts: { x: number; y: number; mass: number; radius: number; name?: string },
) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'CelestialBody', name: opts.name ?? 'Planet', mass: opts.mass,
    radius: opts.radius, bodyType: 'planet',
  } as CelestialBody);
  return id;
}

function createShip(
  world: WorldImpl,
  opts: { x: number; y: number; hullCurrent?: number },
) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'Velocity', vx: 0, vy: 0,
  } as Velocity);
  world.addComponent(id, {
    type: 'Ship', name: 'TestShip', hullClass: 'frigate', faction: 'player', flagship: false,
  } as Ship);
  world.addComponent(id, {
    type: 'Hull', current: opts.hullCurrent ?? 100, max: 100, armor: 0,
  } as Hull);
  return id;
}

function createMissile(world: WorldImpl, opts: { x: number; y: number }) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'Velocity', vx: 0, vy: 0,
  } as Velocity);
  world.addComponent(id, {
    type: 'Missile', targetId: 'dummy', fuel: 100, maxFuel: 100,
    acceleration: 0.1, guidanceMode: 'sensor', seekerRange: 1000,
    seekerSensitivity: 1, salvoId: 's1', faction: 'player', detonationRange: 1,
    launchTime: 0,
  } as Missile);
  return id;
}

function createProjectile(world: WorldImpl, opts: { x: number; y: number }) {
  const id = world.createEntity();
  world.addComponent(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  } as Position);
  world.addComponent(id, {
    type: 'Velocity', vx: 0, vy: 0,
  } as Velocity);
  world.addComponent(id, {
    type: 'Projectile', speed: 10, maxRange: 10000, distanceTraveled: 0,
    damage: 30, faction: 'player',
  } as Projectile);
  return id;
}

describe('CollisionSystem', () => {
  it('destroys ship inside planet radius', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const shipId = createShip(world, { x: 3000, y: 0 }); // inside radius

    system.update(world);

    expect(world.getAllEntities().includes(shipId)).toBe(false);
  });

  it('emits CelestialCollision event on ship destruction', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    const events: GameEvent[] = [];
    eventBus.subscribe('CelestialCollision', (e) => events.push(e));

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371, name: 'Terra' });
    createShip(world, { x: 3000, y: 0 });

    system.update(world);

    expect(events.length).toBe(1);
    expect(events[0].data.bodyName).toBe('Terra');
  });

  it('damages ship in danger zone (between radius and 2x radius)', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    // Place ship at 1.5x radius (middle of danger zone)
    const shipId = createShip(world, { x: 6371 * 1.5, y: 0, hullCurrent: 100 });

    system.update(world);

    // Ship should still exist but with reduced hull
    expect(world.getAllEntities().includes(shipId)).toBe(true);
    const hull = world.getComponent<Hull>(shipId, COMPONENT.Hull)!;
    expect(hull.current).toBeLessThan(100);
  });

  it('does not affect ship outside danger zone', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const shipId = createShip(world, { x: 6371 * 3, y: 0 }); // well outside 2x

    system.update(world);

    expect(world.getAllEntities().includes(shipId)).toBe(true);
    const hull = world.getComponent<Hull>(shipId, COMPONENT.Hull)!;
    expect(hull.current).toBe(100);
  });

  it('destroys missile inside danger zone', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const missileId = createMissile(world, { x: 6371 * 1.5, y: 0 });

    system.update(world);

    expect(world.getAllEntities().includes(missileId)).toBe(false);
  });

  it('destroys projectile inside danger zone', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const projId = createProjectile(world, { x: 6371 * 1.5, y: 0 });

    system.update(world);

    expect(world.getAllEntities().includes(projId)).toBe(false);
  });

  it('does not destroy celestial bodies', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    const planetId = createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    // Place a moon "inside" the planet (they shouldn't collide with each other)
    const moonId = createPlanet(world, { x: 3000, y: 0, mass: 1e22, radius: 1737 });

    system.update(world);

    expect(world.getAllEntities().includes(planetId)).toBe(true);
    expect(world.getAllEntities().includes(moonId)).toBe(true);
  });

  it('destroys ship with low hull on surface contact', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new CollisionSystem(eventBus);

    const events: GameEvent[] = [];
    eventBus.subscribe('CelestialCollision', (e) => events.push(e));
    eventBus.subscribe('ShipDestroyed', (e) => events.push(e));

    createPlanet(world, { x: 0, y: 0, mass: 1e24, radius: 6371 });
    const shipId = createShip(world, { x: 1000, y: 0, hullCurrent: 5 });

    system.update(world);

    expect(world.getAllEntities().includes(shipId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/CollisionSystem.test.ts`
Expected: FAIL — CollisionSystem doesn't exist yet

- [ ] **Step 3: Implement CollisionSystem**

Create `src/engine/systems/CollisionSystem.ts`:

```typescript
import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import { Position, Velocity, Hull, CelestialBody, COMPONENT } from '../components';

/** Hull damage per tick at the inner edge of the danger zone (surface). */
const MAX_DAMAGE_PER_TICK = 5;
/** Danger zone extends to this multiplier of body radius. */
const DANGER_ZONE_MULTIPLIER = 2;

export class CollisionSystem {
  constructor(private eventBus: EventBus) {}

  update(world: World): void {
    // Collect celestial bodies
    const bodyEntities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    const bodies: { id: EntityId; x: number; y: number; radius: number; name: string }[] = [];
    for (const id of bodyEntities) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      bodies.push({ id, x: pos.x, y: pos.y, radius: body.radius, name: body.name });
    }

    // Check all entities with Position + Velocity (ships, missiles, projectiles)
    const movableEntities = world.query(COMPONENT.Position, COMPONENT.Velocity);
    const toRemove: EntityId[] = [];

    for (const entityId of movableEntities) {
      // Skip celestial bodies themselves
      if (world.hasComponent(entityId, COMPONENT.CelestialBody)) continue;
      // Skip already-marked-for-removal entities
      if (toRemove.includes(entityId)) continue;

      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;

      for (const body of bodies) {
        const dx = pos.x - body.x;
        const dy = pos.y - body.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dangerRadius = body.radius * DANGER_ZONE_MULTIPLIER;

        if (dist <= body.radius) {
          // Inside surface — instant destruction
          this.eventBus.emit({
            type: 'CelestialCollision',
            time: 0,
            entityId,
            data: { bodyName: body.name, collision: 'impact' },
          });
          toRemove.push(entityId);
          break;
        } else if (dist <= dangerRadius) {
          // In danger zone
          const hull = world.getComponent<Hull>(entityId, COMPONENT.Hull);
          if (hull) {
            // Ships take gradual damage — linear from MAX at surface to 0 at edge
            const proximity = 1 - (dist - body.radius) / (dangerRadius - body.radius);
            const damage = Math.ceil(MAX_DAMAGE_PER_TICK * proximity);
            hull.current = Math.max(0, hull.current - damage);

            if (hull.current <= 0) {
              this.eventBus.emit({
                type: 'CelestialCollision',
                time: 0,
                entityId,
                data: { bodyName: body.name, collision: 'atmosphere' },
              });
              toRemove.push(entityId);
              break;
            }
          } else {
            // Missiles/projectiles — instant destruction in danger zone
            this.eventBus.emit({
              type: 'CelestialCollision',
              time: 0,
              entityId,
              data: { bodyName: body.name, collision: 'atmosphere' },
            });
            toRemove.push(entityId);
            break;
          }
        }
      }
    }

    // Remove destroyed entities
    for (const id of toRemove) {
      world.removeEntity(id);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/CollisionSystem.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/systems/CollisionSystem.ts tests/engine/systems/CollisionSystem.test.ts
git commit -m "feat: add CollisionSystem with danger zones around celestial bodies"
```

---

### Task 3: Celestial Bodies Get Velocity — Scenario Updates

**Files:**
- Modify: `src/engine/data/ScenarioLoader.ts:34-41, 68-84`
- Modify: `src/engine/data/scenarios/demo.ts`

- [ ] **Step 1: Add vx/vy to ScenarioCelestial and create Velocity in loader**

In `src/engine/data/ScenarioLoader.ts`, update the `ScenarioCelestial` interface (line 34-41):

```typescript
export interface ScenarioCelestial {
  name: string;
  mass: number;
  radius: number;
  bodyType: 'star' | 'planet' | 'moon' | 'station' | 'asteroid';
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}
```

In the celestial loading loop (after line 83), add Velocity component when vx/vy are provided:

```typescript
if (c.vx !== undefined || c.vy !== undefined) {
  world.addComponent(id, {
    type: 'Velocity',
    vx: c.vx ?? 0,
    vy: c.vy ?? 0,
  } as Velocity);
}
```

- [ ] **Step 2: Update demo scenario with Sol, and give Terra/Luna velocities**

Rewrite `src/engine/data/scenarios/demo.ts`:

```typescript
import type { Scenario } from '../ScenarioLoader';
import { circularOrbitSpeed } from '../../../utils/OrbitalMechanics';

const SOL_MASS = 1.989e30;
const TERRA_MASS = 5.972e24;
const TERRA_ORBITAL_RADIUS = 150_000_000; // km from Sol
const LUNA_ORBITAL_RADIUS = 384_400; // km from Terra

// Terra orbits Sol
const terraOrbitalSpeed = circularOrbitSpeed(SOL_MASS, TERRA_ORBITAL_RADIUS);
// Luna orbits Terra (velocity is relative to space, so add Terra's velocity)
const lunaOrbitalSpeed = circularOrbitSpeed(TERRA_MASS, LUNA_ORBITAL_RADIUS);

// Ship orbital speed around Terra at 42,000 km
const shipOrbitalSpeed = circularOrbitSpeed(TERRA_MASS, 42000);

// Sol at origin, Terra offset along +X, Luna offset from Terra along +Y
const SOL_X = 0;
const SOL_Y = 0;
const TERRA_X = TERRA_ORBITAL_RADIUS;
const TERRA_Y = 0;
const LUNA_X = TERRA_X;
const LUNA_Y = LUNA_ORBITAL_RADIUS;

export const demoScenario: Scenario = {
  celestials: [
    {
      name: 'Sol', mass: SOL_MASS, radius: 696_000, bodyType: 'star',
      x: SOL_X, y: SOL_Y,
    },
    {
      name: 'Terra', mass: TERRA_MASS, radius: 6371, bodyType: 'planet',
      x: TERRA_X, y: TERRA_Y,
      vx: 0, vy: terraOrbitalSpeed, // orbiting Sol in +Y direction
    },
    {
      name: 'Luna', mass: 7.342e22, radius: 1737, bodyType: 'moon',
      x: LUNA_X, y: LUNA_Y,
      vx: -lunaOrbitalSpeed, vy: terraOrbitalSpeed, // orbiting Terra + moving with Terra
    },
  ],
  ships: [
    {
      templateId: 'cruiser', name: 'TCS Resolute', faction: 'player', flagship: true,
      x: TERRA_X + 42000, y: TERRA_Y,
      vx: 0, vy: terraOrbitalSpeed + shipOrbitalSpeed,
    },
    {
      templateId: 'destroyer', name: 'TCS Vigilant', faction: 'player',
      x: TERRA_X + 42500, y: TERRA_Y + 1000,
      vx: 0, vy: terraOrbitalSpeed + shipOrbitalSpeed * 0.99,
    },
    {
      templateId: 'cruiser', name: 'UES Aggressor', faction: 'enemy', flagship: true,
      x: TERRA_X - 80000, y: TERRA_Y + 60000,
      vx: 2.0, vy: terraOrbitalSpeed - 1.5,
    },
    {
      templateId: 'frigate', name: 'UES Raider', faction: 'enemy',
      x: TERRA_X - 75000, y: TERRA_Y + 65000,
      vx: 2.2, vy: terraOrbitalSpeed - 1.3,
    },
  ],
};
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (ScenarioLoader tests may need checking)

- [ ] **Step 5: Commit**

```bash
git add src/engine/data/ScenarioLoader.ts src/engine/data/scenarios/demo.ts
git commit -m "feat: give celestial bodies velocity for real orbital physics"
```

---

### Task 4: Wire CollisionSystem into Game Loop

**Files:**
- Modify: `src/game/SpaceWarGame.ts:56, 477-490`

- [ ] **Step 1: Import and instantiate CollisionSystem**

Add import at top of `src/game/SpaceWarGame.ts`:
```typescript
import { CollisionSystem } from '../engine/systems/CollisionSystem';
```

Add field after `physicsSystem` declaration (line ~56):
```typescript
private collisionSystem = new CollisionSystem(this.eventBus);
```

- [ ] **Step 2: Add CollisionSystem to fixedUpdate**

In `fixedUpdate()` method, add `this.collisionSystem.update(this.world);` after `physicsSystem.update()` and before `missileSystem.update()`:

```typescript
private fixedUpdate(dt: number): void {
  this.sensorSystem.update(this.world, dt, this.gameTime.elapsed);
  this.pdcSystem.update(this.world, dt, this.gameTime.elapsed);
  this.railgunSystem.update(this.world, dt, this.gameTime.elapsed);
  this.damageSystem.processHitEvents(this.world);
  this.aiStrategicSystem.update(this.world, dt, this.gameTime.elapsed);
  this.aiTacticalSystem.update(this.world, dt, this.gameTime.elapsed);
  this.navigationSystem.update(this.world, dt, this.gameTime.elapsed);
  this.physicsSystem.update(this.world, dt);
  this.collisionSystem.update(this.world);
  this.missileSystem.update(this.world, dt, this.gameTime.elapsed);
  this.victorySystem.update(this.world, this.gameTime.elapsed);
  this.trailRenderer.recordPositions(this.world);
  this.missileRenderer.recordPositions(this.world);
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/game/SpaceWarGame.ts
git commit -m "feat: wire CollisionSystem into game loop after physics"
```

---

### Task 5: CelestialRenderer — Danger Zone Ring and Star Color

**Files:**
- Modify: `src/rendering/CelestialRenderer.ts`

- [ ] **Step 1: Add star color and danger zone ring**

In `BODY_COLORS` (line 12-17), add star:
```typescript
const BODY_COLORS: Record<string, number> = {
  star: 0xaa8833,
  planet: 0x334466,
  moon: 0x445566,
  station: 0x446644,
  asteroid: 0x554433,
};
```

Add `dangerRing: THREE.LineLoop` to the `BodyVisual` interface:
```typescript
interface BodyVisual {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  gravityRings: THREE.LineLoop[];
  dangerRing: THREE.LineLoop;
  label: THREE.Sprite;
}
```

In `createBodyVisual()`, after the gravity rings loop and before the label, add the danger zone ring:

```typescript
// Danger zone ring at 2x radius
const dangerGeo = new THREE.BufferGeometry();
const dangerPoints: number[] = [];
const dangerSegments = 64;
for (let j = 0; j <= dangerSegments; j++) {
  const angle = (j / dangerSegments) * Math.PI * 2;
  dangerPoints.push(Math.cos(angle), Math.sin(angle), 0);
}
dangerGeo.setAttribute('position', new THREE.Float32BufferAttribute(dangerPoints, 3));
const dangerMat = new THREE.LineBasicMaterial({
  color: 0xcc4422,
  transparent: true,
  opacity: 0.15,
});
const dangerRing = new THREE.LineLoop(dangerGeo, dangerMat);
group.add(dangerRing);
```

Update the return statement to include `dangerRing`:
```typescript
return { group, bodyMesh, gravityRings, dangerRing, label };
```

In the `update()` method, after gravity rings scaling (after line 62), add danger ring scaling:

```typescript
// Danger zone ring at 2x radius
const dangerRadius = body.radius * 2;
visual.dangerRing.scale.set(dangerRadius, dangerRadius, 1);
visual.dangerRing.visible = dangerRadius > zoom * 0.02;
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/rendering/CelestialRenderer.ts
git commit -m "feat: add danger zone ring and star color to celestial rendering"
```

---

### Task 6: CombatLog — Display Celestial Collision Events

**Files:**
- Modify: `src/ui/CombatLog.ts:16-52`

- [ ] **Step 1: Add CelestialCollision case to eventSummary**

In the `eventSummary` function switch statement, add before the `default` case:

```typescript
case 'CelestialCollision':
  return `${t} ${e.data?.collision === 'impact' ? 'Crashed into' : 'Burned up near'} ${e.data?.bodyName ?? 'celestial body'}`;
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/CombatLog.ts
git commit -m "feat: display celestial collision events in combat log"
```

---

### Task 7: Full Integration Test

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

Verify:
- Luna visibly orbits Terra over time (speed up to 50x-100x to observe)
- Ships near Terra stay in orbit
- Sol is visible (very far from combat area; may need to zoom way out)
- Danger zone rings appear as translucent red circles around planets
- If a ship is navigated into a planet, it takes damage and is destroyed
- Combat log shows collision events

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration adjustments for celestial physics"
```
