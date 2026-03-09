export type EntityId = string;

export interface Component {
  readonly type: string;
}

export interface World {
  createEntity(): EntityId;
  removeEntity(entityId: EntityId): void;
  addComponent<T extends Component>(entityId: EntityId, component: T): void;
  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined;
  hasComponent(entityId: EntityId, type: string): boolean;
  removeComponent(entityId: EntityId, type: string): void;
  query(...componentTypes: string[]): EntityId[];
  getAllEntities(): EntityId[];
  clear(): void;
  getEntityComponents(entityId: EntityId): Record<string, Component>;
}

export type GameEventType =
  | 'SimulationTick'
  | 'ShipCreated'
  | 'ShipDestroyed'
  | 'ThrustStarted'
  | 'ThrustStopped'
  | 'MissileLaunched'
  | 'MissileIntercepted'
  | 'MissileImpact'
  | 'RailgunFired'
  | 'RailgunHit'
  | 'PDCFiring'
  | 'ShipDetected'
  | 'ShipLostContact'
  | 'SystemDamaged'
  | 'ShipDisabled'
  | 'OrderIssued'
  | 'ContactUpdated'
  | 'GamePaused'
  | 'GameResumed'
  | 'SpeedChanged'
  | 'VictoryAchieved'
  | 'DefeatSuffered';

export interface GameEvent {
  type: GameEventType;
  time: number;
  entityId?: EntityId;
  targetId?: EntityId;
  data: Record<string, unknown>;
}
