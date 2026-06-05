/**
 * "Into the Dark" — stealth infiltration scenario.
 *
 * 3 enemy corvettes orbit brown dwarf "Darkwatch" at 50,000 km.
 * Patrol sensors detect normal ships at ~91,000 km — wider than the
 * 86,600 km chord gap between any two patrols. Going dark reduces thermal
 * signature 90%, cutting detection to ~29,000 km and letting you slip through
 * the 43,300 km half-gap safely.
 *
 * Victory: at least 1 player ship reaches the Exile zone at (150,000, 0).
 * Defeat: any patrol ship detects a player ship.
 */

import type { Scenario } from '../ScenarioLoader';
import { circularOrbitSpeed } from '../../../utils/OrbitalMechanics';

// Brown dwarf Darkwatch — ~3 Jupiter masses; orbital period at 50,000 km ≈ 3600 s
const DARKWATCH_MASS = 5.7e27; // kg
const PATROL_RADIUS = 50_000; // km

const patrolSpeed = circularOrbitSpeed(DARKWATCH_MASS, PATROL_RADIUS);

function patrolShip(name: string, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return {
    templateId: 'corvette' as const,
    name,
    faction: 'enemy' as const,
    x: PATROL_RADIUS * Math.cos(a),
    y: PATROL_RADIUS * Math.sin(a),
    vx: -patrolSpeed * Math.sin(a),
    vy: patrolSpeed * Math.cos(a),
    stationKeeping: false,
    loadout: { sensor: 'sensor_stealth_patrol', missileLauncher: undefined, railgun: undefined, pdc: undefined },
  };
}

export const stealthScenario: Scenario = {
  stealthMode: true,
  celestials: [
    {
      name: 'Darkwatch',
      mass: DARKWATCH_MASS,
      radius: 1_000,
      bodyType: 'star',
      x: 0,
      y: 0,
    },
    {
      name: 'Haven',
      mass: 1e20,
      radius: 800,
      bodyType: 'planet',
      x: -150_000,
      y: 0,
    },
    {
      name: 'Exile',
      mass: 1e20,
      radius: 800,
      bodyType: 'planet',
      x: 150_000,
      y: 0,
    },
  ],
  ships: [
    {
      templateId: 'corvette',
      name: 'TCS Phantom',
      faction: 'player',
      flagship: true,
      x: -150_000,
      y: 2_000,
      vx: 100,
      vy: 0,
      stationKeeping: false,
    },
    {
      templateId: 'corvette',
      name: 'TCS Wraith',
      faction: 'player',
      x: -150_000,
      y: -2_000,
      vx: 100,
      vy: 0,
      stationKeeping: false,
    },
    patrolShip('UES Watchman', 0),
    patrolShip('UES Sentinel', 120),
    patrolShip('UES Guardian', 240),
  ],
  zones: [
    {
      x: 150_000,
      y: 0,
      faction: 'player',
      requiredCount: 1,
      radius: 20_000,
    },
  ],
};
