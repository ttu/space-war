/**
 * 1v1 Proving Grounds: Compact red dwarf system for tuning combat mechanics.
 * Destroyer vs Destroyer default. Edit templateId values to try other matchups.
 * Change player ship faction to 'enemy' + add a second enemy faction for AI-vs-AI observation.
 */

import type { Scenario } from "../ScenarioLoader";
import { circularOrbitSpeed } from "../../../utils/OrbitalMechanics";

// --- Central body: dim red dwarf ---
const STAR_MASS = 1.6e27; // Low mass — keeps orbital speeds ≤30 km/s for gameplay
const STAR_RADIUS = 35_000; // km

// --- Planets ---
const ANVIL_MASS = 4.0e23;
const ANVIL_RADIUS = 3_000;
const ANVIL_ORBITAL_RADIUS = 120_000; // km from star

const CRUCIBLE_MASS = 7.0e23;
const CRUCIBLE_RADIUS = 4_500;
const CRUCIBLE_ORBITAL_RADIUS = 350_000; // km from star

// --- Asteroids ---
const ASTEROID_MASS = 1e15;
const ASTEROID_RADIUS = 5;

const DEG_TO_RAD = Math.PI / 180;

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

// Planet positions
const anvil = orbitState(STAR_MASS, ANVIL_ORBITAL_RADIUS, 315);   // lower-right
const crucible = orbitState(STAR_MASS, CRUCIBLE_ORBITAL_RADIUS, 45); // upper-right

// Ship positions: both orbit Kael at Anvil's radius, ~30° apart (~62k km) for fast engagement
// Offset from Anvil (315°) and Crucible (45°) to avoid planetary LOS blockage
const playerOrbit = orbitState(STAR_MASS, ANVIL_ORBITAL_RADIUS, 240);  // well clear of planets
const enemyOrbit = orbitState(STAR_MASS, ANVIL_ORBITAL_RADIUS, 270);   // 30° away from player

// Asteroid corridor between the two planets (~180k-280k km from star)
const asteroidPositions = [
  { angle: 80, dist: 190_000 },
  { angle: 110, dist: 220_000 },
  { angle: 140, dist: 240_000 },
  { angle: 170, dist: 260_000 },
  { angle: 210, dist: 230_000 },
  { angle: 250, dist: 200_000 },
];

export const provingGroundsScenario: Scenario = {
  celestials: [
    // --- Star ---
    {
      name: "Kael",
      mass: STAR_MASS,
      radius: STAR_RADIUS,
      bodyType: "star",
      x: 0,
      y: 0,
    },
    // --- Anvil (inner planet, 200°) ---
    {
      name: "Anvil",
      mass: ANVIL_MASS,
      radius: ANVIL_RADIUS,
      bodyType: "planet",
      x: anvil.x,
      y: anvil.y,
      vx: anvil.vx,
      vy: anvil.vy,
      primaryName: "Kael",
    },
    // --- Crucible (outer planet, 45°) ---
    {
      name: "Crucible",
      mass: CRUCIBLE_MASS,
      radius: CRUCIBLE_RADIUS,
      bodyType: "planet",
      x: crucible.x,
      y: crucible.y,
      vx: crucible.vx,
      vy: crucible.vy,
      primaryName: "Kael",
    },
    // --- Asteroid corridor ---
    ...asteroidPositions.map((a, i) => {
      const s = orbitState(STAR_MASS, a.dist, a.angle);
      return {
        name: `Asteroid ${i + 1}`,
        mass: ASTEROID_MASS,
        radius: ASTEROID_RADIUS,
        bodyType: "asteroid" as const,
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        primaryName: "Kael",
      };
    }),
  ],
  ships: [
    // --- Player ship at 315° on Anvil orbit ---
    {
      templateId: "destroyer",
      name: "TCS Hammer",
      faction: "player",
      flagship: true,
      x: playerOrbit.x,
      y: playerOrbit.y,
      vx: playerOrbit.vx,
      vy: playerOrbit.vy,
    },
    // --- Enemy ship at 345° on Anvil orbit (~62k km from player) ---
    {
      templateId: "destroyer",
      name: "UES Striker",
      faction: "enemy",
      flagship: true,
      x: enemyOrbit.x,
      y: enemyOrbit.y,
      vx: enemyOrbit.vx,
      vy: enemyOrbit.vy,
    },
  ],
};
