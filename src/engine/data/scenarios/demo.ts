/**
 * Default demo scenario: player fleet (cruiser + destroyer) and enemies (cruiser + frigate) near Terra/Luna.
 * Orbital velocity for 42_000 km orbit: sqrt(G*M/r) ≈ 3.87 km/s (simplified).
 */

import type { Scenario } from '../ScenarioLoader';

const ORBITAL_SPEED = Math.sqrt((6.674e-20 * 5.972e24) / 42000);

export const demoScenario: Scenario = {
  celestials: [
    { name: 'Terra', mass: 5.972e24, radius: 6371, bodyType: 'planet', x: 0, y: 0 },
    { name: 'Luna', mass: 7.342e22, radius: 1737, bodyType: 'moon', x: 0, y: 384400 },
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
      vy: ORBITAL_SPEED,
    },
    {
      templateId: 'destroyer',
      name: 'TCS Vigilant',
      faction: 'player',
      x: 42500,
      y: 1000,
      vx: 0,
      vy: ORBITAL_SPEED * 0.99,
    },
    {
      templateId: 'cruiser',
      name: 'UES Aggressor',
      faction: 'enemy',
      flagship: true,
      x: -80000,
      y: 60000,
      vx: 2.0,
      vy: -1.5,
    },
    {
      templateId: 'frigate',
      name: 'UES Raider',
      faction: 'enemy',
      x: -75000,
      y: 65000,
      vx: 2.2,
      vy: -1.3,
    },
  ],
};
