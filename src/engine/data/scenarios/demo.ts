/**
 * Demo scenario: A star system with many planets, moons, asteroids, and stations.
 * Planet orbital velocities range ~20-45 km/s (inner planets faster, outer slower).
 * Player patrol fleet near Aridus vs 4 enemy fleets converging from different directions.
 */

import type { Scenario } from "../ScenarioLoader";
import { circularOrbitSpeed } from "../../../utils/OrbitalMechanics";

// --- Central body: a small yellow star ---
const STAR_MASS = 6.0e27;
const STAR_RADIUS = 35_000; // km (visual radius)

// --- Planets (inner to outer) ---
const SCORCH_MASS = 1.5e23;
const SCORCH_RADIUS = 1400;
const SCORCH_ORBITAL_RADIUS = 150_000; // ~45 km/s — hot inner world

const EMBER_MASS = 2.8e23;
const EMBER_RADIUS = 1800;
const EMBER_ORBITAL_RADIUS = 220_000; // ~38 km/s

const ARIDUS_MASS = 4.0e23;
const ARIDUS_RADIUS = 2400;
const ARIDUS_ORBITAL_RADIUS = 350_000; // ~34 km/s

const CRUCIBLE_MASS = 6.0e23;
const CRUCIBLE_RADIUS = 2900;
const CRUCIBLE_ORBITAL_RADIUS = 420_000; // ~31 km/s

const TUNDRA_MASS = 9.0e23;
const TUNDRA_RADIUS = 3300;
const TUNDRA_ORBITAL_RADIUS = 500_000; // ~28 km/s

const CINDER_MASS = 2.5e23;
const CINDER_RADIUS = 1900;
const CINDER_ORBITAL_RADIUS = 580_000; // ~26 km/s

const BASTION_MASS = 7.0e23;
const BASTION_RADIUS = 2700;
const BASTION_ORBITAL_RADIUS = 650_000; // ~25 km/s

const DRIFT_MASS = 1.2e24;
const DRIFT_RADIUS = 3600;
const DRIFT_ORBITAL_RADIUS = 850_000; // ~22 km/s — large outer world

const SENTINEL_MASS = 3.5e23;
const SENTINEL_RADIUS = 2100;
const SENTINEL_ORBITAL_RADIUS = 1_100_000; // ~19 km/s — distant outpost

// --- Moons ---
const ARIDUS_MOON_MASS = 2.0e20;
const ARIDUS_MOON_RADIUS = 450;
const ARIDUS_MOON_ORBITAL_RADIUS = 9_000;

const TUNDRA_MOON_MASS = 6.0e21;
const TUNDRA_MOON_RADIUS = 950;
const TUNDRA_MOON_ORBITAL_RADIUS = 13_000;

const BASTION_MOON_MASS = 4.0e20;
const BASTION_MOON_RADIUS = 550;
const BASTION_MOON_ORBITAL_RADIUS = 8_000;

const DRIFT_MOON_A_MASS = 8.0e21;
const DRIFT_MOON_A_RADIUS = 1100;
const DRIFT_MOON_A_ORBITAL_RADIUS = 15_000;

const DRIFT_MOON_B_MASS = 1.5e20;
const DRIFT_MOON_B_RADIUS = 350;
const DRIFT_MOON_B_ORBITAL_RADIUS = 25_000;

const EMBER_MOON_MASS = 1.0e20;
const EMBER_MOON_RADIUS = 300;
const EMBER_MOON_ORBITAL_RADIUS = 6_000;

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
const scorch = orbitState(STAR_MASS, SCORCH_ORBITAL_RADIUS, 30);
const ember = orbitState(STAR_MASS, EMBER_ORBITAL_RADIUS, 95);
const aridus = orbitState(STAR_MASS, ARIDUS_ORBITAL_RADIUS, 0);
const crucible = orbitState(STAR_MASS, CRUCIBLE_ORBITAL_RADIUS, 65);
const tundra = orbitState(STAR_MASS, TUNDRA_ORBITAL_RADIUS, 145);
const cinder = orbitState(STAR_MASS, CINDER_ORBITAL_RADIUS, 215);
const bastion = orbitState(STAR_MASS, BASTION_ORBITAL_RADIUS, 305);
const drift = orbitState(STAR_MASS, DRIFT_ORBITAL_RADIUS, 180);
const sentinel = orbitState(STAR_MASS, SENTINEL_ORBITAL_RADIUS, 260);

