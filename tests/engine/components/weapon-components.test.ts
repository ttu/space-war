import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import {
  MissileLauncher, Missile, PDC, Railgun, Projectile,
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

  it('should add PDC to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const pdc: PDC = {
      type: 'PDC',
      range: 5,
      fireRate: 100,
      lastFiredTime: 0,
      damagePerHit: 1,
    };
    world.addComponent(id, pdc);
    const retrieved = world.getComponent<PDC>(id, COMPONENT.PDC);
    expect(retrieved).toBeDefined();
    expect(retrieved!.range).toBe(5);
    expect(retrieved!.fireRate).toBe(100);
    expect(retrieved!.damagePerHit).toBe(1);
  });

  it('should add Railgun to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const railgun: Railgun = {
      type: 'Railgun',
      projectileSpeed: 100,
      maxRange: 10_000,
      reloadTime: 2,
      lastFiredTime: 0,
      damage: 50,
    };
    world.addComponent(id, railgun);
    const retrieved = world.getComponent<Railgun>(id, COMPONENT.Railgun);
    expect(retrieved).toBeDefined();
    expect(retrieved!.projectileSpeed).toBe(100);
    expect(retrieved!.maxRange).toBe(10_000);
    expect(retrieved!.reloadTime).toBe(2);
  });

  it('should add Projectile to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const projectile: Projectile = {
      type: 'Projectile',
      shooterId: 'ship_1',
      targetId: 'ship_2',
      faction: 'player',
      damage: 50,
      hitRadius: 0.5,
    };
    world.addComponent(id, projectile);
    const retrieved = world.getComponent<Projectile>(id, COMPONENT.Projectile);
    expect(retrieved).toBeDefined();
    expect(retrieved!.shooterId).toBe('ship_1');
    expect(retrieved!.targetId).toBe('ship_2');
    expect(retrieved!.hitRadius).toBe(0.5);
  });
});
