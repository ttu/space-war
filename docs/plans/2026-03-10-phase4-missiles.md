# Phase 4: Weapons - Missiles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ships can launch missile salvos that fly toward targets using proportional navigation guidance, with hybrid sensor/seeker targeting and fuel limits.

**Architecture:** Salvo-based missile entities (one entity per salvo with missile count). MissileSystem handles guidance each tick: faction ContactTracker for long-range targeting, onboard seeker for terminal guidance, ballistic fallback when target lost. Proportional navigation steers missiles toward predicted intercept. PhysicsSystem handles gravity for free (missiles have Position+Velocity). Direct hit required (~1 km detonation radius). No damage model yet (Phase 6).

**Tech Stack:** TypeScript, Three.js, Vitest

---

### Task 1: Weapon Components

**Files:**
- Create: `src/engine/components/weapon-components.ts`
- Modify: `src/engine/components/index.ts`
- Test: `tests/engine/components/weapon-components.test.ts`

**Step 1: Write the failing test**

Create `tests/engine/components/weapon-components.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import {
  MissileLauncher, Missile,
  COMPONENT,
} from '../../../src/engine/components';

describe('Weapon Components', () => {
  it('should add MissileLauncher to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const launcher: MissileLauncher = {
      type: 'MissileLauncher',
      salvoSize: 6,
      reloadTime: 30,
      lastFiredTime: 0,
      maxRange: 50_000,
      missileAccel: 0.5,
      ammo: 24,
      seekerRange: 5_000,
      seekerSensitivity: 1e-8,
    };
    world.addComponent(id, launcher);
    const retrieved = world.getComponent<MissileLauncher>(id, COMPONENT.MissileLauncher);
    expect(retrieved).toBeDefined();
    expect(retrieved!.salvoSize).toBe(6);
    expect(retrieved!.ammo).toBe(24);
    expect(retrieved!.seekerRange).toBe(5_000);
  });

  it('should add Missile to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const missile: Missile = {
      type: 'Missile',
      targetId: 'e_99',
      launcherFaction: 'player',
      count: 6,
      fuel: 60,
      accel: 0.5,
      seekerRange: 5_000,
      seekerSensitivity: 1e-8,
      guidanceMode: 'sensor',
      armed: false,
      armingDistance: 5,
    };
    world.addComponent(id, missile);
    const retrieved = world.getComponent<Missile>(id, COMPONENT.Missile);
    expect(retrieved).toBeDefined();
    expect(retrieved!.count).toBe(6);
    expect(retrieved!.guidanceMode).toBe('sensor');
    expect(retrieved!.armed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/components/weapon-components.test.ts`
Expected: FAIL — cannot import MissileLauncher, Missile

**Step 3: Write the weapon components**

Create `src/engine/components/weapon-components.ts`:

```typescript
import { Component, EntityId } from '../types';
import { Faction } from './index';

export interface MissileLauncher extends Component {
  type: 'MissileLauncher';
  salvoSize: number;      // missiles per salvo
  reloadTime: number;     // seconds between salvos
  lastFiredTime: number;  // game time of last launch
  maxRange: number;       // km — fuel-limited max distance
  missileAccel: number;   // km/s² — missile thrust
  ammo: number;           // total missiles remaining
  seekerRange: number;    // km — onboard seeker detection range
  seekerSensitivity: number; // onboard seeker threshold
}

export type GuidanceMode = 'sensor' | 'seeker' | 'ballistic';

export interface Missile extends Component {
  type: 'Missile';
  targetId: EntityId;           // intended target entity
  launcherFaction: Faction;     // faction that launched this salvo
  count: number;                // missiles in salvo (decremented by PDC)
  fuel: number;                 // seconds of burn remaining
  accel: number;                // km/s² thrust
  seekerRange: number;          // km — onboard seeker detection range
  seekerSensitivity: number;    // onboard seeker threshold
  guidanceMode: GuidanceMode;   // current guidance state
  armed: boolean;               // safe until min distance from launcher
  armingDistance: number;        // km — distance from launch point before arming
}
```

**Step 4: Update component index with re-exports and COMPONENT constants**

Modify `src/engine/components/index.ts`:

Add at the top (after existing sensor re-export):
```typescript
export type { MissileLauncher, Missile, GuidanceMode } from './weapon-components';
```

