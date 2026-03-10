import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { loadScenario, parseScenarioJson } from '../../../src/engine/data/ScenarioLoader';
import { COMPONENT } from '../../../src/engine/components';

describe('ScenarioLoader', () => {
  it('loadScenario creates celestials from scenario', () => {
    const world = new WorldImpl();
    loadScenario(world, {
      celestials: [
        { name: 'Terra', mass: 5.972e24, radius: 6371, bodyType: 'planet', x: 0, y: 0 },
      ],
      ships: [],
    });
    const celestials = world.query(COMPONENT.CelestialBody);
    expect(celestials.length).toBe(1);
    const pos = world.getComponent(celestials[0], COMPONENT.Position);
    expect(pos).toBeDefined();
    expect((pos as { x: number; y: number }).x).toBe(0);
  });

  it('loadScenario creates ships from templates with default loadout', () => {
    const world = new WorldImpl();
    loadScenario(world, {
      ships: [
        {
          templateId: 'cruiser',
          name: 'TCS Resolute',
          faction: 'player',
          flagship: true,
          x: 42000,
          y: 0,
        },
      ],
    });
    const ships = world.query(COMPONENT.Ship, COMPONENT.Position);
    expect(ships.length).toBe(1);
    const ship = world.getComponent(ships[0], COMPONENT.Ship);
    expect(ship).toBeDefined();
    expect((ship as { name: string; hullClass: string }).name).toBe('TCS Resolute');
    expect((ship as { hullClass: string }).hullClass).toBe('cruiser');
    expect(world.hasComponent(ships[0], COMPONENT.MissileLauncher)).toBe(true);
    expect(world.hasComponent(ships[0], COMPONENT.PDC)).toBe(true);
    expect(world.hasComponent(ships[0], COMPONENT.Railgun)).toBe(true);
    expect(world.hasComponent(ships[0], COMPONENT.SensorArray)).toBe(true);
  });

  it('loadScenario applies loadout overrides per ship', () => {
    const world = new WorldImpl();
    loadScenario(world, {
      ships: [
        {
          templateId: 'destroyer',
          name: 'TCS Vigilant',
          faction: 'player',
          x: 0,
          y: 0,
          loadout: { missileLauncher: 'ml_light_3', railgun: 'rg_heavy' },
        },
      ],
    });
    const ships = world.query(COMPONENT.Ship, COMPONENT.MissileLauncher);
    expect(ships.length).toBe(1);
    const ml = world.getComponent(ships[0], COMPONENT.MissileLauncher);
    expect((ml as { salvoSize: number }).salvoSize).toBe(3);
    const rg = world.getComponent(ships[0], COMPONENT.Railgun);
    expect((rg as { damage: number }).damage).toBe(50);
  });

  it('loadScenario creates contact trackers for each faction', () => {
    const world = new WorldImpl();
    loadScenario(world, {
      ships: [
        { templateId: 'corvette', name: 'A', faction: 'player', x: 0, y: 0 },
        { templateId: 'frigate', name: 'B', faction: 'enemy', x: 1000, y: 0 },
      ],
    });
    const trackers = world.query(COMPONENT.ContactTracker);
    expect(trackers.length).toBe(2);
  });

  it('loadScenario clears world before loading', () => {
    const world = new WorldImpl();
    world.createEntity();
    loadScenario(world, { ships: [] });
    expect(world.getAllEntities().length).toBe(0);
  });

  it('parseScenarioJson parses valid JSON', () => {
    const json = JSON.stringify({
      ships: [{ templateId: 'cruiser', name: 'X', faction: 'player', x: 0, y: 0 }],
    });
    const scenario = parseScenarioJson(json);
    expect(scenario.ships.length).toBe(1);
    expect(scenario.ships[0].name).toBe('X');
  });

  it('parseScenarioJson throws on missing ships', () => {
    expect(() => parseScenarioJson('{}')).toThrow('Invalid scenario');
    expect(() => parseScenarioJson('{"ships": null}')).toThrow('Invalid scenario');
  });
});
