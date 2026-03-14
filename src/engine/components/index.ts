import { Component, EntityId } from '../types';

export type { SensorArray, DetectedContact, ContactTracker } from './sensor-components';
export type { MissileLauncher, Missile, GuidanceMode, PDC, Railgun, Projectile } from './weapon-components';
export type { ShipSystems, SubsystemHealth } from './damage-components';
export { createShipSystems } from './damage-components';

// --- Core spatial components ---

export interface Position extends Component {
  type: 'Position';
  x: number; // km
  y: number; // km
  // Previous tick position for render interpolation
  prevX: number;
  prevY: number;
}

export interface Velocity extends Component {
  type: 'Velocity';
  vx: number; // km/s
  vy: number; // km/s
}

export interface Facing extends Component {
  type: 'Facing';
  angle: number; // radians, 0 = right, PI/2 = up
}

// --- Ship components ---

export type Faction = 'player' | 'enemy' | 'neutral';

export interface Ship extends Component {
  type: 'Ship';
  name: string;
  hullClass: string;
  faction: Faction;
  flagship: boolean;
}

export interface Thruster extends Component {
  type: 'Thruster';
  maxThrust: number; // km/s² acceleration
  /** Current thrust direction in radians (where engine points) */
  thrustAngle: number;
  /** Current thrust level 0-1 */
  throttle: number;
  /** Rotation speed in radians/sec */
  rotationSpeed: number;
}

export interface Hull extends Component {
  type: 'Hull';
  current: number;
  max: number;
  armor: number;
}

// --- Celestial body ---

export interface CelestialBody extends Component {
  type: 'CelestialBody';
  name: string;
  mass: number; // kg (for gravity calculation)
  radius: number; // km (for rendering and collision)
  bodyType: 'star' | 'planet' | 'moon' | 'station' | 'asteroid';
}

/** Moon/orbiting body only: entity id of the primary (planet/star) to orbit. */
export interface OrbitalPrimary extends Component {
  type: 'OrbitalPrimary';
  primaryId: EntityId;
}

// --- Selection / UI state ---

export interface Selectable extends Component {
  type: 'Selectable';
  selected: boolean;
}

// --- Sensor signature ---

export interface ThermalSignature extends Component {
  type: 'ThermalSignature';
  baseSignature: number; // Base thermal output
  thrustMultiplier: number; // How much thrust increases signature
}

// --- Orders ---

export type OrderType = 'moveTo' | 'intercept' | 'orbit' | 'holdPosition' | 'goDark';

export interface Orders extends Component {
  type: 'Orders';
  current: Order | null;
  queue: Order[];
}

export interface Order {
  orderType: OrderType;
  targetPosition?: { x: number; y: number };
  targetEntity?: EntityId;
  orbitRadius?: number;
}

// --- Navigation ---

export type NavPhase = 'rotating' | 'accelerating' | 'flipping' | 'decelerating' | 'arrived' | 'orbiting';

export interface BurnPlan {
  accelTime: number;    // seconds of acceleration burn
  coastTime: number;    // seconds of coasting (zero for brachistochrone)
  decelTime: number;    // seconds of deceleration burn
  totalTime: number;    // total transit time
  flipAngle: number;    // angle to rotate to for decel (usually accelAngle + PI)
  burnDirection: number; // angle in radians for acceleration thrust
}

export interface NavigationOrder extends Component {
  type: 'NavigationOrder';
  /** Final goal (km); never changed by avoidance. */
  destinationX: number;
  destinationY: number;
  targetX: number;
  targetY: number;
  waypoints: { x: number; y: number }[];
  phase: NavPhase;
  burnPlan: BurnPlan;
  phaseStartTime: number; // game time when current phase started
  arrivalThreshold: number; // km — close enough to consider arrived
  /** Entity ID of celestial body to orbit (sustained circular orbit on arrival). */
  orbitTargetId?: EntityId;
  /** Desired orbit radius in km (distance from body center). */
  orbitRadius?: number;
}

export interface RotationState extends Component {
  type: 'RotationState';
  currentAngle: number;  // current facing in radians
  targetAngle: number;   // desired facing in radians
  rotating: boolean;
}

// --- AI (enemy fleet) ---

export type AIObjective = 'engage' | 'disengage' | 'hold';

export interface AIStrategicIntent extends Component {
  type: 'AIStrategicIntent';
  objective: AIObjective;
  /** Primary target for weapons (detected enemy). */
  targetId?: EntityId;
  /** Where to maneuver (e.g. toward target or retreat vector). */
  moveToX?: number;
  moveToY?: number;
  /** Game time when strategic layer should re-evaluate. */
  nextStrategicUpdate: number;
}

// --- Component type constants for queries ---

export const COMPONENT = {
  Position: 'Position',
  Velocity: 'Velocity',
  Facing: 'Facing',
  Ship: 'Ship',
  Thruster: 'Thruster',
  Hull: 'Hull',
  CelestialBody: 'CelestialBody',
  OrbitalPrimary: 'OrbitalPrimary',
  Selectable: 'Selectable',
  ThermalSignature: 'ThermalSignature',
  Orders: 'Orders',
  NavigationOrder: 'NavigationOrder',
  RotationState: 'RotationState',
  SensorArray: 'SensorArray',
  ContactTracker: 'ContactTracker',
  MissileLauncher: 'MissileLauncher',
  Missile: 'Missile',
  PDC: 'PDC',
  Railgun: 'Railgun',
  Projectile: 'Projectile',
  ShipSystems: 'ShipSystems',
  AIStrategicIntent: 'AIStrategicIntent',
} as const;
