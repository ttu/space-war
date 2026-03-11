/**
 * Loads a JSON scenario into the ECS world. Creates celestials, ships (from ShipTemplates + ModuleTemplates),
 * and contact trackers. Ships can override loadout per ship.
 */

import { World } from '../types';
import { getShipTemplate, resolveLoadout, type HullClassId, type ShipLoadout } from './ShipTemplates';
import {
  type MissileLauncherModule,
  type PDCModule,
  type RailgunModule,
  type SensorModule,
} from './ModuleTemplates';
import {
  Position,
  Velocity,
  Ship,
  Thruster,
  Hull,
  createShipSystems,
  CelestialBody,
  Selectable,
  RotationState,
  ThermalSignature,
  SensorArray,
  ContactTracker,
  MissileLauncher,
  PDC,
  Railgun,
  AIStrategicIntent,
  type Faction,
} from '../components';

export interface ScenarioCelestial {
  name: string;
  mass: number;
  radius: number;
  bodyType: 'planet' | 'moon' | 'station' | 'asteroid';
  x: number;
  y: number;
}

export interface ScenarioShip {
  templateId: HullClassId;
  name: string;
  faction: Faction;
  flagship?: boolean;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  loadout?: ShipLoadout;
}

export interface Scenario {
  celestials?: ScenarioCelestial[];
  ships: ScenarioShip[];
}

function isFaction(s: string): s is Faction {
  return s === 'player' || s === 'enemy' || s === 'neutral';
}

export function loadScenario(world: World, scenario: Scenario): void {
  world.clear();

  const celestials = scenario.celestials ?? [];
  for (const c of celestials) {
    const id = world.createEntity();
    world.addComponent(id, {
      type: 'Position',
      x: c.x,
      y: c.y,
      prevX: c.x,
      prevY: c.y,
    } as Position);
    world.addComponent(id, {
      type: 'CelestialBody',
      name: c.name,
      mass: c.mass,
      radius: c.radius,
      bodyType: c.bodyType,
    } as CelestialBody);
  }

  const factionsSeen = new Set<Faction>();
  for (const s of scenario.ships) {
    if (!isFaction(s.faction)) continue;
    factionsSeen.add(s.faction);

    const template = getShipTemplate(s.templateId);
    if (!template) continue;

    const resolved = resolveLoadout(template, s.loadout);
    const id = world.createEntity();

    world.addComponent(id, {
      type: 'Position',
      x: s.x,
      y: s.y,
      prevX: s.x,
      prevY: s.y,
    } as Position);
    world.addComponent(id, {
      type: 'Velocity',
      vx: s.vx ?? 0,
      vy: s.vy ?? 0,
    } as Velocity);
    world.addComponent(id, {
      type: 'Ship',
      name: s.name,
      hullClass: template.id,
      faction: s.faction,
      flagship: s.flagship ?? false,
    } as Ship);
    world.addComponent(id, {
      type: 'Hull',
      current: template.hullMax,
      max: template.hullMax,
      armor: template.hullArmor,
    } as Hull);
    world.addComponent(id, createShipSystems(template.reactorMax, template.enginesMax, template.sensorsMax));
    world.addComponent(id, {
      type: 'Thruster',
      maxThrust: template.maxThrust,
      thrustAngle: 0,
      throttle: 0,
      rotationSpeed: template.rotationSpeed,
    } as Thruster);
    world.addComponent(id, {
      type: 'Selectable',
      selected: false,
    } as Selectable);
    world.addComponent(id, {
      type: 'RotationState',
      currentAngle: 0,
      targetAngle: 0,
      rotating: false,
    } as RotationState);
    world.addComponent(id, {
      type: 'ThermalSignature',
      baseSignature: template.baseSignature,
      thrustMultiplier: template.thrustMultiplier,
    } as ThermalSignature);

    if (resolved.sensor) {
      const mod = resolved.sensor as SensorModule;
      world.addComponent(id, {
        type: 'SensorArray',
        maxRange: mod.maxRange,
        sensitivity: mod.sensitivity,
      } as SensorArray);
    }

    if (resolved.missileLauncher) {
      const mod = resolved.missileLauncher as MissileLauncherModule;
      world.addComponent(id, {
        type: 'MissileLauncher',
        salvoSize: mod.salvoSize,
        reloadTime: mod.reloadTime,
        lastFiredTime: 0,
        maxRange: mod.maxRange,
        missileAccel: mod.missileAccel,
        ammo: mod.ammo,
        seekerRange: mod.seekerRange,
        seekerSensitivity: mod.seekerSensitivity,
      } as MissileLauncher);
    }
    if (resolved.pdc) {
      const mod = resolved.pdc as PDCModule;
      world.addComponent(id, {
        type: 'PDC',
        range: mod.range,
        fireRate: mod.fireRate,
        lastFiredTime: 0,
        damagePerHit: mod.damagePerHit,
      } as PDC);
    }
    if (resolved.railgun) {
      const mod = resolved.railgun as RailgunModule;
      world.addComponent(id, {
        type: 'Railgun',
        projectileSpeed: mod.projectileSpeed,
        maxRange: mod.maxRange,
        reloadTime: mod.reloadTime,
        lastFiredTime: 0,
        damage: mod.damage,
      } as Railgun);
    }

    if (s.faction === 'enemy') {
      world.addComponent(id, {
        type: 'AIStrategicIntent',
        objective: 'hold',
        nextStrategicUpdate: 0,
      } as AIStrategicIntent);
    }
  }

  for (const faction of factionsSeen) {
    const trackerId = world.createEntity();
    world.addComponent(trackerId, {
      type: 'ContactTracker',
      faction,
      contacts: new Map(),
    } as ContactTracker);
  }
}

/** Parse JSON string to Scenario. Throws on invalid JSON. */
export function parseScenarioJson(json: string): Scenario {
  const data = JSON.parse(json) as unknown;
  if (typeof data !== 'object' || data === null || !('ships' in data) || !Array.isArray((data as Scenario).ships)) {
    throw new Error('Invalid scenario: missing or invalid "ships" array');
  }
  return data as Scenario;
}

/**
 * Fetch a scenario by name from /scenarios/{name}.json.
 * Use for loading tutorial, patrol, fleet-action, ambush from public/scenarios/.
 */
export async function fetchScenario(name: string): Promise<Scenario> {
  const res = await fetch(`/scenarios/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load scenario: ${res.status} ${res.statusText}`);
  const json = await res.text();
  return parseScenarioJson(json);
}