// Moon orbital speeds
const aridusMoonOrbitalSpeed = circularOrbitSpeed(
  ARIDUS_MASS,
  ARIDUS_MOON_ORBITAL_RADIUS,
);
const tundraMoonOrbitalSpeed = circularOrbitSpeed(
  TUNDRA_MASS,
  TUNDRA_MOON_ORBITAL_RADIUS,
);
const bastionMoonOrbitalSpeed = circularOrbitSpeed(
  BASTION_MASS,
  BASTION_MOON_ORBITAL_RADIUS,
);
const driftMoonAOrbitalSpeed = circularOrbitSpeed(
  DRIFT_MASS,
  DRIFT_MOON_A_ORBITAL_RADIUS,
);
const driftMoonBOrbitalSpeed = circularOrbitSpeed(
  DRIFT_MASS,
  DRIFT_MOON_B_ORBITAL_RADIUS,
);
const emberMoonOrbitalSpeed = circularOrbitSpeed(
  EMBER_MASS,
  EMBER_MOON_ORBITAL_RADIUS,
);

// Station orbiting Tundra
const TUNDRA_STATION_ORBITAL_RADIUS = 7_000;
const tundraStationOrbitalSpeed = circularOrbitSpeed(
  TUNDRA_MASS,
  TUNDRA_STATION_ORBITAL_RADIUS,
);

// Station orbiting Drift
const DRIFT_STATION_ORBITAL_RADIUS = 10_000;
const driftStationOrbitalSpeed = circularOrbitSpeed(
  DRIFT_MASS,
  DRIFT_STATION_ORBITAL_RADIUS,
);

// Ship orbital speeds around their host planet
const shipOrbitalSpeedAridus = circularOrbitSpeed(ARIDUS_MASS, 10_000);
const shipOrbitalSpeedTundra = circularOrbitSpeed(TUNDRA_MASS, 15_000);

// Inner asteroid belt — between Ember and Aridus (~260k-320k km)
const innerAsteroidPositions = [
  { angle: 10, dist: 270_000 },
  { angle: 50, dist: 290_000 },
  { angle: 130, dist: 280_000 },
  { angle: 200, dist: 300_000 },
  { angle: 310, dist: 275_000 },
];

// Outer asteroid belt — between Crucible and Tundra (~440k-490k km)
const outerAsteroidPositions = [
  { angle: 35, dist: 445_000 },
  { angle: 80, dist: 475_000 },
  { angle: 115, dist: 455_000 },
  { angle: 185, dist: 465_000 },
  { angle: 245, dist: 480_000 },
  { angle: 335, dist: 450_000 },
];

// Asteroid belt fleet orbital states (hiding in outer belt)
const gammaA = orbitState(STAR_MASS, 460_000, 80);
const gammaB = orbitState(STAR_MASS, 465_000, 83);
const gammaC = orbitState(STAR_MASS, 470_000, 77);

