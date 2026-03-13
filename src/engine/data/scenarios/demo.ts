/**
 * Compact demo scenario: A small red dwarf system with rocky planets, moons,
 * asteroids, and a station — all within ~500k km of each other.
 * Player patrol fleet near Petra vs 4 enemy fleets converging from different directions.
 */

import type { Scenario } from '../ScenarioLoader';
import { circularOrbitSpeed } from '../../../utils/OrbitalMechanics';

// --- Central body: a dim red dwarf ---
const STAR_MASS = 2.0e29; // ~0.1 solar mass
const STAR_RADIUS = 30_000; // km (visual radius, compact for gameplay)

// --- Planets (small rocky worlds) ---
const PETRA_MASS = 3.0e23;
const PETRA_RADIUS = 2200;
const PETRA_ORBITAL_RADIUS = 180_000; // km from star

const FORGE_MASS = 5.0e23;
const FORGE_RADIUS = 2800;
const FORGE_ORBITAL_RADIUS = 250_000; // km from star

const CALYX_MASS = 8.0e23;
const CALYX_RADIUS = 3100;
const CALYX_ORBITAL_RADIUS = 350_000; // km from star

const WRAITH_MASS = 2.0e23;
const WRAITH_RADIUS = 1800;
const WRAITH_ORBITAL_RADIUS = 420_000; // km from star

const HAVEN_MASS = 6.0e23;
const HAVEN_RADIUS = 2600;
const HAVEN_ORBITAL_RADIUS = 480_000; // km from star

// --- Moons ---
const PETRA_MOON_MASS = 1.5e20;
const PETRA_MOON_RADIUS = 400;
const PETRA_MOON_ORBITAL_RADIUS = 8_000; // km from Petra

const CALYX_MOON_MASS = 5.0e21;
const CALYX_MOON_RADIUS = 900;
const CALYX_MOON_ORBITAL_RADIUS = 12_000; // km from Calyx

const HAVEN_MOON_MASS = 3.0e20;
const HAVEN_MOON_RADIUS = 500;
const HAVEN_MOON_ORBITAL_RADIUS = 7_000; // km from Haven

// --- Asteroids (negligible mass, small radius) ---
const ASTEROID_MASS = 1e15;
const ASTEROID_RADIUS = 5;

const DEG_TO_RAD = Math.PI / 180;

// Helper: compute position and velocity for a body at a given angle on a circular orbit
function orbitState(centralMass: number, radius: number, angleDeg: number) {
  const rad = angleDeg * DEG_TO_RAD;
  const speed = circularOrbitSpeed(centralMass, radius);
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
    vx: -Math.sin(rad) * speed,
    vy: Math.cos(rad) * speed,
  };
}

// Planet orbital states (spread around the star)
const petra = orbitState(STAR_MASS, PETRA_ORBITAL_RADIUS, 0);     // right
const forge = orbitState(STAR_MASS, FORGE_ORBITAL_RADIUS, 60);    // upper-right
const calyx = orbitState(STAR_MASS, CALYX_ORBITAL_RADIUS, 150);   // upper-left
const wraith = orbitState(STAR_MASS, WRAITH_ORBITAL_RADIUS, 220); // lower-left
const haven = orbitState(STAR_MASS, HAVEN_ORBITAL_RADIUS, 310);   // lower-right

// Moon orbital speeds
const petraMoonOrbitalSpeed = circularOrbitSpeed(PETRA_MASS, PETRA_MOON_ORBITAL_RADIUS);
const calyxMoonOrbitalSpeed = circularOrbitSpeed(CALYX_MASS, CALYX_MOON_ORBITAL_RADIUS);
const havenMoonOrbitalSpeed = circularOrbitSpeed(HAVEN_MASS, HAVEN_MOON_ORBITAL_RADIUS);

// Station orbiting Calyx
const STATION_ORBITAL_RADIUS = 6_000;
const stationOrbitalSpeed = circularOrbitSpeed(CALYX_MASS, STATION_ORBITAL_RADIUS);

// Ship orbital speeds
const shipOrbitalSpeedPetra = circularOrbitSpeed(PETRA_MASS, 10_000);
const shipOrbitalSpeedCalyx = circularOrbitSpeed(CALYX_MASS, 15_000);

