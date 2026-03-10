/**
 * Module template definitions. Each module type has stats that map to ECS components.
 * Used by ShipTemplates for default loadouts and by ScenarioLoader to create entities.
 */

// --- Missile launcher (stats for MissileLauncher component) ---
export interface MissileLauncherModule {
  id: string;
  name: string;
  kind: 'missile_launcher';
  salvoSize: number;
  reloadTime: number;
  maxRange: number;
  missileAccel: number;
  ammo: number;
  seekerRange: number;
  seekerSensitivity: number;
}

// --- PDC (stats for PDC component) ---
export interface PDCModule {
  id: string;
  name: string;
  kind: 'pdc';
  range: number;
  fireRate: number;
  damagePerHit: number;
}

// --- Railgun (stats for Railgun component) ---
export interface RailgunModule {
  id: string;
  name: string;
  kind: 'railgun';
  projectileSpeed: number;
  maxRange: number;
  reloadTime: number;
  damage: number;
}

// --- Sensor array (stats for SensorArray component) ---
export interface SensorModule {
  id: string;
  name: string;
  kind: 'sensor';
  maxRange: number;
  sensitivity: number;
}

export type ModuleTemplate =
  | MissileLauncherModule
  | PDCModule
  | RailgunModule
  | SensorModule;

export type ModuleKind = ModuleTemplate['kind'];

const missileLaunchers: MissileLauncherModule[] = [
  {
    id: 'ml_light_3',
    name: 'ML Light (3)',
    kind: 'missile_launcher',
    salvoSize: 3,
    reloadTime: 20,
    maxRange: 35_000,
    missileAccel: 0.6,
    ammo: 12,
    seekerRange: 3_000,
    seekerSensitivity: 3e-8,
  },
  {
    id: 'ml_medium_4',
    name: 'ML Medium (4)',
    kind: 'missile_launcher',
    salvoSize: 4,
    reloadTime: 25,
    maxRange: 40_000,
    missileAccel: 0.6,
    ammo: 16,
    seekerRange: 4_000,
    seekerSensitivity: 2e-8,
  },
  {
    id: 'ml_heavy_6',
    name: 'ML Heavy (6)',
    kind: 'missile_launcher',
    salvoSize: 6,
    reloadTime: 30,
    maxRange: 50_000,
    missileAccel: 0.5,
    ammo: 24,
    seekerRange: 5_000,
    seekerSensitivity: 1e-8,
  },
  {
    id: 'ml_battleship_8',
    name: 'ML Battleship (8)',
    kind: 'missile_launcher',
    salvoSize: 8,
    reloadTime: 35,
    maxRange: 55_000,
    missileAccel: 0.5,
    ammo: 32,
    seekerRange: 6_000,
    seekerSensitivity: 1e-8,
  },
];

const pdcs: PDCModule[] = [
  { id: 'pdc_light', name: 'PDC Light', kind: 'pdc', range: 4, fireRate: 60, damagePerHit: 1 },
  { id: 'pdc_standard', name: 'PDC Standard', kind: 'pdc', range: 5, fireRate: 80, damagePerHit: 1 },
  { id: 'pdc_heavy', name: 'PDC Heavy', kind: 'pdc', range: 5, fireRate: 100, damagePerHit: 1 },
  { id: 'pdc_battleship', name: 'PDC Battleship', kind: 'pdc', range: 6, fireRate: 120, damagePerHit: 1 },
];

const railguns: RailgunModule[] = [
  { id: 'rg_light', name: 'RG Light', kind: 'railgun', projectileSpeed: 90, maxRange: 6_000, reloadTime: 1.8, damage: 35 },
  { id: 'rg_medium', name: 'RG Medium', kind: 'railgun', projectileSpeed: 100, maxRange: 8_000, reloadTime: 1.5, damage: 40 },
  { id: 'rg_heavy', name: 'RG Heavy', kind: 'railgun', projectileSpeed: 100, maxRange: 10_000, reloadTime: 2, damage: 50 },
  { id: 'rg_battleship', name: 'RG Battleship', kind: 'railgun', projectileSpeed: 110, maxRange: 12_000, reloadTime: 2.5, damage: 60 },
];

const sensors: SensorModule[] = [
  { id: 'sensor_light', name: 'Sensor Light', kind: 'sensor', maxRange: 300_000, sensitivity: 3e-12 },
  { id: 'sensor_medium', name: 'Sensor Medium', kind: 'sensor', maxRange: 400_000, sensitivity: 2e-12 },
  { id: 'sensor_heavy', name: 'Sensor Heavy', kind: 'sensor', maxRange: 500_000, sensitivity: 1e-12 },
  { id: 'sensor_carrier', name: 'Sensor Carrier', kind: 'sensor', maxRange: 600_000, sensitivity: 8e-13 },
];

const byId = new Map<string, ModuleTemplate>();

function registerAll(): void {
  for (const m of [...missileLaunchers, ...pdcs, ...railguns, ...sensors]) {
    byId.set(m.id, m);
  }
}
registerAll();

export function getModuleById(id: string): ModuleTemplate | undefined {
  return byId.get(id);
}

export function getAllModules(): ModuleTemplate[] {
  return Array.from(byId.values());
}

export function getModulesByKind(kind: ModuleKind): ModuleTemplate[] {
  return getAllModules().filter((m) => m.kind === kind);
}

export const MODULE_IDS = {
  missileLauncher: missileLaunchers.map((m) => m.id),
  pdc: pdcs.map((m) => m.id),
  railgun: railguns.map((m) => m.id),
  sensor: sensors.map((m) => m.id),
} as const;
