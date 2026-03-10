import { describe, it, expect } from 'vitest';
import {
  getModuleById,
  getAllModules,
  getModulesByKind,
  MODULE_IDS,
  type MissileLauncherModule,
  type PDCModule,
  type RailgunModule,
  type SensorModule,
} from '../../../src/engine/data/ModuleTemplates';

describe('ModuleTemplates', () => {
  it('returns missile launcher module by id', () => {
    const m = getModuleById('ml_heavy_6');
    expect(m).toBeDefined();
    expect(m!.kind).toBe('missile_launcher');
    expect((m as MissileLauncherModule).salvoSize).toBe(6);
    expect((m as MissileLauncherModule).maxRange).toBe(50_000);
  });

  it('returns PDC module by id', () => {
    const m = getModuleById('pdc_heavy');
    expect(m).toBeDefined();
    expect(m!.kind).toBe('pdc');
    expect((m as PDCModule).fireRate).toBe(100);
  });

  it('returns railgun module by id', () => {
    const m = getModuleById('rg_heavy');
    expect(m).toBeDefined();
    expect(m!.kind).toBe('railgun');
    expect((m as RailgunModule).damage).toBe(50);
  });

  it('returns sensor module by id', () => {
    const m = getModuleById('sensor_heavy');
    expect(m).toBeDefined();
    expect(m!.kind).toBe('sensor');
    expect((m as SensorModule).maxRange).toBe(500_000);
  });

  it('returns undefined for unknown id', () => {
    expect(getModuleById('unknown')).toBeUndefined();
  });

  it('getAllModules returns all registered modules', () => {
    const all = getAllModules();
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((m) => m.id && m.name && m.kind)).toBe(true);
  });

  it('getModulesByKind returns only matching kind', () => {
    const launchers = getModulesByKind('missile_launcher');
    expect(launchers.length).toBe(4);
    expect(launchers.every((m) => m.kind === 'missile_launcher')).toBe(true);
  });

  it('MODULE_IDS contains expected ids', () => {
    expect(MODULE_IDS.missileLauncher).toContain('ml_heavy_6');
    expect(MODULE_IDS.pdc).toContain('pdc_heavy');
    expect(MODULE_IDS.railgun).toContain('rg_heavy');
    expect(MODULE_IDS.sensor).toContain('sensor_heavy');
  });
});
