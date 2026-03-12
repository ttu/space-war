/**
 * Default demo scenario: Inner solar system — Mercury, Venus, Terra, Mars.
 * Player fleet near Terra, enemy fleets at Venus, Terra, and Mars, plus enemies in transit Venus → Terra.
 */

import type { Scenario } from '../ScenarioLoader';
import { circularOrbitSpeed } from '../../../utils/OrbitalMechanics';

const SOL_MASS = 1.989e30;
const MERCURY_MASS = 3.301e23;
const VENUS_MASS = 4.867e24;
const TERRA_MASS = 5.972e24;
const MARS_MASS = 6.417e23;

// Orbital radii from Sol (km)
const MERCURY_ORBITAL_RADIUS = 57_900_000;
const VENUS_ORBITAL_RADIUS = 108_200_000;
const TERRA_ORBITAL_RADIUS = 150_000_000;
const MARS_ORBITAL_RADIUS = 228_000_000;

// Moon orbital radii from primary center (km) — mean/semi-major axis
// Luna: 384,400 (Earth); reduced for gameplay so the moon is closer to the action
const LUNA_ORBITAL_RADIUS = 150_000;
// Phobos: 9,378 (Mars); Deimos: 23,460 (Mars)
const PHOBOS_ORBITAL_RADIUS = 9_378;
const DEIMOS_ORBITAL_RADIUS = 23_460;

// Planet orbital speeds around Sol
const mercuryOrbitalSpeed = circularOrbitSpeed(SOL_MASS, MERCURY_ORBITAL_RADIUS);
const venusOrbitalSpeed = circularOrbitSpeed(SOL_MASS, VENUS_ORBITAL_RADIUS);
const terraOrbitalSpeed = circularOrbitSpeed(SOL_MASS, TERRA_ORBITAL_RADIUS);
const marsOrbitalSpeed = circularOrbitSpeed(SOL_MASS, MARS_ORBITAL_RADIUS);

// Moon orbital speeds
const lunaOrbitalSpeed = circularOrbitSpeed(TERRA_MASS, LUNA_ORBITAL_RADIUS);
const phobosOrbitalSpeed = circularOrbitSpeed(MARS_MASS, PHOBOS_ORBITAL_RADIUS);
const deimosOrbitalSpeed = circularOrbitSpeed(MARS_MASS, DEIMOS_ORBITAL_RADIUS);

// Station orbital radii (from primary center)
const STATION_TERRA_ORBITAL_RADIUS = 45_000; // km from Terra
const STATION_LUNA_ORBITAL_RADIUS = 2_500;  // km from Luna
const LUNA_MASS = 7.342e22;
const stationTerraOrbitalSpeed = circularOrbitSpeed(TERRA_MASS, STATION_TERRA_ORBITAL_RADIUS);
const stationLunaOrbitalSpeed = circularOrbitSpeed(LUNA_MASS, STATION_LUNA_ORBITAL_RADIUS);

// Ship orbital speeds
const shipOrbitalSpeedTerra = circularOrbitSpeed(TERRA_MASS, 42000);
const shipOrbitalSpeedVenus = circularOrbitSpeed(VENUS_MASS, 18000);
const shipOrbitalSpeedMars = circularOrbitSpeed(MARS_MASS, 20000);

// Planet positions — spread around orbit for visual variety
// Mercury at 210° (lower-left), Venus at 315° (lower-right), Terra at 0° (+X), Mars at 90° (+Y)
const DEG_TO_RAD = Math.PI / 180;

const MERCURY_ANGLE = 210 * DEG_TO_RAD;
const MERCURY_X = Math.cos(MERCURY_ANGLE) * MERCURY_ORBITAL_RADIUS;
const MERCURY_Y = Math.sin(MERCURY_ANGLE) * MERCURY_ORBITAL_RADIUS;
// Velocity perpendicular to radius (90° ahead of position angle)
const MERCURY_VX = -Math.sin(MERCURY_ANGLE) * mercuryOrbitalSpeed;
const MERCURY_VY = Math.cos(MERCURY_ANGLE) * mercuryOrbitalSpeed;

