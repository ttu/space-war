# Phase 2: Navigation & Trajectory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ships execute proper brachistochrone (accelerate-flip-decelerate) trajectories when given move orders, with visual trail rendering.

**Architecture:** New `NavigationOrder` and `RotationState` components track burn plan state. A `TrajectoryCalculator` computes burn plans (pure math, no ECS dependency). A `NavigationSystem` executes plans each tick by controlling thrust/rotation. A `CommandHandler` converts player right-clicks into navigation orders. A `TrailRenderer` shows past trails and projected future paths.

**Tech Stack:** TypeScript, Three.js (lines/points for trails), Vitest

**Key Design:**
- Brachistochrone transfer: accelerate for half the distance, flip ship 180°, decelerate to stop
- Navigation phases: `rotating` → `accelerating` → `flipping` → `decelerating` → `arrived`
- Ship must rotate to thrust direction before burning (respects `rotationSpeed`)
- TrajectoryCalculator is stateless/pure — easy to test
- Gravity is NOT accounted for in trajectory planning (Phase 1 gravity still applies during execution, causing drift — this is intentional for now, realistic correction burns come later)

---

### Task 1: Navigation Components

**Files:**
- Modify: `src/engine/components/index.ts`

**Step 1: Write the failing test**

Create `tests/engine/components/navigation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NavigationOrder, RotationState, COMPONENT } from '../../../src/engine/components';

describe('Navigation Components', () => {
  it('NavigationOrder has correct structure', () => {
    const order: NavigationOrder = {
      type: 'NavigationOrder',
      targetX: 100,
      targetY: 200,
      phase: 'rotating',
      burnPlan: {
        accelTime: 50,
        coastTime: 0,
        decelTime: 50,
        totalTime: 100,
        flipAngle: Math.PI,
        burnDirection: 0.5,
      },
      phaseStartTime: 0,
      arrivalThreshold: 100,
    };
    expect(order.type).toBe('NavigationOrder');
    expect(order.phase).toBe('rotating');
  });

  it('RotationState has correct structure', () => {
    const rot: RotationState = {
      type: 'RotationState',
      currentAngle: 0,
      targetAngle: Math.PI,
      rotating: true,
    };
    expect(rot.type).toBe('RotationState');
    expect(rot.rotating).toBe(true);
  });

  it('COMPONENT constants include new components', () => {
    expect(COMPONENT.NavigationOrder).toBe('NavigationOrder');
    expect(COMPONENT.RotationState).toBe('RotationState');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/components/navigation.test.ts`
Expected: FAIL — `NavigationOrder` and `RotationState` not exported

**Step 3: Write minimal implementation**

Add to `src/engine/components/index.ts`:

```typescript
// --- Navigation ---

export type NavPhase = 'rotating' | 'accelerating' | 'flipping' | 'decelerating' | 'arrived';

export interface BurnPlan {
  accelTime: number;    // seconds of acceleration burn
  coastTime: number;    // seconds of coasting (zero for brachistochrone)
  decelTime: number;    // seconds of deceleration burn
  totalTime: number;    // total transit time
  flipAngle: number;    // angle to rotate to for decel (usually accelAngle + PI)
  burnDirection: number; // angle in radians for acceleration thrust
}

export interface NavigationOrder extends Component {
  type: 'NavigationOrder';
  targetX: number;
  targetY: number;
  phase: NavPhase;
  burnPlan: BurnPlan;
  phaseStartTime: number; // game time when current phase started
  arrivalThreshold: number; // km — close enough to consider arrived
}

export interface RotationState extends Component {
  type: 'RotationState';
  currentAngle: number;  // current facing in radians
  targetAngle: number;   // desired facing in radians
  rotating: boolean;
}
```

Add to `COMPONENT` const:

```typescript
NavigationOrder: 'NavigationOrder',
RotationState: 'RotationState',
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/components/navigation.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add NavigationOrder and RotationState components
```

---

### Task 2: TrajectoryCalculator — Core Math

**Files:**
- Create: `src/game/TrajectoryCalculator.ts`
- Create: `tests/game/TrajectoryCalculator.test.ts`

**Step 1: Write the failing tests**

