import { Component } from '../types';

/** Health for a single subsystem (0 = destroyed, max = full). */
export interface SubsystemHealth {
  current: number;
  max: number;
}

/**
 * Location-based ship systems. Damaged engines reduce thrust,
 * damaged sensors reduce detection, reactor can affect power-dependent systems.
 */
export interface ShipSystems extends Component {
  type: 'ShipSystems';
  reactor: SubsystemHealth;
  engines: SubsystemHealth;
  sensors: SubsystemHealth;
}

export function createShipSystems(
  reactorMax: number,
  enginesMax: number,
  sensorsMax: number,
): ShipSystems {
  return {
    type: 'ShipSystems',
    reactor: { current: reactorMax, max: reactorMax },
    engines: { current: enginesMax, max: enginesMax },
    sensors: { current: sensorsMax, max: sensorsMax },
  };
}