const VENUS_ANGLE = 315 * DEG_TO_RAD;
const VENUS_X = Math.cos(VENUS_ANGLE) * VENUS_ORBITAL_RADIUS;
const VENUS_Y = Math.sin(VENUS_ANGLE) * VENUS_ORBITAL_RADIUS;
const VENUS_VX = -Math.sin(VENUS_ANGLE) * venusOrbitalSpeed;
const VENUS_VY = Math.cos(VENUS_ANGLE) * venusOrbitalSpeed;

const TERRA_X = TERRA_ORBITAL_RADIUS; // 0° = +X axis
const TERRA_Y = 0;

const MARS_X = 0; // 90° = +Y axis
const MARS_Y = MARS_ORBITAL_RADIUS;

// Venus → Terra transfer: direction and speed (km/s) for ships in transit
const VENUS_TO_TERRA_DX = TERRA_X - VENUS_X;
const VENUS_TO_TERRA_DY = TERRA_Y - VENUS_Y;
const VENUS_TO_TERRA_DIST = Math.sqrt(VENUS_TO_TERRA_DX ** 2 + VENUS_TO_TERRA_DY ** 2);
const TRANSFER_SPEED_KMS = 12;
const transferVx = VENUS_VX + (VENUS_TO_TERRA_DX / VENUS_TO_TERRA_DIST) * TRANSFER_SPEED_KMS;
const transferVy = VENUS_VY + (VENUS_TO_TERRA_DY / VENUS_TO_TERRA_DIST) * TRANSFER_SPEED_KMS;

