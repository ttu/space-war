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