Create `tests/game/TrajectoryCalculator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeBurnPlan,
  angleBetweenPoints,
  normalizeAngle,
  shortestAngleDelta,
} from '../../src/game/TrajectoryCalculator';

describe('TrajectoryCalculator', () => {
  describe('normalizeAngle', () => {
    it('wraps angles to [0, 2π)', () => {
      expect(normalizeAngle(0)).toBeCloseTo(0);
      expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
      expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5);
    });
  });

  describe('shortestAngleDelta', () => {
    it('returns shortest rotation from current to target', () => {
      // 0 to PI/2 → positive (counterclockwise)
      expect(shortestAngleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
      // 0 to -PI/2 (= 3PI/2) → negative (clockwise)
      expect(shortestAngleDelta(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
      // PI to 0 → negative
      expect(shortestAngleDelta(Math.PI, 0)).toBeCloseTo(-Math.PI);
    });
  });

  describe('angleBetweenPoints', () => {
    it('calculates angle from origin to target', () => {
      expect(angleBetweenPoints(0, 0, 100, 0)).toBeCloseTo(0);
      expect(angleBetweenPoints(0, 0, 0, 100)).toBeCloseTo(Math.PI / 2);
      expect(angleBetweenPoints(0, 0, -100, 0)).toBeCloseTo(Math.PI);
    });
  });

  describe('computeBurnPlan', () => {
    it('computes brachistochrone for stationary ship', () => {
      const plan = computeBurnPlan(
        0, 0,     // ship position
        0, 0,     // ship velocity (stationary)
        10000, 0, // target position (10,000 km away)
        0.1,      // maxAccel 0.1 km/s²
      );

      // d = 10000 km, a = 0.1 km/s²
      // Half distance = 5000, t_half = sqrt(2*5000/0.1) = sqrt(100000) ≈ 316.2s
      // Total ≈ 632.5s
      expect(plan.accelTime).toBeCloseTo(316.23, 0);
      expect(plan.decelTime).toBeCloseTo(316.23, 0);
      expect(plan.coastTime).toBe(0);
      expect(plan.totalTime).toBeCloseTo(632.46, 0);
      expect(plan.burnDirection).toBeCloseTo(0); // thrust toward target
      expect(plan.flipAngle).toBeCloseTo(Math.PI); // flip 180° to decel
    });

    it('accounts for existing velocity toward target', () => {
      const plan = computeBurnPlan(
        0, 0,
        1, 0,     // already moving toward target at 1 km/s
        10000, 0,
        0.1,
      );
      // Should need less total time since already moving toward target
      const stationaryPlan = computeBurnPlan(0, 0, 0, 0, 10000, 0, 0.1);
      expect(plan.totalTime).toBeLessThan(stationaryPlan.totalTime);
    });

    it('handles ship moving away from target', () => {
      const plan = computeBurnPlan(
        0, 0,
        -5, 0,    // moving away from target at 5 km/s
        10000, 0,
        0.1,
      );
      // Should need more total time to first cancel velocity then approach
      const stationaryPlan = computeBurnPlan(0, 0, 0, 0, 10000, 0, 0.1);
      expect(plan.totalTime).toBeGreaterThan(stationaryPlan.totalTime);
    });

    it('returns minimal plan for very close target', () => {
      const plan = computeBurnPlan(0, 0, 0, 0, 10, 0, 0.1);
      expect(plan.totalTime).toBeGreaterThan(0);
      expect(plan.accelTime).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/TrajectoryCalculator.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/game/TrajectoryCalculator.ts`:

