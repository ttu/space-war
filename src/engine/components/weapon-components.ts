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
  /** 0 = destroyed (weapon cannot fire). Omit or 100 = full. */
  integrity?: number;
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

export interface PDC extends Component {
  type: 'PDC';
  range: number;              // km — engagement range (anti-missile and close ship)
  fireRate: number;            // rounds per second (e.g. 100)
  lastFiredTime: number;       // game time of last burst
  damagePerHit: number;       // damage to ship hull per hit (close-range)
  /** 0 = destroyed (weapon cannot fire). Omit or 100 = full. */
  integrity?: number;
}

export interface Railgun extends Component {
  type: 'Railgun';
  projectileSpeed: number;    // km/s
  maxRange: number;           // km
  reloadTime: number;         // seconds between bursts
  lastFiredTime: number;      // game time of last shot/burst start
  damage: number;             // hull damage on hit
  /** Current rounds remaining. Cannot fire when 0. */
  ammo: number;
  /** Max rounds (from module template). */
  maxAmmo: number;
  /** 0 = destroyed (weapon cannot fire). Omit or 100 = full. */
  integrity?: number;
}

export interface Projectile extends Component {
  type: 'Projectile';
  shooterId: EntityId;
  targetId: EntityId;
  faction: Faction;
  damage: number;
  hitRadius: number;           // km — proximity for hit
}
