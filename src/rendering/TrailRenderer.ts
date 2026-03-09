import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Velocity, Ship, Thruster, NavigationOrder,
  COMPONENT,
} from '../engine/components';

interface TrailPoint {
  x: number;
  y: number;
}

/** Stores trail position history per entity. Separated for testability. */
export class TrailStore {
  private trails: Map<EntityId, TrailPoint[]> = new Map();

  constructor(private maxLength: number) {}

  record(entityId: EntityId, x: number, y: number): void {
    let trail = this.trails.get(entityId);
    if (!trail) {
      trail = [];
      this.trails.set(entityId, trail);
    }
    trail.push({ x, y });
    if (trail.length > this.maxLength) {
      trail.shift();
    }
  }

  getTrail(entityId: EntityId): TrailPoint[] {
    return this.trails.get(entityId) ?? [];
  }

  remove(entityId: EntityId): void {
    this.trails.delete(entityId);
  }

  entities(): EntityId[] {
    return Array.from(this.trails.keys());
  }
}

const TRAIL_COLOR_PLAYER = 0x4488cc;
const TRAIL_COLOR_ENEMY = 0xcc4444;
const PROJECTION_COLOR = 0xffcc44;
const TRAIL_OPACITY = 0.3;
const PROJECTION_OPACITY = 0.4;
const MAX_TRAIL_POINTS = 200;
const PROJECTION_STEPS = 60;
const PROJECTION_DT = 2; // seconds per step

