/**
 * Ship hull classes (Corvette → Carrier) with base stats and default loadouts.
 * Loadout references module IDs from ModuleTemplates.
 */

import { getModuleById } from './ModuleTemplates';
import type { ModuleTemplate } from './ModuleTemplates';

export type HullClassId =
  | 'corvette'
  | 'frigate'
  | 'destroyer'
  | 'cruiser'
  | 'battleship'
  | 'carrier';

/** Default loadout: module IDs per slot. Omitted slot = no module (e.g. carrier may skip railgun). */
export interface ShipLoadout {
  missileLauncher?: string;
  pdc?: string;
  railgun?: string;
  sensor?: string;
}

export interface ShipTemplate {
  id: HullClassId;
  name: string;
  hullMax: number;
  hullArmor: number;
  reactorMax: number;
  enginesMax: number;
  sensorsMax: number;
  maxThrust: number;
  rotationSpeed: number;
  baseSignature: number;
  thrustMultiplier: number;
  defaultLoadout: ShipLoadout;
}

const templates: ShipTemplate[] = [
  {
    id: 'corvette',
    name: 'Corvette',
    hullMax: 40,
    hullArmor: 2,
    reactorMax: 40,
    enginesMax: 40,
    sensorsMax: 40,
    maxThrust: 0.2,
    rotationSpeed: 1.0,
    baseSignature: 25,
    thrustMultiplier: 120,
    defaultLoadout: {
      missileLauncher: 'ml_light_3',
      pdc: 'pdc_light',
      railgun: 'rg_light',
      sensor: 'sensor_light',
    },
  },
  {
    id: 'frigate',
    name: 'Frigate',
    hullMax: 60,
    hullArmor: 3,
    reactorMax: 60,
    enginesMax: 60,
    sensorsMax: 60,
    maxThrust: 0.18,
    rotationSpeed: 0.9,
    baseSignature: 30,
    thrustMultiplier: 150,
    defaultLoadout: {
      missileLauncher: 'ml_light_3',
      pdc: 'pdc_light',
      railgun: 'rg_light',
      sensor: 'sensor_light',
    },
  },
  {
    id: 'destroyer',
    name: 'Destroyer',
    hullMax: 80,
    hullArmor: 4,
    reactorMax: 80,
    enginesMax: 80,
    sensorsMax: 80,
    maxThrust: 0.15,
    rotationSpeed: 0.8,
    baseSignature: 40,
    thrustMultiplier: 180,
    defaultLoadout: {
      missileLauncher: 'ml_medium_4',
      pdc: 'pdc_standard',
      railgun: 'rg_medium',
      sensor: 'sensor_medium',
    },
  },
  {
    id: 'cruiser',
    name: 'Cruiser',
    hullMax: 100,
    hullArmor: 5,
    reactorMax: 100,
    enginesMax: 100,
    sensorsMax: 100,
    maxThrust: 0.1,
    rotationSpeed: 0.5,
    baseSignature: 50,
    thrustMultiplier: 200,
    defaultLoadout: {
      missileLauncher: 'ml_heavy_6',
      pdc: 'pdc_heavy',
      railgun: 'rg_heavy',
      sensor: 'sensor_heavy',
    },
  },
  {
    id: 'battleship',
    name: 'Battleship',
    hullMax: 150,
    hullArmor: 8,
    reactorMax: 150,
    enginesMax: 150,
    sensorsMax: 150,
    maxThrust: 0.06,
    rotationSpeed: 0.35,
    baseSignature: 70,
    thrustMultiplier: 250,
    defaultLoadout: {
      missileLauncher: 'ml_battleship_8',
      pdc: 'pdc_battleship',
      railgun: 'rg_battleship',
      sensor: 'sensor_heavy',
    },
  },
  {
    id: 'carrier',
    name: 'Carrier',
    hullMax: 120,
    hullArmor: 6,
    reactorMax: 120,
    enginesMax: 120,
    sensorsMax: 120,
    maxThrust: 0.08,
    rotationSpeed: 0.4,
    baseSignature: 80,
    thrustMultiplier: 220,
    defaultLoadout: {
      missileLauncher: 'ml_heavy_6',
      pdc: 'pdc_heavy',
      railgun: 'rg_medium',
      sensor: 'sensor_carrier',
    },
  },
];

const byId = new Map<HullClassId, ShipTemplate>();
for (const t of templates) {
  byId.set(t.id, t);
}

export function getShipTemplate(id: HullClassId): ShipTemplate | undefined {
  return byId.get(id);
}

export function getAllShipTemplates(): ShipTemplate[] {
  return [...templates];
}

export function getHullClassIds(): HullClassId[] {
  return templates.map((t) => t.id);
}

/**
 * Resolve loadout to module templates. Overrides are merged with template default
 * (override wins for provided keys). Returns undefined for a slot if no module ID in merged loadout.
 */
export function resolveLoadout(
  template: ShipTemplate,
  overrides?: ShipLoadout | null,
): {
  missileLauncher: ModuleTemplate | undefined;
  pdc: ModuleTemplate | undefined;
  railgun: ModuleTemplate | undefined;
  sensor: ModuleTemplate | undefined;
} {
  const loadout: ShipLoadout = overrides
    ? { ...template.defaultLoadout, ...overrides }
    : template.defaultLoadout;
  return {
    missileLauncher: loadout.missileLauncher
      ? (getModuleById(loadout.missileLauncher) as ModuleTemplate | undefined)
      : undefined,
    pdc: loadout.pdc ? (getModuleById(loadout.pdc) as ModuleTemplate | undefined) : undefined,
    railgun: loadout.railgun
      ? (getModuleById(loadout.railgun) as ModuleTemplate | undefined)
      : undefined,
    sensor: loadout.sensor
      ? (getModuleById(loadout.sensor) as ModuleTemplate | undefined)
      : undefined,
  };
}