Add to COMPONENT constant object:
```typescript
  MissileLauncher: 'MissileLauncher',
  Missile: 'Missile',
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/engine/components/weapon-components.test.ts`
Expected: PASS (2 tests)

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/engine/components/weapon-components.ts src/engine/components/index.ts tests/engine/components/weapon-components.test.ts
git commit -m "feat: add missile weapon components (MissileLauncher, Missile)"
```

---

### Task 2: MissileSystem — Guidance & Lifecycle

**Files:**
- Create: `src/engine/systems/MissileSystem.ts`
- Test: `tests/engine/systems/MissileSystem.test.ts`

**Context:**
- Proportional navigation: `commandAccel = N * closingSpeed * LOS_rate` where N = 4
- Line-of-sight (LOS) rate = change in bearing angle per second
- Missile steers perpendicular to LOS based on this rate
- Detonation radius: 1 km (direct hit)
- Fuel consumed each tick when throttle > 0
- Ballistic missiles drift until removed after 120s without fuel and no target in seeker range

**Step 1: Write failing tests**

Create `tests/engine/systems/MissileSystem.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { MissileSystem, DETONATION_RADIUS } from '../../../src/engine/systems/MissileSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import {
  Position, Velocity, Ship, Thruster, ThermalSignature,
  Missile, ContactTracker, Facing,
  COMPONENT,
} from '../../../src/engine/components';
import { EntityId, GameEvent } from '../../../src/engine/types';

/** Helper: create a target ship */
function createTargetShip(world: WorldImpl, opts: {
  x: number; y: number;
  vx?: number; vy?: number;
  faction: 'player' | 'enemy';
  baseSignature?: number;
  thrustMultiplier?: number;
  throttle?: number;
}): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Target', hullClass: 'cruiser', faction: opts.faction, flagship: false,
  });
  world.addComponent<Thruster>(id, {
    type: 'Thruster', maxThrust: 0.1, thrustAngle: 0, throttle: opts.throttle ?? 0, rotationSpeed: 0.5,
  });
  world.addComponent<ThermalSignature>(id, {
    type: 'ThermalSignature',
    baseSignature: opts.baseSignature ?? 50,
    thrustMultiplier: opts.thrustMultiplier ?? 200,
  });
  return id;
}

/** Helper: create a missile salvo entity */
function createMissile(world: WorldImpl, opts: {
  x: number; y: number;
  vx?: number; vy?: number;
  targetId: EntityId;
  faction: 'player' | 'enemy';
  fuel?: number;
  count?: number;
  armed?: boolean;
  seekerRange?: number;
  seekerSensitivity?: number;
}): EntityId {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Facing>(id, {
    type: 'Facing', angle: 0,
  });
  world.addComponent<ThermalSignature>(id, {
    type: 'ThermalSignature', baseSignature: 100, thrustMultiplier: 500,
  });
  world.addComponent<Missile>(id, {
    type: 'Missile',
    targetId: opts.targetId,
    launcherFaction: opts.faction,
    count: opts.count ?? 6,
    fuel: opts.fuel ?? 60,
    accel: 0.5,
    seekerRange: opts.seekerRange ?? 5_000,
    seekerSensitivity: opts.seekerSensitivity ?? 1e-8,
    guidanceMode: 'sensor',
    armed: opts.armed ?? true,
    armingDistance: 5,
  });
  return id;
}

function createContactTracker(world: WorldImpl, faction: 'player' | 'enemy'): EntityId {
  const id = world.createEntity();
  world.addComponent<ContactTracker>(id, {
    type: 'ContactTracker', faction, contacts: new Map(),
  });
  return id;
}

