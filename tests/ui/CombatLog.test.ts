import { describe, it, expect } from 'vitest';
import {
  _aggregatePDCHitsForTest as aggregate,
  _aggregateSystemDamagedForTest as aggregateSys,
  _aggregateMissileLaunchedForTest as aggregateLaunched,
  _aggregateMissileInterceptedForTest as aggregateIntercepted,
} from '../../src/ui/CombatLog';
import type { GameEvent } from '../../src/engine/types';

function pdcHit(entityId: string, targetId: string, time: number, hits: number): GameEvent {
  return { type: 'PDCHit', time, entityId, targetId, data: { hits, damage: hits } };
}

describe('CombatLog PDC aggregation', () => {
  it('merges consecutive same-pair events within window', () => {
    const events = [
      pdcHit('A', 'X', 0, 2),
      pdcHit('A', 'X', 1, 3),
      pdcHit('A', 'X', 4.9, 1),
    ];
    const result = aggregate(events);
    expect(result).toHaveLength(1);
    expect(result[0].data?.hits).toBe(6);
    expect(result[0].data?.damage).toBe(6);
  });

  it('merges non-consecutive same-pair events when another pair interleaves', () => {
    const events = [
      pdcHit('A', 'X', 0, 2),
      pdcHit('B', 'Y', 0.1, 1),   // different pair — breaks consecutive run
      pdcHit('A', 'X', 2.0, 3),
      pdcHit('B', 'Y', 2.5, 2),
    ];
    const result = aggregate(events);
    // Expect two entries: A→X (5 hits) and B→Y (3 hits)
    expect(result).toHaveLength(2);
    const ax = result.find(e => e.entityId === 'A');
    const by = result.find(e => e.entityId === 'B');
    expect(ax?.data?.hits).toBe(5);
    expect(by?.data?.hits).toBe(3);
  });

  it('does not merge events outside the 5-second window', () => {
    const events = [
      pdcHit('A', 'X', 0, 2),
      pdcHit('A', 'X', 5.1, 3),
    ];
    const result = aggregate(events);
    expect(result).toHaveLength(2);
    expect(result[0].data?.hits).toBe(2);
    expect(result[1].data?.hits).toBe(3);
  });

  it('keeps non-PDCHit events in place and preserves order relative to others', () => {
    const events: GameEvent[] = [
      pdcHit('A', 'X', 0, 1),
      { type: 'ShipDestroyed', time: 1, entityId: 'X', data: {} },
      pdcHit('A', 'X', 1.5, 2),
    ];
    const result = aggregate(events);
    // First PDCHit and the later one are within 5s window and same pair — merged
    expect(result).toHaveLength(2); // merged PDCHit + ShipDestroyed
    const destroyed = result.find(e => e.type === 'ShipDestroyed');
    expect(destroyed).toBeDefined();
  });
});

function sysDmg(entityId: string, system: string, time: number): GameEvent {
  return { type: 'SystemDamaged', time, entityId, data: { system } };
}

describe('CombatLog SystemDamaged aggregation', () => {
  it('merges multiple SystemDamaged for same ship within window', () => {
    const events = [
      sysDmg('A', 'reactor', 0),
      sysDmg('A', 'sensors', 1),
      sysDmg('A', 'reactor', 2),
    ];
    const result = aggregateSys(events);
    expect(result).toHaveLength(1);
    const sys = result[0].data?.systems as string[];
    expect(sys).toContain('reactor');
    expect(sys).toContain('sensors');
  });

  it('does not merge SystemDamaged for different ships', () => {
    const events = [
      sysDmg('A', 'reactor', 0),
      sysDmg('B', 'sensors', 0.5),
    ];
    const result = aggregateSys(events);
    expect(result).toHaveLength(2);
  });

  it('does not merge events outside the 5-second window', () => {
    const events = [
      sysDmg('A', 'reactor', 0),
      sysDmg('A', 'engines', 5.1),
    ];
    const result = aggregateSys(events);
    expect(result).toHaveLength(2);
  });

  it('merges non-consecutive events for same ship when another ship interleaves', () => {
    const events = [
      sysDmg('A', 'reactor', 0),
      sysDmg('B', 'engines', 0.5),
      sysDmg('A', 'sensors', 1.0),
    ];
    const result = aggregateSys(events);
    expect(result).toHaveLength(2);
    const aEntry = result.find(e => e.entityId === 'A');
    const sys = aEntry?.data?.systems as string[];
    expect(sys).toContain('reactor');
    expect(sys).toContain('sensors');
  });
});

function missileLaunched(faction: string, time: number): GameEvent {
  return { type: 'MissileLaunched', time, entityId: `ship-${faction}`, data: { salvoSize: 1, faction } };
}

describe('CombatLog MissileLaunched aggregation', () => {
  it('merges same-faction launches within 3-second window', () => {
    const events = [
      missileLaunched('enemy', 0),
      missileLaunched('enemy', 0.5),
      missileLaunched('enemy', 1.0),
    ];
    const result = aggregateLaunched(events);
    expect(result).toHaveLength(1);
    expect(result[0].data?.totalMissiles).toBe(3);
  });

  it('does not merge launches from different factions', () => {
    const events = [
      missileLaunched('enemy', 0),
      missileLaunched('player', 0.5),
    ];
    const result = aggregateLaunched(events);
    expect(result).toHaveLength(2);
  });

  it('does not merge launches outside 3-second window', () => {
    const events = [
      missileLaunched('enemy', 0),
      missileLaunched('enemy', 3.1),
    ];
    const result = aggregateLaunched(events);
    expect(result).toHaveLength(2);
  });
});

function intercepted(time: number): GameEvent {
  return { type: 'MissileIntercepted', time, entityId: 'ship-a', data: {} };
}

describe('CombatLog MissileIntercepted aggregation', () => {
  it('merges multiple interceptions within 3-second window', () => {
    const events = [intercepted(0), intercepted(0.5), intercepted(2.9)];
    const result = aggregateIntercepted(events);
    expect(result).toHaveLength(1);
    expect(result[0].data?.count).toBe(3);
  });

  it('does not merge interceptions outside 3-second window', () => {
    const events = [intercepted(0), intercepted(3.1)];
    const result = aggregateIntercepted(events);
    expect(result).toHaveLength(2);
  });
});