```typescript
import { BurnPlan } from '../engine/components';

const TWO_PI = Math.PI * 2;

/** Normalize angle to [0, 2π) */
export function normalizeAngle(angle: number): number {
  const a = angle % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Shortest signed rotation from `from` to `to` in [-π, π] */
export function shortestAngleDelta(from: number, to: number): number {
  const diff = normalizeAngle(to) - normalizeAngle(from);
  if (diff > Math.PI) return diff - TWO_PI;
  if (diff < -Math.PI) return diff + TWO_PI;
  return diff;
}

/** Angle from point (x1,y1) to (x2,y2) */
export function angleBetweenPoints(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  return normalizeAngle(Math.atan2(y2 - y1, x2 - x1));
}

/**
 * Compute a brachistochrone burn plan to reach target from current state.
 *
 * Strategy:
 * 1. Project current velocity onto the direction toward target
 * 2. Compute time to accelerate to midpoint, then decelerate to stop
 * 3. Account for velocity component along the travel direction
 *
 * Simplifications:
 * - Ignores gravity (correction burns happen naturally during execution)
 * - Assumes constant max acceleration
 * - No coast phase (full brachistochrone)
 */
export function computeBurnPlan(
  px: number, py: number,
  vx: number, vy: number,
  tx: number, ty: number,
  maxAccel: number,
): BurnPlan {
  const dx = tx - px;
  const dy = ty - py;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const burnDirection = normalizeAngle(Math.atan2(dy, dx));
  const flipAngle = normalizeAngle(burnDirection + Math.PI);

  if (distance < 1) {
    return {
      accelTime: 0,
      coastTime: 0,
      decelTime: 0,
      totalTime: 0,
      flipAngle,
      burnDirection,
    };
  }

  // Project current velocity onto travel direction
  const dirX = dx / distance;
  const dirY = dy / distance;
  const vAlongDir = vx * dirX + vy * dirY;

  // Effective distance accounting for current velocity:
  // We need to solve: accelerate from vAlongDir to some peak velocity,
  // then decelerate from peak to 0, covering total `distance`.
  //
  // With acceleration a:
  //   During accel phase (time t1): distance1 = vAlongDir*t1 + 0.5*a*t1², final_v = vAlongDir + a*t1
  //   During decel phase (time t2): distance2 = final_v*t2 - 0.5*a*t2², final_v - a*t2 = 0 → t2 = final_v/a
  //
  // total_distance = distance1 + distance2
  // Substituting final_v = vAlongDir + a*t1 and t2 = (vAlongDir + a*t1)/a:
  //   d = vAlongDir*t1 + 0.5*a*t1² + (vAlongDir + a*t1)²/(2a)
  //   d = vAlongDir*t1 + 0.5*a*t1² + (v² + 2*v*a*t1 + a²*t1²)/(2a)
  //   d = vAlongDir*t1 + 0.5*a*t1² + v²/(2a) + v*t1 + 0.5*a*t1²
  //   d = 2*vAlongDir*t1 + a*t1² + v²/(2a)
  //
  // Solving quadratic: a*t1² + 2*v*t1 + (v²/(2a) - d) = 0

  const a = maxAccel;
  const v = vAlongDir;

  const qa = a;
  const qb = 2 * v;
  const qc = (v * v) / (2 * a) - distance;

  const discriminant = qb * qb - 4 * qa * qc;

  let accelTime: number;
  if (discriminant < 0) {
    // Shouldn't happen for valid inputs, fallback to simple estimate
    accelTime = Math.sqrt(distance / a);
  } else {
    const sqrtDisc = Math.sqrt(discriminant);
    const t1a = (-qb + sqrtDisc) / (2 * qa);
    const t1b = (-qb - sqrtDisc) / (2 * qa);
    // Pick the positive solution
    accelTime = t1a > 0 ? t1a : t1b > 0 ? t1b : Math.sqrt(distance / a);
  }

  accelTime = Math.max(0, accelTime);
  const peakV = v + a * accelTime;
  const decelTime = Math.max(0, peakV / a);

  return {
    accelTime,
    coastTime: 0,
    decelTime,
    totalTime: accelTime + decelTime,
    flipAngle,
    burnDirection,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/TrajectoryCalculator.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add TrajectoryCalculator with brachistochrone burn planning
```

---

### Task 3: NavigationSystem — Execute Burn Plans

**Files:**
- Create: `src/engine/systems/NavigationSystem.ts`
- Create: `tests/engine/systems/NavigationSystem.test.ts`

**Step 1: Write the failing tests**

