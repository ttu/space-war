/**
 * E2E test scenario: one player ship and one enemy ship both on screen.
 * Used when ?e2e=1 so Playwright can click the enemy to test selection.
 */

import type { Scenario } from '../ScenarioLoader';

export const e2eScenario: Scenario = {
  celestials: [
    { name: 'Terra', mass: 5.972e24, radius: 6371, bodyType: 'planet', x: 0, y: 0 },
  ],
  ships: [
    {
      templateId: 'cruiser',
      name: 'TCS Resolute',
      faction: 'player',
      flagship: true,
      x: 42000,
      y: 0,
      vx: 0,
      vy: 0,
    },
    {
      templateId: 'frigate',
      name: 'UES Raider',
      faction: 'enemy',
      x: 43500,
      y: 3000,
      vx: 0,
      vy: 0,
    },
  ],
};
