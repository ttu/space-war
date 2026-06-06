import { describe, it, expect } from 'vitest';
import {
  _aggregatePDCHitsForTest as aggregate,
  _aggregateSystemDamagedForTest as aggregateSys,
  _aggregateMissileLaunchedForTest as aggregateLaunched,
  _aggregateMissileInterceptedForTest as aggregateIntercepted,
} from '../../src/ui/CombatLog';
import type { GameEvent } from '../../src/engine/types';

function pdcHit(entityId: string, targetId: string, time: number, hits: number, faction = 'player'): GameEvent {
  return { type: 'PDCHit', time, entityId, targetId, data: { hits, damage: hits, faction } };
}

describe('CombatLog PDC aggregation', () => {
  it('merges same-faction events within 30-second window', () => {
    const events = [
      pdcHit('A', 'X', 0, 2, 'player'),
      pdcHit('B', 'Y', 5, 3, 'player'),
      pdcHit('C', 'Z', 29.9, 1, 'player'),
    ];
    const result = aggregate(events);
    expect(result).toHaveLength(1);
    expect(result[0].data?.hits).toBe(6);
    expect(result[0].data?.damage).toBe(6);
  });

  it('does not merge events from different factions', () => {
    const events = [
      pdcHit('A', 'X', 0, 2, 'player'),
      pdcHit('B', 'Y', 0.1, 1, 'enemy'),
      pdcHit('A', 'X', 2.0, 3, 'player'),
      pdcHit('B', 'Y', 2.5, 2, 'enemy'),
    ];
    const result = aggregate(events);
    // Expect two entries: player (5 hits) and enemy (3 hits)
    expect(result).toHaveLength(2);
    const player = result.find(e => e.data?.faction === 'player');
    const enemy = result.find(e => e.data?.faction === 'enemy');
    expect(player?.data?.hits).toBe(5);
    expect(enemy?.data?.hits).toBe(3);
  });

  it('does not merge events outside the 30-second window', () => {
    const events = [
      pdcHit('A', 'X', 0, 2, 'player'),
      pdcHit('A', 'X', 30.1, 3, 'player'),
    ];
    const result = aggregate(events);
    expect(result).toHaveLength(2);
    expect(result[0].data?.hits).toBe(2);
    expect(result[1].data?.hits).toBe(3);
  });

  it('keeps non-PDCHit events in place and preserves order relative to others', () => {
    const events: GameEvent[] = [
      pdcHit('A', 'X', 0, 1, 'player'),
      { type: 'ShipDestroyed', time: 1, entityId: 'X', data: {} },
      pdcHit('A', 'X', 1.5, 2, 'player'),
    ];
    const result = aggregate(events);
    // Both PDCHit events are same faction within window — merged; ShipDestroyed preserved
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

function intercepted(time: number, faction = 'player'): GameEvent {
  return { type: 'MissileIntercepted', time, entityId: 'ship-a', data: { faction } };
}

describe('CombatLog MissileIntercepted aggregation', () => {
  it('merges same-faction interceptions within 3-second window', () => {
    const events = [intercepted(0, 'player'), intercepted(0.5, 'player'), intercepted(2.9, 'player')];
    const result = aggregateIntercepted(events);
    expect(result).toHaveLength(1);
    expect(result[0].data?.count).toBe(3);
  });

  it('does not merge interceptions from different factions', () => {
    const events = [intercepted(0, 'player'), intercepted(0.5, 'enemy')];
    const result = aggregateIntercepted(events);
    expect(result).toHaveLength(2);
  });

  it('does not merge interceptions outside 3-second window', () => {
    const events = [intercepted(0, 'player'), intercepted(3.1, 'player')];
    const result = aggregateIntercepted(events);
    expect(result).toHaveLength(2);
  });
});