describe('MissileSystem', () => {
  it('should steer missile toward target using sensor data', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    // Target at (10000, 0) — stationary
    const targetId = createTargetShip(world, { x: 10_000, y: 0, faction: 'enemy' });

    // Missile at origin moving right
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
    });

    // Player contact tracker has the target
    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 10_000, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.guidanceMode).toBe('sensor');
    // Missile should still have fuel consumed
    expect(missile.fuel).toBeLessThan(60);
  });

  it('should switch to seeker mode when target lost from sensors but in seeker range', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    // Target at (3000, 0) — within seeker range (5000 km), thrusting
    const targetId = createTargetShip(world, {
      x: 3_000, y: 0, faction: 'enemy', throttle: 1.0,
    });

    // Missile at origin
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    // Empty contact tracker — target NOT in faction sensors
    createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    // Target has signature 50 + 1.0*200 = 250, distance 3000
    // signal = 250 / (3000^2) = 250/9e6 = 2.78e-5 > 1e-8 → seeker detects
    expect(missile.guidanceMode).toBe('seeker');
  });

  it('should go ballistic when target lost from sensors and out of seeker range', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    // Target at (100000, 0) — far away, dark (no thrust)
    const targetId = createTargetShip(world, {
      x: 100_000, y: 0, faction: 'enemy', throttle: 0,
    });

    // Missile at origin
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    // Empty contact tracker — target NOT in faction sensors
    createContactTracker(world, 'player');

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.guidanceMode).toBe('ballistic');
  });

  it('should consume fuel each tick', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 10_000, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', fuel: 10,
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 10_000, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.fuel).toBeCloseTo(9.9, 5);
  });

  it('should go ballistic when fuel runs out', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 10_000, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', fuel: 0.05,
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 10_000, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    expect(missile.fuel).toBe(0);
    expect(missile.guidanceMode).toBe('ballistic');
  });

  it('should emit MissileImpact and remove missile on direct hit', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);
    const events: GameEvent[] = [];
    eventBus.on('MissileImpact', (e) => events.push(e));

    // Target at (0.5, 0) — within detonation radius
    const targetId = createTargetShip(world, { x: 0.5, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player',
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 0.5, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('MissileImpact');
    expect(events[0].targetId).toBe(targetId);
    expect(events[0].data.missileCount).toBe(6);
    // Missile entity should be removed
    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(false);
  });

  it('should remove fuel-depleted ballistic missiles after timeout', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);

    const targetId = createTargetShip(world, { x: 100_000, y: 0, faction: 'enemy', throttle: 0 });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', fuel: 0,
    });
    // Force ballistic mode
    const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
    missile.guidanceMode = 'ballistic';

    // Empty tracker — no sensor data
    createContactTracker(world, 'player');

    // First update — not yet timed out
    system.update(world, 0.1, 10.0);
    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(true);

    // After 120+ seconds
    system.update(world, 0.1, 131.0);
    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(false);
  });

  it('should not detonate unarmed missile', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const system = new MissileSystem(eventBus);
    const events: GameEvent[] = [];
    eventBus.on('MissileImpact', (e) => events.push(e));

    // Target very close
    const targetId = createTargetShip(world, { x: 0.5, y: 0, faction: 'enemy' });
    const missileId = createMissile(world, {
      x: 0, y: 0, vx: 5, vy: 0, targetId, faction: 'player', armed: false,
    });

    const trackerId = createContactTracker(world, 'player');
    const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
    tracker.contacts.set(targetId, {
      entityId: targetId,
      lastKnownX: 0.5, lastKnownY: 0,
      lastKnownVx: 0, lastKnownVy: 0,
      detectionTime: 10, receivedTime: 10,
      signalStrength: 0.01, lost: false, lostTime: 0,
    });

    system.update(world, 0.1, 10.0);

    // Should NOT detonate
    expect(events.length).toBe(0);
    expect(world.hasComponent(missileId, COMPONENT.Missile)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/systems/MissileSystem.test.ts`
Expected: FAIL — cannot import MissileSystem

**Step 3: Implement MissileSystem**

Create `src/engine/systems/MissileSystem.ts`:

```typescript
import { World, EntityId } from '../types';
import { EventBus } from '../core/EventBus';
import {
  Position, Velocity, Facing, Ship, Thruster, ThermalSignature,
  Missile, ContactTracker, DetectedContact,
  COMPONENT, Faction,
} from '../components';

export const DETONATION_RADIUS = 1; // km — direct hit required
const NAV_CONSTANT = 4; // proportional navigation gain
const BALLISTIC_TIMEOUT = 120; // seconds before removing fuel-depleted missiles

export class MissileSystem {
  /** Track when each missile went ballistic (entityId → gameTime) */
  private ballisticTimestamps: Map<EntityId, number> = new Map();

  constructor(private eventBus?: EventBus) {}

  update(world: World, dt: number, gameTime: number): void {
    const missileEntities = world.query(COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Missile);
    const toRemove: EntityId[] = [];

    for (const missileId of missileEntities) {
      const pos = world.getComponent<Position>(missileId, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(missileId, COMPONENT.Velocity)!;
      const missile = world.getComponent<Missile>(missileId, COMPONENT.Missile)!;
      const facing = world.getComponent<Facing>(missileId, COMPONENT.Facing);

      // Update arming status based on distance traveled from origin
      if (!missile.armed) {
        const launchDist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        if (launchDist > missile.armingDistance) {
          missile.armed = true;
        }
      }

      // Get target position data
      const targetData = this.getTargetData(world, missile, pos);

      // Update guidance mode
      if (missile.fuel <= 0) {
        missile.guidanceMode = 'ballistic';
      } else if (targetData.source === 'sensor' || targetData.source === 'seeker') {
        missile.guidanceMode = targetData.source;
      } else {
        missile.guidanceMode = 'ballistic';
      }

      // Apply guidance
      if (missile.guidanceMode !== 'ballistic' && missile.fuel > 0 && targetData.position) {
        this.applyProportionalNavigation(vel, facing, pos, targetData.position, targetData.velocity, missile, dt);
        missile.fuel = Math.max(0, missile.fuel - dt);
      }

      // Track ballistic timestamp for timeout removal
      if (missile.guidanceMode === 'ballistic' && missile.fuel <= 0) {
        if (!this.ballisticTimestamps.has(missileId)) {
          this.ballisticTimestamps.set(missileId, gameTime);
        }
        const ballisticStart = this.ballisticTimestamps.get(missileId)!;
        if (gameTime - ballisticStart > BALLISTIC_TIMEOUT) {
          toRemove.push(missileId);
          continue;
        }
      } else {
        this.ballisticTimestamps.delete(missileId);
      }

      // Check detonation
      if (missile.armed && targetData.truePosition) {
        const dx = pos.x - targetData.truePosition.x;
        const dy = pos.y - targetData.truePosition.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= DETONATION_RADIUS) {
          this.eventBus?.emit({
            type: 'MissileImpact',
            time: gameTime,
            entityId: missileId,
            targetId: missile.targetId,
            data: { missileCount: missile.count, faction: missile.launcherFaction },
          });
          toRemove.push(missileId);
          continue;
        }
      }
    }

    // Remove detonated/expired missiles
    for (const id of toRemove) {
      world.removeEntity(id);
      this.ballisticTimestamps.delete(id);
    }
  }

  private getTargetData(
    world: World, missile: Missile, missilePos: Position,
  ): TargetData {
    const result: TargetData = { source: 'none', position: null, velocity: null, truePosition: null };

    // Get true target position (for detonation check)
    const targetPos = world.getComponent<Position>(missile.targetId, COMPONENT.Position);
    const targetVel = world.getComponent<Velocity>(missile.targetId, COMPONENT.Velocity);
    if (targetPos) {
      result.truePosition = { x: targetPos.x, y: targetPos.y };
    }

    // Try faction sensors first (ContactTracker)
    const trackers = world.query(COMPONENT.ContactTracker);
    for (const trackerId of trackers) {
      const tracker = world.getComponent<ContactTracker>(trackerId, COMPONENT.ContactTracker)!;
      if (tracker.faction !== missile.launcherFaction) continue;

      const contact = tracker.contacts.get(missile.targetId);
      if (contact && !contact.lost) {
        result.source = 'sensor';
        result.position = { x: contact.lastKnownX, y: contact.lastKnownY };
        result.velocity = { vx: contact.lastKnownVx, vy: contact.lastKnownVy };
        return result;
      }
    }

    // Try onboard seeker
    if (targetPos) {
      const dx = targetPos.x - missilePos.x;
      const dy = targetPos.y - missilePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= missile.seekerRange && distance > 1) {
        // Compute effective signature of target
        const thermal = world.getComponent<ThermalSignature>(missile.targetId, COMPONENT.ThermalSignature);
        const thruster = world.getComponent<Thruster>(missile.targetId, COMPONENT.Thruster);
        if (thermal) {
          const throttle = thruster?.throttle ?? 0;
          const effectiveSig = thermal.baseSignature + throttle * thermal.thrustMultiplier;
          const signalStrength = effectiveSig / (distance * distance);

          if (signalStrength > missile.seekerSensitivity) {
            result.source = 'seeker';
            result.position = { x: targetPos.x, y: targetPos.y };
            result.velocity = targetVel ? { vx: targetVel.vx, vy: targetVel.vy } : null;
            return result;
          }
        }
      }
    }

    return result;
  }

  private applyProportionalNavigation(
    vel: Velocity,
    facing: Facing | undefined,
    missilePos: Position,
    targetPos: { x: number; y: number },
    targetVel: { vx: number; vy: number } | null,
    missile: Missile,
    dt: number,
  ): void {
    // Vector from missile to target
    const dx = targetPos.x - missilePos.x;
    const dy = targetPos.y - missilePos.y;
    const range = Math.sqrt(dx * dx + dy * dy);
    if (range < 1) return;

    // Line of sight angle
    const losAngle = Math.atan2(dy, dx);

    // Relative velocity
    const relVx = (targetVel?.vx ?? 0) - vel.vx;
    const relVy = (targetVel?.vy ?? 0) - vel.vy;

    // Closing speed (negative = closing)
    const closingSpeed = -(relVx * dx + relVy * dy) / range;

    // LOS rotation rate
    const losRate = (dx * relVy - dy * relVx) / (range * range);

    // Proportional navigation: commanded acceleration perpendicular to LOS
    const commandAccel = NAV_CONSTANT * closingSpeed * losRate;

    // Convert to thrust angle: base direction is toward target, adjust by PN
    const thrustAngle = losAngle + Math.atan2(commandAccel * dt, missile.accel);

    // Apply thrust
    vel.vx += Math.cos(thrustAngle) * missile.accel * dt;
    vel.vy += Math.sin(thrustAngle) * missile.accel * dt;

    // Update facing
    if (facing) {
      facing.angle = Math.atan2(vel.vy, vel.vx);
    }
  }

  /** Clean up tracking state for removed entities */
  cleanup(entityId: EntityId): void {
    this.ballisticTimestamps.delete(entityId);
  }
}

interface TargetData {
  source: 'sensor' | 'seeker' | 'none';
  position: { x: number; y: number } | null;
  velocity: { vx: number; vy: number } | null;
  truePosition: { x: number; y: number } | null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/MissileSystem.test.ts`
Expected: PASS (8 tests)

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/engine/systems/MissileSystem.ts tests/engine/systems/MissileSystem.test.ts
git commit -m "feat: add MissileSystem with proportional navigation and hybrid guidance"
```

---

### Task 3: Missile Launch Command

**Files:**
- Modify: `src/game/CommandHandler.ts`
- Test: `tests/game/CommandHandler.test.ts`

**Context:**
- CommandHandler currently has `issueMoveTo(x, y)` which creates NavigationOrders for selected ships
- Add `launchMissile(targetId)` which creates a Missile salvo entity launched from selected ships with MissileLauncher components
- Missiles spawn at launcher position with launcher's velocity plus a small boost in the target direction

**Step 1: Read current CommandHandler**

Read `src/game/CommandHandler.ts` and `tests/game/CommandHandler.test.ts` before modifying.

**Step 2: Write failing tests**

Add to `tests/game/CommandHandler.test.ts`:

```typescript
import {
  MissileLauncher, Missile, Facing, ThermalSignature,
} from '../../src/engine/components';

describe('CommandHandler - Missile Launch', () => {
  it('should launch missile salvo from selected ship with launcher', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);

    // Create a selected player ship with MissileLauncher
    const shipId = world.createEntity();
    world.addComponent<Position>(shipId, { type: 'Position', x: 0, y: 0, prevX: 0, prevY: 0 });
    world.addComponent<Velocity>(shipId, { type: 'Velocity', vx: 1, vy: 0 });
    world.addComponent<Ship>(shipId, { type: 'Ship', name: 'Test', hullClass: 'cruiser', faction: 'player', flagship: false });
    world.addComponent<Selectable>(shipId, { type: 'Selectable', selected: true });
    world.addComponent<MissileLauncher>(shipId, {
      type: 'MissileLauncher',
      salvoSize: 6, reloadTime: 30, lastFiredTime: 0,
      maxRange: 50_000, missileAccel: 0.5, ammo: 24,
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    // Target entity
    const targetId = world.createEntity();
    world.addComponent<Position>(targetId, { type: 'Position', x: 10_000, y: 0, prevX: 10_000, prevY: 0 });

    handler.launchMissile(targetId, 10.0);

    // Should create a missile entity
    const missiles = world.query(COMPONENT.Missile);
    expect(missiles.length).toBe(1);

    const missile = world.getComponent<Missile>(missiles[0], COMPONENT.Missile)!;
    expect(missile.targetId).toBe(targetId);
    expect(missile.count).toBe(6);
    expect(missile.launcherFaction).toBe('player');

    // Ammo should be decremented
    const launcher = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher)!;
    expect(launcher.ammo).toBe(18);
    expect(launcher.lastFiredTime).toBe(10.0);
  });

  it('should not launch if reload not complete', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);

    const shipId = world.createEntity();
    world.addComponent<Position>(shipId, { type: 'Position', x: 0, y: 0, prevX: 0, prevY: 0 });
    world.addComponent<Velocity>(shipId, { type: 'Velocity', vx: 0, vy: 0 });
    world.addComponent<Ship>(shipId, { type: 'Ship', name: 'Test', hullClass: 'cruiser', faction: 'player', flagship: false });
    world.addComponent<Selectable>(shipId, { type: 'Selectable', selected: true });
    world.addComponent<MissileLauncher>(shipId, {
      type: 'MissileLauncher',
      salvoSize: 6, reloadTime: 30, lastFiredTime: 5.0,
      maxRange: 50_000, missileAccel: 0.5, ammo: 24,
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    const targetId = world.createEntity();
    world.addComponent<Position>(targetId, { type: 'Position', x: 10_000, y: 0, prevX: 10_000, prevY: 0 });

    handler.launchMissile(targetId, 20.0); // 20 - 5 = 15 < 30 reload time

    const missiles = world.query(COMPONENT.Missile);
    expect(missiles.length).toBe(0);
  });

  it('should not launch if no ammo', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);

    const shipId = world.createEntity();
    world.addComponent<Position>(shipId, { type: 'Position', x: 0, y: 0, prevX: 0, prevY: 0 });
    world.addComponent<Velocity>(shipId, { type: 'Velocity', vx: 0, vy: 0 });
    world.addComponent<Ship>(shipId, { type: 'Ship', name: 'Test', hullClass: 'cruiser', faction: 'player', flagship: false });
    world.addComponent<Selectable>(shipId, { type: 'Selectable', selected: true });
    world.addComponent<MissileLauncher>(shipId, {
      type: 'MissileLauncher',
      salvoSize: 6, reloadTime: 30, lastFiredTime: 0,
      maxRange: 50_000, missileAccel: 0.5, ammo: 0,
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });

    const targetId = world.createEntity();
    world.addComponent<Position>(targetId, { type: 'Position', x: 10_000, y: 0, prevX: 10_000, prevY: 0 });

    handler.launchMissile(targetId, 50.0);

    const missiles = world.query(COMPONENT.Missile);
    expect(missiles.length).toBe(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/game/CommandHandler.test.ts`
Expected: FAIL — launchMissile does not exist

**Step 4: Implement launchMissile in CommandHandler**

Add to `src/game/CommandHandler.ts`:

```typescript
import {
  Position, Velocity, Ship, Selectable, Facing,
  NavigationOrder, RotationState, Thruster,
  MissileLauncher, Missile, ThermalSignature,
  COMPONENT,
} from '../engine/components';

// Add method to CommandHandler class:
launchMissile(targetId: EntityId, gameTime: number): void {
  const selected = this.world.query(
    COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
    COMPONENT.Selectable, COMPONENT.MissileLauncher,
  );

  const targetPos = this.world.getComponent<Position>(targetId, COMPONENT.Position);
  if (!targetPos) return;

  for (const shipId of selected) {
    const sel = this.world.getComponent<Selectable>(shipId, COMPONENT.Selectable)!;
    if (!sel.selected) continue;

    const launcher = this.world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher)!;
    const ship = this.world.getComponent<Ship>(shipId, COMPONENT.Ship)!;

    // Check reload and ammo
    if (gameTime - launcher.lastFiredTime < launcher.reloadTime && launcher.lastFiredTime > 0) continue;
    const salvoSize = Math.min(launcher.salvoSize, launcher.ammo);
    if (salvoSize <= 0) continue;

    const pos = this.world.getComponent<Position>(shipId, COMPONENT.Position)!;
    const vel = this.world.getComponent<Velocity>(shipId, COMPONENT.Velocity)!;

    // Direction to target
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0 ? dx / dist : 1;
    const dirY = dist > 0 ? dy / dist : 0;

    // Create missile entity — inherits ship velocity + small initial boost
    const missileId = this.world.createEntity();
    const launchBoost = 0.5; // km/s initial kick
    this.world.addComponent<Position>(missileId, {
      type: 'Position', x: pos.x, y: pos.y, prevX: pos.x, prevY: pos.y,
    });
    this.world.addComponent<Velocity>(missileId, {
      type: 'Velocity',
      vx: vel.vx + dirX * launchBoost,
      vy: vel.vy + dirY * launchBoost,
    });
    this.world.addComponent<Facing>(missileId, {
      type: 'Facing', angle: Math.atan2(dirY, dirX),
    });
    this.world.addComponent<ThermalSignature>(missileId, {
      type: 'ThermalSignature', baseSignature: 100, thrustMultiplier: 500,
    });
    this.world.addComponent<Missile>(missileId, {
      type: 'Missile',
      targetId,
      launcherFaction: ship.faction,
      count: salvoSize,
      fuel: launcher.maxRange / (launcher.missileAccel * 100), // approximate burn time from range
      accel: launcher.missileAccel,
      seekerRange: launcher.seekerRange,
      seekerSensitivity: launcher.seekerSensitivity,
      guidanceMode: 'sensor',
      armed: false,
      armingDistance: 5,
    });

    // Decrement ammo, update fire time
    launcher.ammo -= salvoSize;
    launcher.lastFiredTime = gameTime;
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/game/CommandHandler.test.ts`
Expected: All tests pass

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/game/CommandHandler.ts tests/game/CommandHandler.test.ts
git commit -m "feat: add missile launch command to CommandHandler"
```

---

### Task 4: MissileRenderer

**Files:**
- Create: `src/rendering/MissileRenderer.ts`

**Context:**
- Follow same pattern as ShipRenderer/TrailRenderer: group of Three.js objects, update method
- Each salvo renders as a cluster of small dots with a short trail
- Player missiles: blue-white (0x88bbff), enemy missiles: red-orange (0xff6644)
- Ballistic (no fuel) missiles render dimmer
- Scale dots with zoom like ShipRenderer

**Step 1: Implement MissileRenderer**

Create `src/rendering/MissileRenderer.ts`:

```typescript
import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Velocity, Missile, Facing,
  COMPONENT,
} from '../engine/components';

interface MissileVisual {
  group: THREE.Group;
  dots: THREE.Mesh[];
  trail: THREE.Line;
}

const MISSILE_COLOR_PLAYER = 0x88bbff;
const MISSILE_COLOR_ENEMY = 0xff6644;
const TRAIL_OPACITY = 0.4;
const MAX_TRAIL_POINTS = 50;
const BALLISTIC_OPACITY = 0.3;

export class MissileRenderer {
  private visuals: Map<EntityId, MissileVisual> = new Map();
  private group = new THREE.Group();
  private trailHistory: Map<EntityId, { x: number; y: number }[]> = new Map();
  private tickCounter = 0;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  /** Called each simulation tick to record missile positions for trails. */
  recordPositions(world: World): void {
    this.tickCounter++;
    if (this.tickCounter % 3 !== 0) return; // record every 3 ticks

    const missiles = world.query(COMPONENT.Position, COMPONENT.Missile);
    for (const id of missiles) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      let trail = this.trailHistory.get(id);
      if (!trail) {
        trail = [];
        this.trailHistory.set(id, trail);
      }
      trail.push({ x: pos.x, y: pos.y });
      if (trail.length > MAX_TRAIL_POINTS) {
        trail.shift();
      }
    }
  }

  update(world: World, zoom: number): void {
    const missileEntities = world.query(COMPONENT.Position, COMPONENT.Missile);
    const activeIds = new Set(missileEntities);

    // Remove visuals for dead missiles
    for (const [id, visual] of this.visuals) {
      if (!activeIds.has(id)) {
        this.group.remove(visual.group);
        visual.trail.geometry.dispose();
        for (const dot of visual.dots) {
          dot.geometry.dispose();
        }
        this.visuals.delete(id);
        this.trailHistory.delete(id);
      }
    }

    const dotScale = zoom * 0.005;

    for (const entityId of missileEntities) {
      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const missile = world.getComponent<Missile>(entityId, COMPONENT.Missile)!;

      let visual = this.visuals.get(entityId);
      if (!visual) {
        visual = this.createMissileVisual(missile);
        this.visuals.set(entityId, visual);
        this.group.add(visual.group);
      }

      // Position the group
      visual.group.position.set(pos.x, pos.y, 1.5);

      // Update dot count visibility and scale
      for (let i = 0; i < visual.dots.length; i++) {
        visual.dots[i].visible = i < missile.count;
        visual.dots[i].scale.set(dotScale, dotScale, 1);
      }

      // Dim if ballistic
      const opacity = missile.guidanceMode === 'ballistic' ? BALLISTIC_OPACITY : 0.9;
      for (const dot of visual.dots) {
        (dot.material as THREE.MeshBasicMaterial).opacity = opacity;
      }

      // Update trail
      this.updateTrail(entityId, visual.trail, missile);
    }
  }

  private createMissileVisual(missile: Missile): MissileVisual {
    const group = new THREE.Group();
    const color = missile.launcherFaction === 'player' ? MISSILE_COLOR_PLAYER : MISSILE_COLOR_ENEMY;

    // Create dots in a cluster pattern (max 8 dots)
    const dots: THREE.Mesh[] = [];
    const maxDots = Math.min(missile.count, 8);
    const spread = 0.3; // spread factor, scaled later by zoom
    for (let i = 0; i < maxDots; i++) {
      const angle = (i / maxDots) * Math.PI * 2;
      const offsetX = Math.cos(angle) * spread * (i > 0 ? 1 : 0);
      const offsetY = Math.sin(angle) * spread * (i > 0 ? 1 : 0);

      const geo = new THREE.CircleGeometry(1, 6);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const dot = new THREE.Mesh(geo, mat);
      dot.position.set(offsetX, offsetY, 0);
      dots.push(dot);
      group.add(dot);
    }

    // Trail line
    const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: TRAIL_OPACITY,
    });
    const trail = new THREE.Line(trailGeo, trailMat);
    // Trail is in world space, not relative to group
    this.group.add(trail);

    return { group, dots, trail };
  }

  private updateTrail(entityId: EntityId, trail: THREE.Line, _missile: Missile): void {
    const history = this.trailHistory.get(entityId);
    if (!history || history.length < 2) return;

    const posAttr = trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < history.length; i++) {
      posAttr.setXYZ(i, history[i].x, history[i].y, 1.0);
    }
    posAttr.needsUpdate = true;
    trail.geometry.setDrawRange(0, history.length);
  }

  dispose(): void {
    for (const [, visual] of this.visuals) {
      this.group.remove(visual.group);
      visual.trail.geometry.dispose();
    }
    this.visuals.clear();
    this.trailHistory.clear();
    this.scene.remove(this.group);
  }
}
```

**Step 2: Run build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/rendering/MissileRenderer.ts
git commit -m "feat: add MissileRenderer with salvo dot clusters and trails"
```

