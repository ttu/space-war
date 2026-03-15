import { describe, it, expect } from 'vitest';
describe('ActiveMissilesPanel', () => {
  it('should be importable', async () => {
    const mod = await import('../../src/ui/ActiveMissilesPanel');
    expect(mod.ActiveMissilesPanel).toBeDefined();
  });
});
