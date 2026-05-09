import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../src/engine/ecs/World';
import { CommandHandler } from '../../src/game/CommandHandler';
import {
  Position, Velocity, Ship, Thruster, Selectable, NavigationOrder, RotationState,
  MissileLauncher, Missile, Railgun, Projectile,
  COMPONENT,
} from '../../src/engine/components';
import { PhysicsSystem } from '../../src/engine/systems/PhysicsSystem';
import { RailgunSystem } from '../../src/engine/systems/RailgunSystem';
import { EventBusImpl } from '../../src/engine/core/EventBus';

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
    expect(nav!.destinationX).toBe(10000);
    expect(nav!.destinationY).toBe(0);
    expect(nav!.targetX).toBe(10000);
    expect(nav!.targetY).toBe(0);
    expect(nav!.phase).toBe('rotating');
    expect(nav!.burnPlan.accelTime).toBeGreaterThan(0);
  });

  it('does not issue orders when multiple player ships exist, none selected, and no flagship', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id1 = createPlayerShip(world, {});
    const id2 = createPlayerShip(world, {});
    world.getComponent<Selectable>(id1, COMPONENT.Selectable)!.selected = false;
    world.getComponent<Selectable>(id2, COMPONENT.Selectable)!.selected = false;
    world.getComponent<Ship>(id1, COMPONENT.Ship)!.flagship = false;
    world.getComponent<Ship>(id2, COMPONENT.Ship)!.flagship = false;

    handler.issueMoveTo(10000, 0);

    expect(world.getComponent<NavigationOrder>(id1, COMPONENT.NavigationOrder)).toBeUndefined();
    expect(world.getComponent<NavigationOrder>(id2, COMPONENT.NavigationOrder)).toBeUndefined();
  });

  it('issues to flagship when no player ship is selected', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id = world.createEntity();
    world.addComponent<Position>(id, { type: 'Position', x: 0, y: 0, prevX: 0, prevY: 0 });
    world.addComponent<Velocity>(id, { type: 'Velocity', vx: 0, vy: 0 });
    world.addComponent<Ship>(id, {
      type: 'Ship', name: 'Flagship', hullClass: 'cruiser', faction: 'player', flagship: true,
    });
    world.addComponent<Thruster>(id, {
      type: 'Thruster', maxThrust: 0.1, thrustAngle: 0, throttle: 0, rotationSpeed: 0.5,
    });
    world.addComponent<Selectable>(id, { type: 'Selectable', selected: false });
    world.addComponent<RotationState>(id, {
      type: 'RotationState', currentAngle: 0, targetAngle: 0, rotating: false,
    });

    handler.issueMoveTo(10000, 0);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    expect(nav!.destinationX).toBe(10000);
    expect(nav!.destinationY).toBe(0);
    expect(nav!.targetX).toBe(10000);
    expect(nav!.targetY).toBe(0);
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
    expect(nav.destinationX).toBe(5000);
    expect(nav.destinationY).toBe(5000);
    expect(nav.targetX).toBe(5000);
    expect(nav.targetY).toBe(5000);
  });
});