---

### Task 5: SpaceWarGame Integration

**Files:**
- Modify: `src/game/SpaceWarGame.ts`

**Step 1: Import and wire MissileSystem and MissileRenderer**

Add imports:
```typescript
import { MissileSystem } from '../engine/systems/MissileSystem';
import { MissileRenderer } from '../rendering/MissileRenderer';
```

Add members:
```typescript
private missileSystem = new MissileSystem(this.eventBus);
private missileRenderer!: MissileRenderer;
```

Initialize in `setupRenderer` after trailRenderer:
```typescript
this.missileRenderer = new MissileRenderer(this.scene);
```

**Step 2: Add MissileSystem to fixedUpdate**

Update `fixedUpdate`:
```typescript
private fixedUpdate(dt: number): void {
  this.sensorSystem.update(this.world, dt, this.gameTime.elapsed);
  this.missileSystem.update(this.world, dt, this.gameTime.elapsed);
  this.navigationSystem.update(this.world, dt, this.gameTime.elapsed);
  this.physicsSystem.update(this.world, dt);
  this.trailRenderer.recordPositions(this.world);
  this.missileRenderer.recordPositions(this.world);
}
```

**Step 3: Add MissileRenderer to render**

Update `render` after trailRenderer.update:
```typescript
this.missileRenderer.update(this.world, zoom);
```

