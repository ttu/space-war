import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import {
  ShipSystems, createShipSystems, COMPONENT,
} from '../../../src/engine/components';

describe('Damage Components', () => {
  it('adds ShipSystems to an entity', () => {
    const world = new WorldImpl();
    const id = world.createEntity();
    const systems = createShipSystems(100, 100, 100);
    world.addComponent(id, systems);

    const retrieved = world.getComponent<ShipSystems>(id, COMPONENT.ShipSystems);
    expect(retrieved).toBeDefined();
    expect(retrieved!.reactor.current).toBe(100);
    expect(retrieved!.reactor.max).toBe(100);
    expect(retrieved!.engines.current).toBe(100);
    expect(retrieved!.sensors.current).toBe(100);
  });

  it('createShipSystems initializes all subsystems at max', () => {
    const sys = createShipSystems(80, 60, 50);
    expect(sys.reactor).toEqual({ current: 80, max: 80 });
    expect(sys.engines).toEqual({ current: 60, max: 60 });
    expect(sys.sensors).toEqual({ current: 50, max: 50 });
  });
});
