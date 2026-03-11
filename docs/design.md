# Game Design

Design document for Space War — the principles, inspirations, and decisions behind the game.

## Vision

A real-time tactical space combat game that captures the feel of being in a Combat Information Center (CIC). The player commands a fleet from a top-down radar display, dealing with the realities of space combat: Newtonian physics, vast distances, sensor limitations, and weapon travel times.

**Inspirations:**
- **The Expanse** — realistic space combat, missile exchanges, PDC point defense
- **Lost Fleet** — fleet-scale tactics, light-speed delay, formation combat
- **Project Rho / Atomic Rockets** — hard science fiction physics and weapon design

## Core Design Principles

### 1. Physics Feel Real

Space has no friction. Ships that thrust in one direction keep moving that way forever. Stopping requires burning in the opposite direction. This creates meaningful decisions about when to accelerate and when to decelerate.

Gravity wells exist around planets but are secondary to ship thrust at tactical ranges.

### 2. Information is Imperfect

Full fog of war. You only see what your sensors detect. Sensor data travels at light speed — distant contacts show where the enemy *was*, not where they *are*. This uncertainty creates tension and rewards good positioning.

Ships running their engines are easier to detect (higher thermal signature). Going dark (coasting with engines off) makes ships harder to find but removes the ability to maneuver.

### 3. Weapons Have Tradeoffs

Each weapon type serves a different tactical role:

| Weapon | Range | Speed | Counterable | Role |
|--------|-------|-------|-------------|------|
| Missiles | Long | Slow | Yes (PDCs) | Primary damage dealer |
| PDCs | Very short | Instant | No | Missile defense |
| Railguns | Medium | Fast | No | Direct fire, hard to aim |

No single weapon dominates. Missiles deal reliable damage but can be intercepted. Railguns bypass defenses but are hard to hit with. PDCs are purely defensive but critical for survival.

### 4. Ships Are Distinct

Six hull classes from Corvette to Carrier. Each has different speed, durability, and weapon loadouts. Fleet composition matters — a fleet of all battleships lacks speed and sensor range, while all corvettes lack firepower and survivability.

### 5. Time is a Resource

The game runs in real-time but can be paused to issue orders. Time acceleration (up to 100x) handles the vast distances of space combat. Knowing when to speed up and when to slow down is part of the skill.

## Technical Design Decisions

### ECS Architecture

Entity-Component-System was chosen for:
- Clean separation of data (components) and logic (systems)
- Easy to add new features without modifying existing code
- Natural fit for game objects with varying capabilities

### Fixed Timestep

Simulation runs at exactly 10 ticks per second (0.1s per tick). This ensures:
- Deterministic physics regardless of frame rate
- Consistent behavior across different hardware
- Render interpolation provides smooth visuals

### Orthographic Top-Down View

The game uses a 2D top-down view (Three.js orthographic camera) rather than 3D because:
- Tactical clarity — no depth perception issues
- Matches the CIC/radar display aesthetic
- Simpler rendering for the prototype phase
- All relevant gameplay happens in 2D (orbital plane)

### Scenario-Based Structure

Games are played as individual scenarios rather than a continuous campaign. Each scenario defines:
- Celestial bodies (planets, moons, stations)
- Ship positions, types, and factions
- Starting conditions

This keeps the scope manageable and allows varied tactical situations.

## Physics Model

### Newtonian Motion

- No friction or drag
- Constant thrust produces constant acceleration
- Ships have mass-dependent thrust (heavier = slower acceleration)
- Velocity persists indefinitely without thrust

### Brachistochrone Trajectories

Ship navigation uses brachistochrone (minimum-time) paths:
- Accelerate toward destination for half the trip
- Flip and decelerate for the second half
- Computer handles all burn planning automatically

The navigation computer calculates optimal burns but doesn't account for gravity — corrections happen naturally during execution.

### Gravity

Celestial bodies exert gravity using the real gravitational constant (converted to km units). Gravity affects all entities including ships, missiles, and projectiles. At typical combat ranges, gravity is a minor perturbation.

### Celestial Hazards

Planets, moons, and stations have a **danger zone** (1.5× body radius). Ships and projectiles inside the zone take proximity-based hull damage each tick; contact with the surface destroys the entity instantly. Missiles and railgun projectiles are destroyed immediately in the danger zone. Move orders (player and AI) avoid these zones by computing bypass waypoints when the straight-line path would intersect a body; ships also adjust course in flight if their path crosses a body.

## Sensor Model

### Thermal Detection

Detection is based on thermal signature using an inverse-square law:

```
signalStrength = effectiveSignature / distance²
effectiveSignature = baseSignature + (throttle × thrustMultiplier)
```

Ships are detected when `signalStrength > sensorSensitivity`.

### Light-Speed Delay

Sensor data propagates at 299,792 km/s. A contact 300,000 km away is seen as it was 1 second ago. This delay is meaningful at the distances where space combat occurs.

### Contact Management

- New detections fire `ShipDetected` events
- Contacts update with each sensor sweep
- Contacts are marked "lost" when no longer detected
- Lost contacts are removed after 30 seconds
- Contact position accuracy degrades with age and distance

## Damage Model

### Hull and Armor

Direct damage model: `effective_damage = max(1, damage - armor)`. Heavier ships have more armor, reducing damage from each individual hit.

### Subsystem Damage

Each hit has a 30% chance of damaging a subsystem (reactor, engines, or sensors). Damaged engines reduce thrust. Damaged sensors reduce detection range. There's a further 25% chance of weapon damage whbte sen a subsystem is hit.

### Ship Destruction

Ships are destroyed when hull reaches 0. The `ShipDestroyed` event is emitted and the entity is removed from the world.

## AI Design

### Two-Layer Architecture

**Strategic Layer** (every 3 seconds):
- Evaluates fleet situation
- Chooses objective: engage, disengage, or hold
- Selects targets from known contacts

**Tactical Layer** (every tick):
- Executes strategic intent
- Manages weapon firing (range checks, hit probability thresholds)
- Issues movement orders

### Engagement Rules

- Missiles fire at 85% of maximum range (conserving ammo at extreme range)
- Railguns fire only at ≥20% hit probability
- Ships disengage when hull drops below 35%
- Retreat distance: 5000 km from nearest threat