**Step 4: Add missile launch input binding**

In `setupInput`, add a case for a new 'launchMissile' input event, or modify `handleRightClick` to launch missiles when an enemy ship is right-clicked:

```typescript
private handleRightClick(screenX: number, screenY: number): void {
  const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
  const zoom = this.camera.getZoom();
  const pickRadius = zoom * 0.02;

  // Check if we right-clicked on an enemy ship
  const ships = this.world.query(COMPONENT.Position, COMPONENT.Ship);
  let clickedEnemy: string | null = null;
  let closestDist = pickRadius;

  for (const id of ships) {
    const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
    if (ship.faction === 'player') continue;

    const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;

    // For enemy ships visible via fog of war, use detected position
    const playerContacts = this.getPlayerContacts();
    let checkX = pos.x, checkY = pos.y;
    if (playerContacts) {
      const contact = playerContacts.contacts.get(id);
      if (!contact) continue; // can't target undetected ships
      checkX = contact.lastKnownX;
      checkY = contact.lastKnownY;
    }

    const dx = checkX - worldPos.x;
    const dy = checkY - worldPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < closestDist) {
      closestDist = dist;
      clickedEnemy = id;
    }
  }

  if (clickedEnemy) {
    // Right-click on enemy → launch missiles
    this.commandHandler.launchMissile(clickedEnemy, this.gameTime.elapsed);
  } else {
    // Right-click on empty space → move to
    this.commandHandler.issueMoveTo(worldPos.x, worldPos.y);
  }
}
```