export const demoScenario: Scenario = {
  celestials: [
    // --- Star ---
    {
      name: 'Sol', mass: SOL_MASS, radius: 696_000, bodyType: 'star',
      x: 0, y: 0,
    },
    // --- Mercury (no moons) ---
    {
      name: 'Mercury', mass: MERCURY_MASS, radius: 2440, bodyType: 'planet',
      x: MERCURY_X, y: MERCURY_Y,
      vx: MERCURY_VX, vy: MERCURY_VY,
    },
    // --- Venus (no moons) ---
    {
      name: 'Venus', mass: VENUS_MASS, radius: 6052, bodyType: 'planet',
      x: VENUS_X, y: VENUS_Y,
      vx: VENUS_VX, vy: VENUS_VY,
    },
    // --- Terra + Luna ---
    {
      name: 'Terra', mass: TERRA_MASS, radius: 6371, bodyType: 'planet',
      x: TERRA_X, y: TERRA_Y,
      vx: 0, vy: terraOrbitalSpeed,
    },
    {
      name: 'Luna', mass: 7.342e22, radius: 1737, bodyType: 'moon',
      x: TERRA_X, y: TERRA_Y + LUNA_ORBITAL_RADIUS,
      vx: -lunaOrbitalSpeed, vy: terraOrbitalSpeed,
      primaryName: 'Terra',
    },
    // --- Space stations ---
    {
      name: 'Terra Station', mass: 1e12, radius: 50, bodyType: 'station',
      x: TERRA_X + STATION_TERRA_ORBITAL_RADIUS, y: TERRA_Y,
      vx: 0, vy: terraOrbitalSpeed + stationTerraOrbitalSpeed,
      primaryName: 'Terra',
    },
    {
      name: 'Luna Station', mass: 1e12, radius: 50, bodyType: 'station',
      x: TERRA_X + STATION_LUNA_ORBITAL_RADIUS, y: TERRA_Y + LUNA_ORBITAL_RADIUS,
      vx: -lunaOrbitalSpeed, vy: terraOrbitalSpeed + stationLunaOrbitalSpeed,
      primaryName: 'Luna',
    },
    // --- Mars + Phobos + Deimos ---
    {
      name: 'Mars', mass: MARS_MASS, radius: 3390, bodyType: 'planet',
      x: MARS_X, y: MARS_Y,
      vx: -marsOrbitalSpeed, vy: 0,
    },
    {
      name: 'Phobos', mass: 1.0659e16, radius: 11, bodyType: 'moon',
      x: MARS_X + PHOBOS_ORBITAL_RADIUS, y: MARS_Y,
      vx: -marsOrbitalSpeed, vy: phobosOrbitalSpeed,
      primaryName: 'Mars',
    },
    {
      name: 'Deimos', mass: 1.4762e15, radius: 6, bodyType: 'moon',
      x: MARS_X - DEIMOS_ORBITAL_RADIUS, y: MARS_Y,
      vx: -marsOrbitalSpeed, vy: -deimosOrbitalSpeed,
      primaryName: 'Mars',
    },
  ],
  ships: [
    // --- Player fleet near Terra ---
    {
      templateId: 'cruiser', name: 'TCS Resolute', faction: 'player', flagship: true,
      x: TERRA_X + 42000, y: TERRA_Y,
      vx: 0, vy: terraOrbitalSpeed + shipOrbitalSpeedTerra,
    },
    {
      templateId: 'destroyer', name: 'TCS Vigilant', faction: 'player',
      x: TERRA_X + 42500, y: TERRA_Y + 1000,
      vx: 0, vy: terraOrbitalSpeed + shipOrbitalSpeedTerra * 0.99,
    },
    // --- Enemy fleet near Terra (lower left of Earth) ---
    {
      templateId: 'cruiser', name: 'UES Aggressor', faction: 'enemy', flagship: true,
      x: TERRA_X - 80000, y: TERRA_Y - 60000,
      vx: 2.0, vy: terraOrbitalSpeed - 1.5,
    },
    {
      templateId: 'frigate', name: 'UES Raider', faction: 'enemy',
      x: TERRA_X - 75000, y: TERRA_Y - 65000,
      vx: 2.2, vy: terraOrbitalSpeed - 1.3,
    },
    // --- Enemy fleet near Venus ---
    {
      templateId: 'cruiser', name: 'UES Vanguard', faction: 'enemy',
      x: VENUS_X + 18000, y: VENUS_Y,
      vx: VENUS_VX, vy: VENUS_VY + shipOrbitalSpeedVenus,
    },
    {
      templateId: 'destroyer', name: 'UES Serpent', faction: 'enemy',
      x: VENUS_X + 18500, y: VENUS_Y + 800,
      vx: VENUS_VX, vy: VENUS_VY + shipOrbitalSpeedVenus * 0.98,
    },
    {
      templateId: 'frigate', name: 'UES Viper', faction: 'enemy',
      x: VENUS_X + 17500, y: VENUS_Y - 600,
      vx: VENUS_VX, vy: VENUS_VY + shipOrbitalSpeedVenus * 1.02,
    },
    // --- Enemy ships in transit Venus → Terra ---
    {
      templateId: 'cruiser', name: 'UES Invader', faction: 'enemy',
      x: VENUS_X + VENUS_TO_TERRA_DX * 0.25, y: VENUS_Y + VENUS_TO_TERRA_DY * 0.25,
      vx: transferVx, vy: transferVy,
    },
    {
      templateId: 'destroyer', name: 'UES Marauder', faction: 'enemy',
      x: VENUS_X + VENUS_TO_TERRA_DX * 0.5, y: VENUS_Y + VENUS_TO_TERRA_DY * 0.5,
      vx: transferVx * 0.98, vy: transferVy * 1.02,
    },
    {
      templateId: 'frigate', name: 'UES Scout', faction: 'enemy',
      x: VENUS_X + VENUS_TO_TERRA_DX * 0.75, y: VENUS_Y + VENUS_TO_TERRA_DY * 0.75,
      vx: transferVx * 1.01, vy: transferVy * 0.99,
    },
    // --- Enemy fleet near Mars ---
    {
      templateId: 'cruiser', name: 'UES Warhammer', faction: 'enemy',
      x: MARS_X, y: MARS_Y + 20000,
      vx: -marsOrbitalSpeed - shipOrbitalSpeedMars, vy: 0,
    },
    {
      templateId: 'destroyer', name: 'UES Stalker', faction: 'enemy',
      x: MARS_X, y: MARS_Y + 21000,
      vx: -marsOrbitalSpeed - shipOrbitalSpeedMars * 0.98, vy: 0,
    },
    {
      templateId: 'frigate', name: 'UES Fang', faction: 'enemy',
      x: MARS_X - 1000, y: MARS_Y + 19500,
      vx: -marsOrbitalSpeed - shipOrbitalSpeedMars * 1.01, vy: 0,
    },
  ],
};
