import { describe, it, expect } from 'vitest';
describe('IncomingThreatsPanel', () => {
  it('should be importable', async () => {
    const mod = await import('../../src/ui/IncomingThreatsPanel');
    expect(mod.IncomingThreatsPanel).toBeDefined();
  });
});