**Step 5: Add MissileLauncher components to demo ships**

In `loadDemoScenario`, add to player flagship (cruiser):
```typescript
this.world.addComponent<MissileLauncher>(flagship, {
  type: 'MissileLauncher',
  salvoSize: 6, reloadTime: 30, lastFiredTime: 0,
  maxRange: 50_000, missileAccel: 0.5, ammo: 24,
  seekerRange: 5_000, seekerSensitivity: 1e-8,
});
```

Add to player escort (destroyer):
```typescript
this.world.addComponent<MissileLauncher>(escort, {
  type: 'MissileLauncher',
  salvoSize: 4, reloadTime: 25, lastFiredTime: 0,
  maxRange: 40_000, missileAccel: 0.6, ammo: 16,
  seekerRange: 4_000, seekerSensitivity: 2e-8,
});
```

Add to enemy cruiser:
```typescript
this.world.addComponent<MissileLauncher>(enemy1, {
  type: 'MissileLauncher',
  salvoSize: 6, reloadTime: 30, lastFiredTime: 0,
  maxRange: 50_000, missileAccel: 0.5, ammo: 24,
  seekerRange: 5_000, seekerSensitivity: 1e-8,
});
```

Add to enemy frigate:
```typescript
this.world.addComponent<MissileLauncher>(enemy2, {
  type: 'MissileLauncher',
  salvoSize: 3, reloadTime: 20, lastFiredTime: 0,
  maxRange: 35_000, missileAccel: 0.6, ammo: 12,
  seekerRange: 3_000, seekerSensitivity: 3e-8,
});
```