Create `tests/engine/systems/NavigationSystem.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { NavigationSystem } from '../../../src/engine/systems/NavigationSystem';
import {
  Position, Velocity, Thruster, NavigationOrder, RotationState, COMPONENT,
} from '../../../src/engine/components';

function createShipWithNav(world: WorldImpl, opts: {
  px?: number; py?: number; vx?: number; vy?: number;
  maxThrust?: number; rotationSpeed?: number;
  targetX?: number; targetY?: number;
  phase?: NavigationOrder['phase'];
  burnDirection?: number; flipAngle?: number;
  accelTime?: number; decelTime?: number;
  currentAngle?: number;
}) {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts.px ?? 0, y: opts.py ?? 0, prevX: 0, prevY: 0,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
  });
  world.addComponent<Thruster>(id, {
    type: 'Thruster',
    maxThrust: opts.maxThrust ?? 0.1,
    thrustAngle: 0,
    throttle: 0,
    rotationSpeed: opts.rotationSpeed ?? 1.0,
  });
  world.addComponent<NavigationOrder>(id, {
    type: 'NavigationOrder',
    targetX: opts.targetX ?? 10000,
    targetY: opts.targetY ?? 0,
    phase: opts.phase ?? 'rotating',
    burnPlan: {
      accelTime: opts.accelTime ?? 100,
      coastTime: 0,
      decelTime: opts.decelTime ?? 100,
      totalTime: (opts.accelTime ?? 100) + (opts.decelTime ?? 100),
      burnDirection: opts.burnDirection ?? 0,
      flipAngle: opts.flipAngle ?? Math.PI,
    },
    phaseStartTime: 0,
    arrivalThreshold: 100,
  });
  world.addComponent<RotationState>(id, {
    type: 'RotationState',
    currentAngle: opts.currentAngle ?? 0,
    targetAngle: opts.burnDirection ?? 0,
    rotating: false,
  });
  return id;
}

describe('NavigationSystem', () => {
  it('sets throttle during acceleration phase', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, { phase: 'accelerating' });

    system.update(world, 1, 10);

    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    expect(thruster.throttle).toBe(1);
    expect(thruster.thrustAngle).toBe(0); // burnDirection
  });

  it('flips thrust direction during deceleration', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, {
      phase: 'decelerating',
      burnDirection: 0,
      flipAngle: Math.PI,
    });

    system.update(world, 1, 10);

    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    expect(thruster.throttle).toBe(1);
    expect(thruster.thrustAngle).toBeCloseTo(Math.PI); // reversed
  });

  it('stops thrust when arrived', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, {
      px: 9990, py: 0,
      targetX: 10000, targetY: 0,
      phase: 'decelerating',
      vx: 0.01, vy: 0,
    });

    system.update(world, 1, 10);

    // Should detect arrival (within threshold) and stop
    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    // NavigationOrder should be removed when arrived
    const thruster = world.getComponent<Thruster>(id, COMPONENT.Thruster)!;
    if (!nav) {
      expect(thruster.throttle).toBe(0);
    } else {
      expect(nav.phase).toBe('arrived');
    }
  });

  it('rotates ship toward burn direction before accelerating', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, {
      phase: 'rotating',
      burnDirection: Math.PI / 2,
      currentAngle: 0,
      rotationSpeed: 1.0,
    });

    system.update(world, 0.5, 5);

    const rot = world.getComponent<RotationState>(id, COMPONENT.RotationState)!;
    // Should have rotated 0.5 radians toward PI/2
    expect(rot.currentAngle).toBeCloseTo(0.5);
    expect(rot.rotating).toBe(true);
  });

  it('transitions from rotating to accelerating when aligned', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, {
      phase: 'rotating',
      burnDirection: 0.05,
      currentAngle: 0,
      rotationSpeed: 1.0,
    });

    // With rotation speed 1.0 and dt 1.0, ship rotates 1 radian
    // Target is only 0.05 radians away — should snap and transition
    system.update(world, 1.0, 10);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
    expect(nav.phase).toBe('accelerating');
  });

  it('transitions from accelerating to flipping after accelTime', () => {
    const world = new WorldImpl();
    const system = new NavigationSystem();
    const id = createShipWithNav(world, {
      phase: 'accelerating',
      accelTime: 100,
    });

    // Simulate 100+ seconds of game time
    system.update(world, 1, 101);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder)!;
    expect(nav.phase).toBe('flipping');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/systems/NavigationSystem.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/engine/systems/NavigationSystem.ts`:

```typescript
import { World, EntityId } from '../types';
import {
  Position, Velocity, Thruster, NavigationOrder, RotationState,
  COMPONENT, NavPhase,
} from '../components';
import { shortestAngleDelta, normalizeAngle } from '../../game/TrajectoryCalculator';

const ALIGNMENT_THRESHOLD = 0.05; // radians — close enough to "aligned"
const ARRIVAL_SPEED_THRESHOLD = 0.5; // km/s — slow enough to consider stopped

export class NavigationSystem {
  update(world: World, dt: number, gameTime: number): void {
    const entities = world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Thruster,
      COMPONENT.NavigationOrder, COMPONENT.RotationState,
    );

    for (const entityId of entities) {
      this.updateEntity(world, entityId, dt, gameTime);
    }
  }

  private updateEntity(
    world: World, entityId: EntityId, dt: number, gameTime: number,
  ): void {
    const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity)!;
    const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster)!;
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder)!;
    const rot = world.getComponent<RotationState>(entityId, COMPONENT.RotationState)!;

    // Check arrival: close to target and slow enough
    const dx = nav.targetX - pos.x;
    const dy = nav.targetY - pos.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);

    if (distToTarget < nav.arrivalThreshold && speed < ARRIVAL_SPEED_THRESHOLD) {
      this.arrive(world, entityId, thruster);
      return;
    }

    switch (nav.phase) {
      case 'rotating':
        this.handleRotating(world, entityId, nav, rot, thruster, dt, gameTime);
        break;
      case 'accelerating':
        this.handleAccelerating(nav, rot, thruster, gameTime);
        break;
      case 'flipping':
        this.handleFlipping(world, entityId, nav, rot, thruster, dt, gameTime);
        break;
      case 'decelerating':
        this.handleDecelerating(nav, thruster, pos, vel, world, entityId);
        break;
      case 'arrived':
        thruster.throttle = 0;
        break;
    }
  }

  private handleRotating(
    _world: World, _entityId: EntityId,
    nav: NavigationOrder, rot: RotationState, thruster: Thruster,
    dt: number, gameTime: number,
  ): void {
    thruster.throttle = 0;
    rot.targetAngle = nav.burnPlan.burnDirection;
    const rotated = this.rotateToward(rot, thruster.rotationSpeed, dt);

    if (rotated) {
      nav.phase = 'accelerating';
      nav.phaseStartTime = gameTime;
      rot.rotating = false;
    }
  }

  private handleAccelerating(
    nav: NavigationOrder, rot: RotationState, thruster: Thruster,
    gameTime: number,
  ): void {
    thruster.thrustAngle = nav.burnPlan.burnDirection;
    thruster.throttle = 1;
    rot.currentAngle = nav.burnPlan.burnDirection;

    const elapsed = gameTime - nav.phaseStartTime;
    if (elapsed >= nav.burnPlan.accelTime) {
      nav.phase = 'flipping';
      nav.phaseStartTime = gameTime;
      thruster.throttle = 0;
    }
  }

  private handleFlipping(
    _world: World, _entityId: EntityId,
    nav: NavigationOrder, rot: RotationState, thruster: Thruster,
    dt: number, gameTime: number,
  ): void {
    thruster.throttle = 0;
    rot.targetAngle = nav.burnPlan.flipAngle;
    const rotated = this.rotateToward(rot, thruster.rotationSpeed, dt);

    if (rotated) {
      nav.phase = 'decelerating';
      nav.phaseStartTime = gameTime;
      rot.rotating = false;
    }
  }

  private handleDecelerating(
    nav: NavigationOrder, thruster: Thruster,
    _pos: Position, _vel: Velocity,
    _world: World, _entityId: EntityId,
  ): void {
    thruster.thrustAngle = nav.burnPlan.flipAngle;
    thruster.throttle = 1;
  }

  private arrive(world: World, entityId: EntityId, thruster: Thruster): void {
    thruster.throttle = 0;
    world.removeComponent(entityId, COMPONENT.NavigationOrder);
  }

  /**
   * Rotate currentAngle toward targetAngle at given speed.
   * Returns true if aligned (within threshold).
   */
  private rotateToward(rot: RotationState, speed: number, dt: number): boolean {
    const delta = shortestAngleDelta(rot.currentAngle, rot.targetAngle);
    const absDelta = Math.abs(delta);

    if (absDelta < ALIGNMENT_THRESHOLD) {
      rot.currentAngle = normalizeAngle(rot.targetAngle);
      rot.rotating = false;
      return true;
    }

    const step = speed * dt;
    if (step >= absDelta) {
      rot.currentAngle = normalizeAngle(rot.targetAngle);
      rot.rotating = false;
      return true;
    }

    rot.currentAngle = normalizeAngle(rot.currentAngle + Math.sign(delta) * step);
    rot.rotating = true;
    return false;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/NavigationSystem.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add NavigationSystem for executing burn plans
```

---

### Task 4: CommandHandler — Player Input to Navigation Orders

**Files:**
- Create: `src/game/CommandHandler.ts`
- Create: `tests/game/CommandHandler.test.ts`
- Modify: `src/game/SpaceWarGame.ts` — replace `handleRightClick` body

**Step 1: Write the failing tests**

Create `tests/game/CommandHandler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../src/engine/ecs/World';
import { CommandHandler } from '../../src/game/CommandHandler';
import {
  Position, Velocity, Ship, Thruster, Selectable, NavigationOrder, RotationState,
  COMPONENT,
} from '../../src/engine/components';

function createPlayerShip(world: WorldImpl, opts?: { x?: number; y?: number; vx?: number; vy?: number }) {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts?.x ?? 0, y: opts?.y ?? 0, prevX: 0, prevY: 0,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts?.vx ?? 0, vy: opts?.vy ?? 0,
  });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Test', hullClass: 'destroyer', faction: 'player', flagship: false,
  });
  world.addComponent<Thruster>(id, {
    type: 'Thruster', maxThrust: 0.1, thrustAngle: 0, throttle: 0, rotationSpeed: 0.5,
  });
  world.addComponent<Selectable>(id, {
    type: 'Selectable', selected: true,
  });
  world.addComponent<RotationState>(id, {
    type: 'RotationState', currentAngle: 0, targetAngle: 0, rotating: false,
  });
  return id;
}

describe('CommandHandler', () => {
  it('issues NavigationOrder to selected player ships on moveTo', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id = createPlayerShip(world);

    handler.issueMoveTo(10000, 0);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    expect(nav!.targetX).toBe(10000);
    expect(nav!.targetY).toBe(0);
    expect(nav!.phase).toBe('rotating');
    expect(nav!.burnPlan.accelTime).toBeGreaterThan(0);
  });

  it('does not issue orders to unselected ships', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id = createPlayerShip(world);
    const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
    sel.selected = false;

    handler.issueMoveTo(10000, 0);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeUndefined();
  });

  it('does not issue orders to enemy ships', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id = createPlayerShip(world);
    const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
    (ship as { faction: string }).faction = 'enemy';

    handler.issueMoveTo(10000, 0);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeUndefined();
  });

  it('replaces existing NavigationOrder', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    createPlayerShip(world);

    handler.issueMoveTo(10000, 0);
    handler.issueMoveTo(5000, 5000);

    const entities = world.query(COMPONENT.NavigationOrder);
    expect(entities).toHaveLength(1);
    const nav = world.getComponent<NavigationOrder>(entities[0], COMPONENT.NavigationOrder)!;
    expect(nav.targetX).toBe(5000);
    expect(nav.targetY).toBe(5000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/CommandHandler.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/game/CommandHandler.ts`:

```typescript
import { World } from '../engine/types';
import {
  Position, Velocity, Ship, Thruster, Selectable,
  NavigationOrder, RotationState, COMPONENT,
} from '../engine/components';
import { computeBurnPlan, angleBetweenPoints } from './TrajectoryCalculator';

export class CommandHandler {
  constructor(private world: World) {}

  /** Issue a move-to order to all selected player ships. */
  issueMoveTo(targetX: number, targetY: number): void {
    const ships = this.world.query(
      COMPONENT.Position, COMPONENT.Velocity, COMPONENT.Ship,
      COMPONENT.Thruster, COMPONENT.Selectable,
    );

    for (const id of ships) {
      const sel = this.world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (!sel.selected) continue;

      const ship = this.world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;

      const pos = this.world.getComponent<Position>(id, COMPONENT.Position)!;
      const vel = this.world.getComponent<Velocity>(id, COMPONENT.Velocity)!;
      const thruster = this.world.getComponent<Thruster>(id, COMPONENT.Thruster)!;

      const burnPlan = computeBurnPlan(
        pos.x, pos.y,
        vel.vx, vel.vy,
        targetX, targetY,
        thruster.maxThrust,
      );

      // Remove existing nav order if present
      if (this.world.hasComponent(id, COMPONENT.NavigationOrder)) {
        this.world.removeComponent(id, COMPONENT.NavigationOrder);
      }

      this.world.addComponent<NavigationOrder>(id, {
        type: 'NavigationOrder',
        targetX,
        targetY,
        phase: 'rotating',
        burnPlan,
        phaseStartTime: 0,
        arrivalThreshold: 100,
      });

      // Ensure RotationState exists
      if (!this.world.hasComponent(id, COMPONENT.RotationState)) {
        const currentAngle = angleBetweenPoints(0, 0, vel.vx, vel.vy);
        this.world.addComponent<RotationState>(id, {
          type: 'RotationState',
          currentAngle: currentAngle || 0,
          targetAngle: burnPlan.burnDirection,
          rotating: false,
        });
      } else {
        const rot = this.world.getComponent<RotationState>(id, COMPONENT.RotationState)!;
        rot.targetAngle = burnPlan.burnDirection;
      }

      // Cancel current thrust
      thruster.throttle = 0;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game/CommandHandler.test.ts`
Expected: PASS

**Step 5: Wire into SpaceWarGame**

Modify `src/game/SpaceWarGame.ts`:
- Import `CommandHandler` and `NavigationSystem`
- Add `RotationState` component to demo ships
- Replace `handleRightClick` body with `commandHandler.issueMoveTo(worldPos.x, worldPos.y)`
- Add `navigationSystem.update()` call in `fixedUpdate()`

**Step 6: Commit**

```
feat: add CommandHandler and wire navigation into game loop
```

---

### Task 5: TrailRenderer — Visual Trails and Projected Paths

**Files:**
- Create: `src/rendering/TrailRenderer.ts`
- Modify: `src/game/SpaceWarGame.ts` — add TrailRenderer

**Step 1: Write the failing test**

Create `tests/rendering/TrailRenderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TrailStore } from '../../src/rendering/TrailRenderer';

describe('TrailStore', () => {
  it('records positions', () => {
    const store = new TrailStore(100);
    store.record('e_0', 10, 20);
    store.record('e_0', 30, 40);
    const trail = store.getTrail('e_0');
    expect(trail).toHaveLength(2);
    expect(trail[0]).toEqual({ x: 10, y: 20 });
    expect(trail[1]).toEqual({ x: 30, y: 40 });
  });

  it('limits trail length', () => {
    const store = new TrailStore(3);
    store.record('e_0', 0, 0);
    store.record('e_0', 1, 1);
    store.record('e_0', 2, 2);
    store.record('e_0', 3, 3);
    const trail = store.getTrail('e_0');
    expect(trail).toHaveLength(3);
    expect(trail[0]).toEqual({ x: 1, y: 1 });
  });

  it('returns empty array for unknown entity', () => {
    const store = new TrailStore(100);
    expect(store.getTrail('unknown')).toEqual([]);
  });

  it('removes entity trail', () => {
    const store = new TrailStore(100);
    store.record('e_0', 10, 20);
    store.remove('e_0');
    expect(store.getTrail('e_0')).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendering/TrailRenderer.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/rendering/TrailRenderer.ts`:

```typescript
import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Velocity, Ship, Thruster, NavigationOrder,
  COMPONENT,
} from '../engine/components';

interface TrailPoint {
  x: number;
  y: number;
}

/** Stores trail position history per entity. Separated for testability. */
export class TrailStore {
  private trails: Map<EntityId, TrailPoint[]> = new Map();

  constructor(private maxLength: number) {}

  record(entityId: EntityId, x: number, y: number): void {
    let trail = this.trails.get(entityId);
    if (!trail) {
      trail = [];
      this.trails.set(entityId, trail);
    }
    trail.push({ x, y });
    if (trail.length > this.maxLength) {
      trail.shift();
    }
  }

  getTrail(entityId: EntityId): TrailPoint[] {
    return this.trails.get(entityId) ?? [];
  }

  remove(entityId: EntityId): void {
    this.trails.delete(entityId);
  }

  entities(): EntityId[] {
    return Array.from(this.trails.keys());
  }
}

const TRAIL_COLOR_PLAYER = 0x4488cc;
const TRAIL_COLOR_ENEMY = 0xcc4444;
const PROJECTION_COLOR = 0xffcc44;
const TRAIL_OPACITY = 0.3;
const PROJECTION_OPACITY = 0.4;
const MAX_TRAIL_POINTS = 200;
const PROJECTION_STEPS = 60;
const PROJECTION_DT = 2; // seconds per step

export class TrailRenderer {
  private group = new THREE.Group();
  private trailStore = new TrailStore(MAX_TRAIL_POINTS);
  private trailLines: Map<EntityId, THREE.Line> = new Map();
  private projectionLines: Map<EntityId, THREE.Line> = new Map();
  private tickCounter = 0;
  private recordInterval = 5; // Record every N ticks

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  /** Called each simulation tick to record ship positions. */
  recordPositions(world: World): void {
    this.tickCounter++;
    if (this.tickCounter % this.recordInterval !== 0) return;

    const ships = world.query(COMPONENT.Position, COMPONENT.Ship);
    for (const id of ships) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      this.trailStore.record(id, pos.x, pos.y);
    }
  }

  /** Called each render frame to update trail and projection visuals. */
  update(world: World, zoom: number): void {
    const ships = world.query(COMPONENT.Position, COMPONENT.Ship);
    const activeIds = new Set(ships);

    // Clean up dead entities
    for (const [id, line] of this.trailLines) {
      if (!activeIds.has(id)) {
        this.group.remove(line);
        this.trailLines.delete(id);
        this.trailStore.remove(id);
      }
    }
    for (const [id, line] of this.projectionLines) {
      if (!activeIds.has(id)) {
        this.group.remove(line);
        this.projectionLines.delete(id);
      }
    }

    for (const entityId of ships) {
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship)!;
      this.updateTrailLine(entityId, ship.faction === 'player' ? TRAIL_COLOR_PLAYER : TRAIL_COLOR_ENEMY);
      this.updateProjectionLine(world, entityId, zoom);
    }
  }

  private updateTrailLine(entityId: EntityId, color: number): void {
    const trail = this.trailStore.getTrail(entityId);
    if (trail.length < 2) return;

    let line = this.trailLines.get(entityId);
    if (!line) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: TRAIL_OPACITY,
      });
      line = new THREE.Line(geo, mat);
      this.trailLines.set(entityId, line);
      this.group.add(line);
    }

    const positions = new Float32Array(trail.length * 3);
    for (let i = 0; i < trail.length; i++) {
      positions[i * 3] = trail[i].x;
      positions[i * 3 + 1] = trail[i].y;
      positions[i * 3 + 2] = 0.5;
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  private updateProjectionLine(world: World, entityId: EntityId, _zoom: number): void {
    const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity);
    const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster);
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder);

    // Only show projection for ships with velocity or active navigation
    if (!vel) return;
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
    if (speed < 0.01 && !nav) {
      // Remove projection line if it exists
      const existing = this.projectionLines.get(entityId);
      if (existing) {
        existing.visible = false;
      }
      return;
    }

    let line = this.projectionLines.get(entityId);
    if (!line) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineDashedMaterial({
        color: PROJECTION_COLOR,
        transparent: true,
        opacity: PROJECTION_OPACITY,
        dashSize: 500,
        gapSize: 300,
      });
      line = new THREE.Line(geo, mat);
      this.projectionLines.set(entityId, line);
      this.group.add(line);
    }

    line.visible = true;

    // Simple projection: extrapolate current velocity (and thrust if navigating)
    const points = this.projectPath(pos, vel, thruster, nav);
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = 0.3;
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    line.computeLineDistances();
  }

  private projectPath(
    pos: Position, vel: Velocity,
    thruster: Thruster | undefined,
    nav: NavigationOrder | undefined,
  ): TrailPoint[] {
    const points: TrailPoint[] = [{ x: pos.x, y: pos.y }];
    let px = pos.x, py = pos.y;
    let vx = vel.vx, vy = vel.vy;

    for (let i = 0; i < PROJECTION_STEPS; i++) {
      // Apply current thrust if active
      if (thruster && thruster.throttle > 0) {
        const accel = thruster.maxThrust * thruster.throttle;
        vx += Math.cos(thruster.thrustAngle) * accel * PROJECTION_DT;
        vy += Math.sin(thruster.thrustAngle) * accel * PROJECTION_DT;
      }

      px += vx * PROJECTION_DT;
      py += vy * PROJECTION_DT;
      points.push({ x: px, y: py });

      // Stop projection if we've reached nav target
      if (nav) {
        const dx = nav.targetX - px;
        const dy = nav.targetY - py;
        if (Math.sqrt(dx * dx + dy * dy) < nav.arrivalThreshold) break;
      }
    }

    return points;
  }

  dispose(): void {
    for (const [, line] of this.trailLines) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    for (const [, line] of this.projectionLines) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    this.trailLines.clear();
    this.projectionLines.clear();
    this.scene.remove(this.group);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rendering/TrailRenderer.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add TrailRenderer with position history and projected paths
```