describe('CommandHandler - Railgun lead solution', () => {
  function createShipWithRailgun(
    world: WorldImpl,
    opts: { x: number; y: number; vx?: number; vy?: number; faction: 'player' | 'enemy' },
  ) {
    const id = world.createEntity();
    world.addComponent<Position>(id, {
      type: 'Position', x: opts.x, y: opts.y, prevX: opts.x, prevY: opts.y,
    });
    world.addComponent<Velocity>(id, {
      type: 'Velocity', vx: opts.vx ?? 0, vy: opts.vy ?? 0,
    });
    world.addComponent<Ship>(id, {
      type: 'Ship', name: 'Ship', hullClass: 'cruiser', faction: opts.faction, flagship: true,
    });
    world.addComponent<Railgun>(id, {
      type: 'Railgun',
      projectileSpeed: 100, maxRange: 50_000, reloadTime: 2,
      lastFiredTime: 0, damage: 50, ammo: 50, maxAmmo: 50,
    });
    return id;
  }

  // The lead-solution math uses target velocity relative to the shooter, which
  // implicitly assumes the projectile inherits the shooter's velocity. If the
  // spawn code drops shooter velocity, projectiles miss whenever the shooter
  // is moving relative to the target.
  it('hits a stationary target when the shooter is moving perpendicular to LOS', () => {
    const world = new WorldImpl();
    const events = new EventBusImpl();
    const handler = new CommandHandler(world, events);
    const physics = new PhysicsSystem();
    const railgunSys = new RailgunSystem(events);

    // Shooter at origin moving +y at 30 km/s; target stationary at (10000, 0).
    const shooterId = createShipWithRailgun(world, { x: 0, y: 0, vx: 0, vy: 30, faction: 'player' });
    const targetId = createShipWithRailgun(world, { x: 10_000, y: 0, faction: 'enemy' });

    let hit = false;
    events.subscribe('RailgunHit', (e) => {
      if (e.targetId === targetId) hit = true;
    });

    const fireTime = 5;
    handler.fireRailgunFromShip(shooterId, targetId, fireTime);

    // Step physics + railgun system at 0.1s for up to 200s. Lead time should be ~105s.
    const dt = 0.1;
    for (let step = 0; step < 2000 && !hit; step++) {
      const t = fireTime + step * dt;
      handler.processPendingRailgunBursts(world, t);
      physics.update(world, dt);
      railgunSys.update(world, dt, t);
    }

    expect(hit).toBe(true);
  });

  it('spawns projectiles inheriting shooter velocity', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const shooterId = createShipWithRailgun(world, { x: 0, y: 0, vx: 0, vy: 30, faction: 'player' });
    const targetId = createShipWithRailgun(world, { x: 10_000, y: 0, faction: 'enemy' });

    handler.fireRailgunFromShip(shooterId, targetId, 5);
    handler.processPendingRailgunBursts(world, 5);

    const projIds = world.query(COMPONENT.Projectile);
    expect(projIds.length).toBe(1);
    const projVel = world.getComponent<Velocity>(projIds[0], COMPONENT.Velocity)!;
    // Projectile world-frame y velocity must include the shooter's +30 km/s.
    // Without inheritance the y component would be ~ -30 (full lead correction);
    // with inheritance the lead correction cancels the shooter motion → ~0.
    expect(Math.abs(projVel.vy)).toBeLessThan(1);
    expect(projVel.vx).toBeGreaterThan(50);
  });
});

describe('CommandHandler - Missile Launch', () => {
  function createLauncherShip(world: WorldImpl) {
    const id = createPlayerShip(world);
    world.addComponent<MissileLauncher>(id, {
      type: 'MissileLauncher',
      salvoSize: 6, reloadTime: 30, lastFiredTime: 0,
      maxRange: 50_000, missileAccel: 0.5, ammo: 24,
      seekerRange: 5_000, seekerSensitivity: 1e-8,
    });
    return id;
  }

  function createTarget(world: WorldImpl, x: number) {
    const id = world.createEntity();
    world.addComponent<Position>(id, { type: 'Position', x, y: 0, prevX: x, prevY: 0 });
    return id;
  }

  it('should launch missile salvo from selected ship with launcher', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const shipId = createLauncherShip(world);
    const targetId = createTarget(world, 10_000);

    handler.launchMissile(targetId, 10.0);

    const missiles = world.query(COMPONENT.Missile);
    expect(missiles.length).toBe(1);

    const missile = world.getComponent<Missile>(missiles[0], COMPONENT.Missile)!;
    expect(missile.targetId).toBe(targetId);
    expect(missile.count).toBe(6);
    expect(missile.launcherFaction).toBe('player');

    const launcher = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher)!;
    expect(launcher.ammo).toBe(18);
    expect(launcher.lastFiredTime).toBe(10.0);
  });

  it('should not launch if reload not complete', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const shipId = createLauncherShip(world);
    const launcher = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher)!;
    launcher.lastFiredTime = 5.0;
    const targetId = createTarget(world, 10_000);

    handler.launchMissile(targetId, 20.0); // 20 - 5 = 15 < 30 reload time

    const missiles = world.query(COMPONENT.Missile);
    expect(missiles.length).toBe(0);
  });

  it('should not launch if no ammo', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const shipId = createLauncherShip(world);
    const launcher = world.getComponent<MissileLauncher>(shipId, COMPONENT.MissileLauncher)!;
    launcher.ammo = 0;
    const targetId = createTarget(world, 10_000);

    handler.launchMissile(targetId, 50.0);

    const missiles = world.query(COMPONENT.Missile);
    expect(missiles.length).toBe(0);
  });
});
