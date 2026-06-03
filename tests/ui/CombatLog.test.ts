import { describe, it, expect } from 'vitest';
import { _aggregatePDCHitsForTest as aggregate } from '../../src/ui/CombatLog';
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

  it('keeps non-PDCHit events in place', () => {
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