export class TrailRenderer {
  private group = new THREE.Group();
  private trailStore = new TrailStore(MAX_TRAIL_POINTS);
  private trailLines: Map<EntityId, THREE.Line> = new Map();
  private projectionLines: Map<EntityId, THREE.Line> = new Map();
  private tickCounter = 0;
  private recordInterval = 5; // Record every N ticks

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  /** Called each simulation tick to record ship positions. */
  recordPositions(world: World): void {
    this.tickCounter++;
    if (this.tickCounter % this.recordInterval !== 0) return;

    const ships = world.query(COMPONENT.Position, COMPONENT.Ship);
    for (const id of ships) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      this.trailStore.record(id, pos.x, pos.y);
    }
  }

  /** Called each render frame to update trail and projection visuals. */
  update(world: World, zoom: number): void {
    const ships = world.query(COMPONENT.Position, COMPONENT.Ship);
    const activeIds = new Set(ships);

    // Clean up dead entities
    for (const [id, line] of this.trailLines) {
      if (!activeIds.has(id)) {
        this.group.remove(line);
        this.trailLines.delete(id);
        this.trailStore.remove(id);
      }
    }
    for (const [id, line] of this.projectionLines) {
      if (!activeIds.has(id)) {
        this.group.remove(line);
        this.projectionLines.delete(id);
      }
    }

    for (const entityId of ships) {
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship)!;
      this.updateTrailLine(entityId, ship.faction === 'player' ? TRAIL_COLOR_PLAYER : TRAIL_COLOR_ENEMY);
      this.updateProjectionLine(world, entityId, zoom);
    }
  }

  private updateTrailLine(entityId: EntityId, color: number): void {
    const trail = this.trailStore.getTrail(entityId);
    if (trail.length < 2) return;

    let line = this.trailLines.get(entityId);
    if (!line) {
      // Pre-allocate buffer for max trail length
      const positions = new Float32Array(MAX_TRAIL_POINTS * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: TRAIL_OPACITY,
      });
      line = new THREE.Line(geo, mat);
      this.trailLines.set(entityId, line);
      this.group.add(line);
    }

    const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < trail.length; i++) {
      posAttr.setXYZ(i, trail[i].x, trail[i].y, 0.5);
    }
    posAttr.needsUpdate = true;
    line.geometry.setDrawRange(0, trail.length);
  }

  private updateProjectionLine(world: World, entityId: EntityId, _zoom: number): void {
    const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
    const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity);
    const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster);
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder);

    // Only show projection for ships with velocity or active navigation
    if (!vel) return;
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
    if (speed < 0.01 && !nav) {
      // Remove projection line if it exists
      const existing = this.projectionLines.get(entityId);
      if (existing) {
        existing.visible = false;
      }
      return;
    }

    let line = this.projectionLines.get(entityId);
    if (!line) {
      // Pre-allocate buffer for max projection steps + 1 (start point)
      const positions = new Float32Array((PROJECTION_STEPS + 1) * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineDashedMaterial({
        color: PROJECTION_COLOR,
        transparent: true,
        opacity: PROJECTION_OPACITY,
        dashSize: 500,
        gapSize: 300,
      });
      line = new THREE.Line(geo, mat);
      this.projectionLines.set(entityId, line);
      this.group.add(line);
    }

    line.visible = true;

    const points = this.projectPath(pos, vel, thruster, nav);
    const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < points.length; i++) {
      posAttr.setXYZ(i, points[i].x, points[i].y, 0.3);
    }
    posAttr.needsUpdate = true;
    line.geometry.setDrawRange(0, points.length);
    line.computeLineDistances();
  }

  private projectPath(
    pos: Position, vel: Velocity,
    thruster: Thruster | undefined,
    nav: NavigationOrder | undefined,
  ): TrailPoint[] {
    const points: TrailPoint[] = [{ x: pos.x, y: pos.y }];
    let px = pos.x, py = pos.y;
    let vx = vel.vx, vy = vel.vy;

    // If navigating with a burn plan, simulate the full trajectory
    if (nav && thruster && nav.phase !== 'arrived') {
      const a = thruster.maxThrust;
      const plan = nav.burnPlan;
      // Remaining time in current phase (approximate)
      let phase: string = nav.phase;
      let remaining = this.estimatePhaseRemaining(nav, thruster);

      for (let i = 0; i < PROJECTION_STEPS; i++) {
        // Apply thrust based on current phase
        if (phase === 'accelerating') {
          vx += Math.cos(plan.burnDirection) * a * PROJECTION_DT;
          vy += Math.sin(plan.burnDirection) * a * PROJECTION_DT;
          remaining -= PROJECTION_DT;
          if (remaining <= 0) { phase = 'flipping'; remaining = 0; }
        } else if (phase === 'flipping') {
          // No thrust during flip — skip to decel
          phase = 'decelerating';
          remaining = plan.decelTime;
        } else if (phase === 'decelerating') {
          vx += Math.cos(plan.flipAngle) * a * PROJECTION_DT;
          vy += Math.sin(plan.flipAngle) * a * PROJECTION_DT;
          remaining -= PROJECTION_DT;
          if (remaining <= 0) { phase = 'arrived'; }
        } else if (phase === 'rotating') {
          // No thrust during rotation — skip to accel
          phase = 'accelerating';
          remaining = plan.accelTime;
        }
        // 'arrived' — no thrust, just drift

        px += vx * PROJECTION_DT;
        py += vy * PROJECTION_DT;
        points.push({ x: px, y: py });

        const dx = nav.targetX - px;
        const dy = nav.targetY - py;
        if (Math.sqrt(dx * dx + dy * dy) < nav.arrivalThreshold) break;
      }
    } else {
      // No navigation — simple velocity extrapolation
      for (let i = 0; i < PROJECTION_STEPS; i++) {
        if (thruster && thruster.throttle > 0) {
          const accel = thruster.maxThrust * thruster.throttle;
          vx += Math.cos(thruster.thrustAngle) * accel * PROJECTION_DT;
          vy += Math.sin(thruster.thrustAngle) * accel * PROJECTION_DT;
        }
        px += vx * PROJECTION_DT;
        py += vy * PROJECTION_DT;
        points.push({ x: px, y: py });
      }
    }

    return points;
  }

  /** Estimate remaining time in current nav phase (approximate — no gameTime access). */
  private estimatePhaseRemaining(nav: NavigationOrder, _thruster: Thruster): number {
    switch (nav.phase) {
      case 'rotating': return 0;
      case 'accelerating': return nav.burnPlan.accelTime;
      case 'flipping': return 0;
      case 'decelerating': return nav.burnPlan.decelTime;
      default: return 0;
    }
  }

  dispose(): void {
    for (const [, line] of this.trailLines) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    for (const [, line] of this.projectionLines) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    this.trailLines.clear();
    this.projectionLines.clear();
    this.scene.remove(this.group);
  }
}
