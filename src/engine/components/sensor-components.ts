import { Component, EntityId } from '../types';
import { Faction } from './index';

export interface SensorArray extends Component {
  type: 'SensorArray';
  maxRange: number;       // km — beyond this, never detect
  sensitivity: number;    // detection threshold (lower = more sensitive)
}

export interface DetectedContact {
  entityId: EntityId;
  lastKnownX: number;     // km — light-delayed position
  lastKnownY: number;     // km
  lastKnownVx: number;    // km/s — velocity at detection time
  lastKnownVy: number;    // km/s
  detectionTime: number;  // game time when data was captured at source
  receivedTime: number;   // game time when data arrived (after light delay)
  signalStrength: number; // detection strength for rendering confidence
  lost: boolean;          // true when contact dropped off sensors
  lostTime: number;       // game time when contact was lost
}

export interface ContactTracker extends Component {
  type: 'ContactTracker';
  faction: Faction;
  contacts: Map<EntityId, DetectedContact>;
}
