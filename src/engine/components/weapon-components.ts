import { Component, EntityId } from '../types';
import { Faction } from './index';

export interface MissileLauncher extends Component {
  type: 'MissileLauncher';
  salvoSize: number;      // missiles per salvo
  reloadTime: number;     // seconds between salvos
  lastFiredTime: number;  // game time of last launch
  maxRange: number;       // km — fuel-limited max distance
  missileAccel: number;   // km/s² — missile thrust
  ammo: number;           // total missiles remaining
  seekerRange: number;    // km — onboard seeker detection range
  seekerSensitivity: number; // onboard seeker threshold
}

export type GuidanceMode = 'sensor' | 'seeker' | 'ballistic';

export interface Missile extends Component {
  type: 'Missile';
  targetId: EntityId;           // intended target entity
  launcherFaction: Faction;     // faction that launched this salvo
  count: number;                // missiles in salvo (decremented by PDC)
  fuel: number;                 // seconds of burn remaining
  accel: number;                // km/s² thrust
  seekerRange: number;          // km — onboard seeker detection range
  seekerSensitivity: number;    // onboard seeker threshold
  guidanceMode: GuidanceMode;   // current guidance state
  armed: boolean;               // safe until min distance from launcher
  armingDistance: number;        // km — distance from launch point before arming
}
