# Celestial Body Physics & Collisions

**Date**: 2026-03-11
**Status**: Approved

## Summary

Add orbital movement to celestial bodies (moons orbit planets, planets orbit stars) using real Newtonian physics. Add collision detection with damage zones around celestial bodies that destroy ships, missiles, and projectiles.

## Design Decisions

- **Orbital movement**: Real physics — give celestial bodies Velocity components, let existing gravity handle orbits
- **Collision model**: Damage zone at 2x radius with linear damage scaling, instant destruction on surface contact
- **Affected entities**: Ships, missiles, and projectiles (everything with Position+Velocity)
- **Demo scenario**: Add Sol (star) far away, Terra orbits Sol, Luna orbits Terra

## 1. Celestial Bodies Get Velocity

Give celestial bodies a `Velocity` component in ScenarioLoader. PhysicsSystem already processes all entities with Position+Velocity, so no changes needed there.

### Scenario Updates (demo.ts)

- **Sol**: Star at origin, mass ~1.989e30 kg, radius ~696,000 km. No velocity (center of system).
- **Terra**: Offset ~150,000,000 km from Sol. Orbital velocity calculated via `circularOrbitSpeed(solMass, distance)`.
- **Luna**: Offset ~384,400 km from Terra. Orbital velocity = Terra's velocity + `circularOrbitSpeed(terraMass, 384400)`.

Add `'star'` to the `bodyType` union in CelestialBody component.

Combat happens near Terra. Sol provides subtle gravity at that distance.

### ScenarioLoader Changes

- Add optional `vx`, `vy` fields to `ScenarioCelestial`
- When present, create a Velocity component on the celestial entity

## 2. CollisionSystem

New file: `src/engine/systems/CollisionSystem.ts`

### Algorithm (per tick)

1. Collect all celestial bodies (Position + CelestialBody)
2. For each entity with Position + Velocity (excluding celestial bodies):
   - For each celestial body, compute distance
   - **dist ≤ radius**: Instant destruction — remove entity, emit `CelestialCollision` event
   - **dist ≤ 2× radius**: Apply proximity damage: `damage = maxDamage × (1 - (dist - radius) / radius)`
     - maxDamage scales with body mass or is a fixed value per tick (e.g., 5 hull per tick at surface edge, 0 at 2x radius)
   - For missiles/projectiles: instant destruction inside 2x radius (no gradual damage, they're small)

### Events

- `CelestialCollision`: `{ entityId, bodyName, type: 'impact' | 'atmosphere' }` — for combat log display

### Entity Type Detection

- Ships: have `Hull` component → apply gradual damage in zone, destroy on contact
- Missiles: have `Missile` component → destroy inside damage zone
- Projectiles: have `Projectile` component → destroy inside damage zone

## 3. Rendering Updates

### CelestialRenderer

- Add a translucent danger zone ring at 2× body radius
- Color: dim red/orange, low opacity (~0.15)
- Only visible when zoomed in enough to see (same logic as gravity rings)

### Color Addition

- Add `star` body type color (e.g., 0xaa8833 — warm yellow)

## 4. System Execution Order

```
sensorSystem.update()
pdcSystem.update()
railgunSystem.update()
damageSystem.processHitEvents()
aiStrategicSystem.update()
aiTacticalSystem.update()
navigationSystem.update()
physicsSystem.update()        ← moves celestials + everything else
collisionSystem.update()      ← NEW: check collisions after movement
missileSystem.update()
victorySystem.update()
```

## 5. Component Changes

### CelestialBody (index.ts)

Add `'star'` to bodyType union:
```typescript
bodyType: 'star' | 'planet' | 'moon' | 'station' | 'asteroid';
```

### ScenarioCelestial (ScenarioLoader.ts)

Add optional velocity:
```typescript
export interface ScenarioCelestial {
  // ... existing fields
  vx?: number;
  vy?: number;
}
```

### EventBus Events

Add `CelestialCollision` event type to the event system.

## 6. Files Changed

| File | Change |
|------|--------|
| `src/engine/components/index.ts` | Add `'star'` to bodyType |
| `src/engine/data/ScenarioLoader.ts` | Add vx/vy to ScenarioCelestial, create Velocity for celestials |
| `src/engine/data/scenarios/demo.ts` | Add Sol, give Terra/Luna orbital velocities |
| `src/engine/systems/CollisionSystem.ts` | **NEW** — collision detection + damage |
| `src/rendering/CelestialRenderer.ts` | Danger zone ring, star color |
| `src/game/SpaceWarGame.ts` | Wire CollisionSystem into fixedUpdate |
| `src/ui/CombatLog.ts` | Handle CelestialCollision events |
| `src/engine/core/EventBus.ts` | Add CelestialCollision event type (if typed) |

## 7. Testing

- Unit test: CollisionSystem — entity inside radius destroyed, entity in damage zone takes damage, entity outside unaffected
- Unit test: Celestial bodies with Velocity move under gravity
- Manual: Observe Luna orbiting Terra, ships taking damage near planets
