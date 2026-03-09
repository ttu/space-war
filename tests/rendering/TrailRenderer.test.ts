import { describe, it, expect } from 'vitest';
import { TrailStore } from '../../src/rendering/TrailRenderer';

describe('TrailStore', () => {
  it('records positions', () => {
    const store = new TrailStore(100);
    store.record('e_0', 10, 20);
    store.record('e_0', 30, 40);
    const trail = store.getTrail('e_0');
    expect(trail).toHaveLength(2);
    expect(trail[0]).toEqual({ x: 10, y: 20 });
    expect(trail[1]).toEqual({ x: 30, y: 40 });
  });

  it('limits trail length', () => {
    const store = new TrailStore(3);
    store.record('e_0', 0, 0);
    store.record('e_0', 1, 1);
    store.record('e_0', 2, 2);
    store.record('e_0', 3, 3);
    const trail = store.getTrail('e_0');
    expect(trail).toHaveLength(3);
    expect(trail[0]).toEqual({ x: 1, y: 1 });
  });

  it('returns empty array for unknown entity', () => {
    const store = new TrailStore(100);
    expect(store.getTrail('unknown')).toEqual([]);
  });

  it('removes entity trail', () => {
    const store = new TrailStore(100);
    store.record('e_0', 10, 20);
    store.remove('e_0');
    expect(store.getTrail('e_0')).toEqual([]);
  });
});
