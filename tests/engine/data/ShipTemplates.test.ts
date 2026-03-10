import { describe, it, expect } from 'vitest';
import {
  getShipTemplate,
  getAllShipTemplates,
  getHullClassIds,
  resolveLoadout,
  type HullClassId,
} from '../../../src/engine/data/ShipTemplates';

describe('ShipTemplates', () => {
  it('returns cruiser template by id', () => {
    const t = getShipTemplate('cruiser');
    expect(t).toBeDefined();
    expect(t!.id).toBe('cruiser');
    expect(t!.name).toBe('Cruiser');
    expect(t!.hullMax).toBe(100);
    expect(t!.maxThrust).toBe(0.1);
    expect(t!.defaultLoadout.missileLauncher).toBe('ml_heavy_6');
  });

  it('returns all hull classes in order', () => {
    const ids = getHullClassIds();
    expect(ids).toEqual([
      'corvette',
      'frigate',
      'destroyer',
      'cruiser',
      'battleship',
      'carrier',
    ]);
  });

  it('getAllShipTemplates returns six templates', () => {
    const all = getAllShipTemplates();
    expect(all.length).toBe(6);
    const ids = new Set(all.map((t) => t.id));
    expect(ids.has('corvette')).toBe(true);
    expect(ids.has('carrier')).toBe(true);
  });

  it('returns undefined for unknown hull class', () => {
    expect(getShipTemplate('unknown' as HullClassId)).toBeUndefined();
  });

  it('resolveLoadout returns default modules when no override', () => {
    const t = getShipTemplate('cruiser')!;
    const r = resolveLoadout(t);
    expect(r.missileLauncher).toBeDefined();
    expect(r.missileLauncher!.id).toBe('ml_heavy_6');
    expect(r.pdc!.id).toBe('pdc_heavy');
    expect(r.railgun!.id).toBe('rg_heavy');
    expect(r.sensor!.id).toBe('sensor_heavy');
  });

  it('resolveLoadout uses override when provided', () => {
    const t = getShipTemplate('destroyer')!;
    const r = resolveLoadout(t, {
      missileLauncher: 'ml_light_3',
      railgun: 'rg_light',
    });
    expect(r.missileLauncher!.id).toBe('ml_light_3');
    expect(r.railgun!.id).toBe('rg_light');
    expect(r.pdc!.id).toBe('pdc_standard');
  });
});