export const demoScenario: Scenario = {
  celestials: [
    // --- Star ---
    {
      name: "Solace",
      mass: STAR_MASS,
      radius: STAR_RADIUS,
      bodyType: "star",
      x: 0,
      y: 0,
    },
    // --- Scorch (inner hot world, 30°) ---
    {
      name: "Scorch",
      mass: SCORCH_MASS,
      radius: SCORCH_RADIUS,
      bodyType: "planet",
      x: scorch.x,
      y: scorch.y,
      vx: scorch.vx,
      vy: scorch.vy,
      primaryName: "Solace",
    },
    // --- Ember (95°) + moon Crag ---
    {
      name: "Ember",
      mass: EMBER_MASS,
      radius: EMBER_RADIUS,
      bodyType: "planet",
      x: ember.x,
      y: ember.y,
      vx: ember.vx,
      vy: ember.vy,
      primaryName: "Solace",
    },
    {
      name: "Crag",
      mass: EMBER_MOON_MASS,
      radius: EMBER_MOON_RADIUS,
      bodyType: "moon",
      x: ember.x + EMBER_MOON_ORBITAL_RADIUS,
      y: ember.y,
      vx: ember.vx,
      vy: ember.vy + emberMoonOrbitalSpeed,
      primaryName: "Ember",
    },
    // --- Aridus (0°) + moon Pebble ---
    {
      name: "Aridus",
      mass: ARIDUS_MASS,
      radius: ARIDUS_RADIUS,
      bodyType: "planet",
      x: aridus.x,
      y: aridus.y,
      vx: aridus.vx,
      vy: aridus.vy,
      primaryName: "Solace",
    },
    {
      name: "Pebble",
      mass: ARIDUS_MOON_MASS,
      radius: ARIDUS_MOON_RADIUS,
      bodyType: "moon",
      x: aridus.x + ARIDUS_MOON_ORBITAL_RADIUS,
      y: aridus.y,
      vx: aridus.vx,
      vy: aridus.vy + aridusMoonOrbitalSpeed,
      primaryName: "Aridus",
    },
    // --- Crucible (65°, no moons) ---
    {
      name: "Crucible",
      mass: CRUCIBLE_MASS,
      radius: CRUCIBLE_RADIUS,
      bodyType: "planet",
      x: crucible.x,
      y: crucible.y,
      vx: crucible.vx,
      vy: crucible.vy,
      primaryName: "Solace",
    },
    // --- Tundra (145°) + moon Frost + station ---
    {
      name: "Tundra",
      mass: TUNDRA_MASS,
      radius: TUNDRA_RADIUS,
      bodyType: "planet",
      x: tundra.x,
      y: tundra.y,
      vx: tundra.vx,
      vy: tundra.vy,
      primaryName: "Solace",
    },
    {
      name: "Frost",
      mass: TUNDRA_MOON_MASS,
      radius: TUNDRA_MOON_RADIUS,
      bodyType: "moon",
      x: tundra.x,
      y: tundra.y + TUNDRA_MOON_ORBITAL_RADIUS,
      vx: tundra.vx - tundraMoonOrbitalSpeed,
      vy: tundra.vy,
      primaryName: "Tundra",
    },
    {
      name: "Tundra Station",
      mass: 1e12,
      radius: 50,
      bodyType: "station",
      x: tundra.x - TUNDRA_STATION_ORBITAL_RADIUS,
      y: tundra.y,
      vx: tundra.vx,
      vy: tundra.vy - tundraStationOrbitalSpeed,
      primaryName: "Tundra",
    },
    // --- Cinder (215°, barren) ---
    {
      name: "Cinder",
      mass: CINDER_MASS,
      radius: CINDER_RADIUS,
      bodyType: "planet",
      x: cinder.x,
      y: cinder.y,
      vx: cinder.vx,
      vy: cinder.vy,
      primaryName: "Solace",
    },
    // --- Bastion (305°) + moon Sentry ---
    {
      name: "Bastion",
      mass: BASTION_MASS,
      radius: BASTION_RADIUS,
      bodyType: "planet",
      x: bastion.x,
      y: bastion.y,
      vx: bastion.vx,
      vy: bastion.vy,
      primaryName: "Solace",
    },
    {
      name: "Sentry",
      mass: BASTION_MOON_MASS,
      radius: BASTION_MOON_RADIUS,
      bodyType: "moon",
      x: bastion.x + BASTION_MOON_ORBITAL_RADIUS,
      y: bastion.y,
      vx: bastion.vx,
      vy: bastion.vy + bastionMoonOrbitalSpeed,
      primaryName: "Bastion",
    },
    // --- Drift (180°, large outer world) + 2 moons + station ---
    {
      name: "Drift",
      mass: DRIFT_MASS,
      radius: DRIFT_RADIUS,
      bodyType: "planet",
      x: drift.x,
      y: drift.y,
      vx: drift.vx,
      vy: drift.vy,
      primaryName: "Solace",
    },
    {
      name: "Anchor",
      mass: DRIFT_MOON_A_MASS,
      radius: DRIFT_MOON_A_RADIUS,
      bodyType: "moon",
      x: drift.x + DRIFT_MOON_A_ORBITAL_RADIUS,
      y: drift.y,
      vx: drift.vx,
      vy: drift.vy + driftMoonAOrbitalSpeed,
      primaryName: "Drift",
    },
    {
      name: "Wisp",
      mass: DRIFT_MOON_B_MASS,
      radius: DRIFT_MOON_B_RADIUS,
      bodyType: "moon",
      x: drift.x,
      y: drift.y - DRIFT_MOON_B_ORBITAL_RADIUS,
      vx: drift.vx + driftMoonBOrbitalSpeed,
      vy: drift.vy,
      primaryName: "Drift",
    },
    {
      name: "Drift Depot",
      mass: 1e12,
      radius: 50,
      bodyType: "station",
      x: drift.x - DRIFT_STATION_ORBITAL_RADIUS,
      y: drift.y,
      vx: drift.vx,
      vy: drift.vy - driftStationOrbitalSpeed,
      primaryName: "Drift",
    },
    // --- Sentinel (260°, distant outpost) ---
    {
      name: "Sentinel",
      mass: SENTINEL_MASS,
      radius: SENTINEL_RADIUS,
      bodyType: "planet",
      x: sentinel.x,
      y: sentinel.y,
      vx: sentinel.vx,
      vy: sentinel.vy,
      primaryName: "Solace",
    },
    // --- Inner asteroid belt (between Ember and Aridus) ---
    ...innerAsteroidPositions.map((a, i) => {
      const s = orbitState(STAR_MASS, a.dist, a.angle);
      return {
        name: `Inner Rock ${i + 1}`,
        mass: ASTEROID_MASS,
        radius: ASTEROID_RADIUS,
        bodyType: "asteroid" as const,
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        primaryName: "Solace",
      };
    }),
    // --- Outer asteroid belt (between Crucible and Tundra) ---
    ...outerAsteroidPositions.map((a, i) => {
      const s = orbitState(STAR_MASS, a.dist, a.angle);
      return {
        name: `Outer Rock ${i + 1}`,
        mass: ASTEROID_MASS,
        radius: ASTEROID_RADIUS,
        bodyType: "asteroid" as const,
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        primaryName: "Solace",
      };
    }),
  ],
  ships: [
    // ============================
    // Player patrol fleet near Aridus
    // ============================
    {
      templateId: "cruiser",
      name: "TCS Resolute",
      faction: "player",
      flagship: true,
      x: aridus.x + 10_000,
      y: aridus.y,
      vx: 0,
      vy: shipOrbitalSpeedAridus,
    },
    {
      templateId: "destroyer",
      name: "TCS Vigilant",
      faction: "player",
      x: aridus.x + 10_500,
      y: aridus.y + 800,
      vx: 0,
      vy: shipOrbitalSpeedAridus * 0.99,
    },

    // ============================
    // Enemy Fleet Alpha — approaching from deep space (below-right)
    // ============================
    {
      templateId: "cruiser",
      name: "UES Warhammer",
      faction: "enemy",
      flagship: true,
      x: 550_000,
      y: -250_000,
      vx: -3.0,
      vy: 2.0,
    },
    {
      templateId: "destroyer",
      name: "UES Fang",
      faction: "enemy",
      x: 551_000,
      y: -251_500,
      vx: -3.0,
      vy: 2.0,
    },
    {
      templateId: "frigate",
      name: "UES Razor",
      faction: "enemy",
      x: 549_000,
      y: -249_000,
      vx: -2.9,
      vy: 2.1,
    },

    // ============================
    // Enemy Fleet Beta — near Tundra
    // ============================
    {
      templateId: "cruiser",
      name: "UES Vanguard",
      faction: "enemy",
      flagship: true,
      x: tundra.x + 15_000,
      y: tundra.y,
      vx: 0,
      vy: shipOrbitalSpeedTundra,
    },
    {
      templateId: "destroyer",
      name: "UES Serpent",
      faction: "enemy",
      x: tundra.x + 15_500,
      y: tundra.y + 600,
      vx: 0,
      vy: shipOrbitalSpeedTundra * 0.98,
    },
    {
      templateId: "frigate",
      name: "UES Viper",
      faction: "enemy",
      x: tundra.x + 14_500,
      y: tundra.y - 500,
      vx: 0,
      vy: shipOrbitalSpeedTundra * 1.02,
    },
    {
      templateId: "corvette",
      name: "UES Dart",
      faction: "enemy",
      x: tundra.x + 16_000,
      y: tundra.y + 1_200,
      vx: 0,
      vy: shipOrbitalSpeedTundra * 0.97,
    },

    // ============================
    // Enemy Fleet Gamma — hiding in outer asteroid belt
    // ============================
    {
      templateId: "destroyer",
      name: "UES Ambush",
      faction: "enemy",
      flagship: true,
      x: gammaA.x,
      y: gammaA.y,
    },
    {
      templateId: "frigate",
      name: "UES Shadow",
      faction: "enemy",
      x: gammaB.x,
      y: gammaB.y,
    },
    {
      templateId: "corvette",
      name: "UES Whisper",
      faction: "enemy",
      x: gammaC.x,
      y: gammaC.y,
    },

    // ============================
    // Enemy Fleet Delta — inbound from upper-left
    // ============================
    {
      templateId: "battleship",
      name: "UES Colossus",
      faction: "enemy",
      flagship: true,
      x: -400_000,
      y: 500_000,
      vx: 2.5,
      vy: -1.8,
    },
    {
      templateId: "destroyer",
      name: "UES Stalker",
      faction: "enemy",
      x: -398_000,
      y: 501_000,
      vx: 2.5,
      vy: -1.8,
    },
    {
      templateId: "frigate",
      name: "UES Prowler",
      faction: "enemy",
      x: -401_000,
      y: 499_000,
      vx: 2.4,
      vy: -1.9,
    },
  ],
};
