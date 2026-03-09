import { describe, it, expect } from 'vitest';
import { WorldImpl } from '../../src/engine/ecs/World';
import { CommandHandler } from '../../src/game/CommandHandler';
import {
  Position, Velocity, Ship, Thruster, Selectable, NavigationOrder, RotationState,
  COMPONENT,
} from '../../src/engine/components';

function createPlayerShip(world: WorldImpl, opts?: { x?: number; y?: number; vx?: number; vy?: number }) {
  const id = world.createEntity();
  world.addComponent<Position>(id, {
    type: 'Position', x: opts?.x ?? 0, y: opts?.y ?? 0, prevX: 0, prevY: 0,
  });
  world.addComponent<Velocity>(id, {
    type: 'Velocity', vx: opts?.vx ?? 0, vy: opts?.vy ?? 0,
  });
  world.addComponent<Ship>(id, {
    type: 'Ship', name: 'Test', hullClass: 'destroyer', faction: 'player', flagship: false,
  });
  world.addComponent<Thruster>(id, {
    type: 'Thruster', maxThrust: 0.1, thrustAngle: 0, throttle: 0, rotationSpeed: 0.5,
  });
  world.addComponent<Selectable>(id, {
    type: 'Selectable', selected: true,
  });
  world.addComponent<RotationState>(id, {
    type: 'RotationState', currentAngle: 0, targetAngle: 0, rotating: false,
  });
  return id;
}

describe('CommandHandler', () => {
  it('issues NavigationOrder to selected player ships on moveTo', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id = createPlayerShip(world);

    handler.issueMoveTo(10000, 0);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeDefined();
    expect(nav!.targetX).toBe(10000);
    expect(nav!.targetY).toBe(0);
    expect(nav!.phase).toBe('rotating');
    expect(nav!.burnPlan.accelTime).toBeGreaterThan(0);
  });

  it('does not issue orders to unselected ships', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id = createPlayerShip(world);
    const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
    sel.selected = false;

    handler.issueMoveTo(10000, 0);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeUndefined();
  });

  it('does not issue orders to enemy ships', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    const id = createPlayerShip(world);
    const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
    (ship as { faction: string }).faction = 'enemy';

    handler.issueMoveTo(10000, 0);

    const nav = world.getComponent<NavigationOrder>(id, COMPONENT.NavigationOrder);
    expect(nav).toBeUndefined();
  });

  it('replaces existing NavigationOrder', () => {
    const world = new WorldImpl();
    const handler = new CommandHandler(world);
    createPlayerShip(world);

    handler.issueMoveTo(10000, 0);
    handler.issueMoveTo(5000, 5000);

    const entities = world.query(COMPONENT.NavigationOrder);
    expect(entities).toHaveLength(1);
    const nav = world.getComponent<NavigationOrder>(entities[0], COMPONENT.NavigationOrder)!;
    expect(nav.targetX).toBe(5000);
    expect(nav.targetY).toBe(5000);
  });
});