// Asteroid belt positions — scattered between Forge and Calyx (~270k-330k km from star)
const asteroidPositions = [
  { angle: 30, dist: 280_000 },
  { angle: 75, dist: 310_000 },
  { angle: 110, dist: 290_000 },
  { angle: 180, dist: 300_000 },
  { angle: 240, dist: 320_000 },
  { angle: 330, dist: 285_000 },
];

// Asteroid belt fleet orbital states (reuse orbitState for ships in the belt)
const gammaA = orbitState(STAR_MASS, 295_000, 75);
const gammaB = orbitState(STAR_MASS, 300_000, 78);
const gammaC = orbitState(STAR_MASS, 305_000, 72);

export const demoScenario: Scenario = {
  celestials: [
    // --- Star ---
    {
      name: 'Ember', mass: STAR_MASS, radius: STAR_RADIUS, bodyType: 'star',
      x: 0, y: 0,
    },
    // --- Petra (inner planet, 0°) + moon Shard ---
    {
      name: 'Petra', mass: PETRA_MASS, radius: PETRA_RADIUS, bodyType: 'planet',
      x: petra.x, y: petra.y,
      vx: petra.vx, vy: petra.vy,
      primaryName: 'Ember',
    },
    {
      name: 'Shard', mass: PETRA_MOON_MASS, radius: PETRA_MOON_RADIUS, bodyType: 'moon',
      x: petra.x + PETRA_MOON_ORBITAL_RADIUS, y: petra.y,
      vx: petra.vx, vy: petra.vy + petraMoonOrbitalSpeed,
      primaryName: 'Petra',
    },
    // --- Forge (60°, no moons) ---
    {
      name: 'Forge', mass: FORGE_MASS, radius: FORGE_RADIUS, bodyType: 'planet',
      x: forge.x, y: forge.y,
      vx: forge.vx, vy: forge.vy,
      primaryName: 'Ember',
    },
    // --- Calyx (150°) + moon Dusk + station ---
    {
      name: 'Calyx', mass: CALYX_MASS, radius: CALYX_RADIUS, bodyType: 'planet',
      x: calyx.x, y: calyx.y,
      vx: calyx.vx, vy: calyx.vy,
      primaryName: 'Ember',
    },
    {
      name: 'Dusk', mass: CALYX_MOON_MASS, radius: CALYX_MOON_RADIUS, bodyType: 'moon',
      x: calyx.x, y: calyx.y + CALYX_MOON_ORBITAL_RADIUS,
      vx: calyx.vx - calyxMoonOrbitalSpeed, vy: calyx.vy,
      primaryName: 'Calyx',
    },
    {
      name: 'Calyx Station', mass: 1e12, radius: 50, bodyType: 'station',
      x: calyx.x - STATION_ORBITAL_RADIUS, y: calyx.y,
      vx: calyx.vx, vy: calyx.vy - stationOrbitalSpeed,
      primaryName: 'Calyx',
    },
    // --- Wraith (220°, barren dwarf) ---
    {
      name: 'Wraith', mass: WRAITH_MASS, radius: WRAITH_RADIUS, bodyType: 'planet',
      x: wraith.x, y: wraith.y,
      vx: wraith.vx, vy: wraith.vy,
      primaryName: 'Ember',
    },
    // --- Haven (310°) + moon Glint ---
    {
      name: 'Haven', mass: HAVEN_MASS, radius: HAVEN_RADIUS, bodyType: 'planet',
      x: haven.x, y: haven.y,
      vx: haven.vx, vy: haven.vy,
      primaryName: 'Ember',
    },
    {
      name: 'Glint', mass: HAVEN_MOON_MASS, radius: HAVEN_MOON_RADIUS, bodyType: 'moon',
      x: haven.x + HAVEN_MOON_ORBITAL_RADIUS, y: haven.y,
      vx: haven.vx, vy: haven.vy + havenMoonOrbitalSpeed,
      primaryName: 'Haven',
    },
    // --- Asteroid belt (between Forge and Calyx) ---
    ...asteroidPositions.map((a, i) => {
      const s = orbitState(STAR_MASS, a.dist, a.angle);
      return {
        name: `Asteroid ${i + 1}`,
        mass: ASTEROID_MASS,
        radius: ASTEROID_RADIUS,
        bodyType: 'asteroid' as const,
        x: s.x, y: s.y,
        vx: s.vx, vy: s.vy,
        primaryName: 'Ember',
      };
    }),
  ],
  ships: [
    // ============================
    // Player patrol fleet near Petra
    // ============================
    {
      templateId: 'cruiser', name: 'TCS Resolute', faction: 'player', flagship: true,
      x: petra.x + 10_000, y: petra.y,
      vx: petra.vx, vy: petra.vy + shipOrbitalSpeedPetra,
    },
    {
      templateId: 'destroyer', name: 'TCS Vigilant', faction: 'player',
      x: petra.x + 10_500, y: petra.y + 800,
      vx: petra.vx, vy: petra.vy + shipOrbitalSpeedPetra * 0.99,
    },

    // ============================
    // Enemy Fleet Alpha — approaching from deep space (below-right)
    // ============================
    {
      templateId: 'cruiser', name: 'UES Warhammer', faction: 'enemy', flagship: true,
      x: 400_000, y: -200_000,
      vx: -3.0, vy: 2.0,
    },
    {
      templateId: 'destroyer', name: 'UES Fang', faction: 'enemy',
      x: 401_000, y: -201_500,
      vx: -3.0, vy: 2.0,
    },
    {
      templateId: 'frigate', name: 'UES Razor', faction: 'enemy',
      x: 399_000, y: -199_000,
      vx: -2.9, vy: 2.1,
    },

    // ============================
    // Enemy Fleet Beta — near Calyx
    // ============================
    {
      templateId: 'cruiser', name: 'UES Vanguard', faction: 'enemy', flagship: true,
      x: calyx.x + 15_000, y: calyx.y,
      vx: calyx.vx, vy: calyx.vy + shipOrbitalSpeedCalyx,
    },
    {
      templateId: 'destroyer', name: 'UES Serpent', faction: 'enemy',
      x: calyx.x + 15_500, y: calyx.y + 600,
      vx: calyx.vx, vy: calyx.vy + shipOrbitalSpeedCalyx * 0.98,
    },
    {
      templateId: 'frigate', name: 'UES Viper', faction: 'enemy',
      x: calyx.x + 14_500, y: calyx.y - 500,
      vx: calyx.vx, vy: calyx.vy + shipOrbitalSpeedCalyx * 1.02,
    },
    {
      templateId: 'corvette', name: 'UES Dart', faction: 'enemy',
      x: calyx.x + 16_000, y: calyx.y + 1_200,
      vx: calyx.vx, vy: calyx.vy + shipOrbitalSpeedCalyx * 0.97,
    },

    // ============================
    // Enemy Fleet Gamma — hiding in asteroid belt
    // ============================
    {
      templateId: 'destroyer', name: 'UES Ambush', faction: 'enemy', flagship: true,
      x: gammaA.x, y: gammaA.y,
      vx: gammaA.vx, vy: gammaA.vy,
    },
    {
      templateId: 'frigate', name: 'UES Shadow', faction: 'enemy',
      x: gammaB.x, y: gammaB.y,
      vx: gammaB.vx, vy: gammaB.vy,
    },
    {
      templateId: 'corvette', name: 'UES Whisper', faction: 'enemy',
      x: gammaC.x, y: gammaC.y,
      vx: gammaC.vx, vy: gammaC.vy,
    },

    // ============================
    // Enemy Fleet Delta — inbound from upper-left
    // ============================
    {
      templateId: 'battleship', name: 'UES Colossus', faction: 'enemy', flagship: true,
      x: -300_000, y: 400_000,
      vx: 2.5, vy: -1.8,
    },
    {
      templateId: 'destroyer', name: 'UES Stalker', faction: 'enemy',
      x: -298_000, y: 401_000,
      vx: 2.5, vy: -1.8,
    },
    {
      templateId: 'frigate', name: 'UES Prowler', faction: 'enemy',
      x: -301_000, y: 399_000,
      vx: 2.4, vy: -1.9,
    },
  ],
};