---

### Task 6: Wire Everything Together + Polish

**Files:**
- Modify: `src/game/SpaceWarGame.ts`
- Modify: `src/engine/components/index.ts` (add RotationState to demo ships)

**Step 1: Update SpaceWarGame imports and wiring**

Changes to `src/game/SpaceWarGame.ts`:

1. Add imports for `NavigationSystem`, `CommandHandler`, `TrailRenderer`, `RotationState`
2. Add class fields:
   - `private navigationSystem = new NavigationSystem();`
   - `private commandHandler!: CommandHandler;`
   - `private trailRenderer!: TrailRenderer;`
3. In constructor, after `this.loadDemoScenario()`:
   - `this.commandHandler = new CommandHandler(this.world);`
4. In `setupRenderer()`:
   - `this.trailRenderer = new TrailRenderer(this.scene);`
5. Replace `handleRightClick` body:
   ```typescript
   const worldPos = this.camera.screenToWorld(screenX, screenY, this.canvas);
   this.commandHandler.issueMoveTo(worldPos.x, worldPos.y);
   ```
6. In `fixedUpdate(dt)`:
   ```typescript
   this.navigationSystem.update(this.world, dt, this.gameTime.elapsed);
   this.physicsSystem.update(this.world, dt);
   this.trailRenderer.recordPositions(this.world);
   ```
7. In `render(alpha)` after other renderers:
   ```typescript
   this.trailRenderer.update(this.world, zoom);
   ```
8. Add `RotationState` component to all ships in `loadDemoScenario()`

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 3: Run build**

Run: `npm run build`
Expected: Success

**Step 4: Manual verification**

Run: `npm run dev`
Verify:
- Right-click sets destination → ship rotates toward target, accelerates, flips at midpoint, decelerates to stop
- Trajectory projection shows as dotted line
- Past trail shown as fading line behind ship
- Multiple ships can be ordered simultaneously
- Pause still works during navigation

**Step 5: Commit**

```
feat: wire Phase 2 navigation into game — brachistochrone trajectories, trails, projections
```

---

### Task 7: Build and Test Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: Success, no type errors

**Step 3: Final commit if any fixes needed**

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Navigation components | `src/engine/components/index.ts` |
| 2 | TrajectoryCalculator | `src/game/TrajectoryCalculator.ts` |
| 3 | NavigationSystem | `src/engine/systems/NavigationSystem.ts` |
| 4 | CommandHandler | `src/game/CommandHandler.ts`, `SpaceWarGame.ts` |
| 5 | TrailRenderer | `src/rendering/TrailRenderer.ts` |
| 6 | Wire together + polish | `SpaceWarGame.ts` |
| 7 | Build & test verification | — |