**Step 6: Add MissileLaunched event emission**

In `CommandHandler.launchMissile`, after creating the missile entity, emit the event if an EventBus is available. Update CommandHandler constructor to accept optional EventBus:

```typescript
constructor(private world: World, private eventBus?: EventBus) {}
```

After creating missile entity:
```typescript
this.eventBus?.emit({
  type: 'MissileLaunched',
  time: gameTime,
  entityId: shipId,
  targetId,
  data: { salvoSize, faction: ship.faction },
});
```

Update SpaceWarGame to pass eventBus to CommandHandler:
```typescript
this.commandHandler = new CommandHandler(this.world, this.eventBus);
```

**Step 7: Build and test**

Run: `npm run build && npm test`
Expected: Build succeeds, all tests pass

**Step 8: Commit**

```bash
git add src/game/SpaceWarGame.ts src/game/CommandHandler.ts
git commit -m "feat: integrate MissileSystem, MissileRenderer, and launch command into game"
```

---

### Task 6: Final Build Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Visual verification**

Run: `npm run dev`

Verify in browser:
- Select a player ship, right-click on an enemy ship → missile salvo launches
- Missiles fly toward the enemy with visible trails
- Missile dots render as a cluster, shrink as count decreases
- Right-click empty space still moves ships (no regression)
- Missiles show blue-white for player, red-orange for enemy
- If missile reaches target, it detonates (entity removed, event fired)

**Step 4: Commit design document**

```bash
git add docs/plans/2026-03-10-phase4-missiles.md
git commit -m "docs: add Phase 4 missiles design and implementation plan"
```
