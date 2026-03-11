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
const PROJECTION_COLOR_DRIFT = 0xffcc44;
const PROJECTION_COLOR_NAV = 0x44ddff;
const DESTINATION_COLOR = 0x44ddff;
const TRAIL_OPACITY = 0.3;
const PROJECTION_OPACITY_DRIFT = 0.3;
const PROJECTION_OPACITY_NAV = 0.7;
const DESTINATION_OPACITY = 0.8;
const MAX_TRAIL_POINTS = 200;
const PROJECTION_STEPS = 60;
const PROJECTION_DT = 2; // seconds per step
const DESTINATION_MARKER_SIZE = 0.008; // relative to zoom
const MAX_NAV_PROJECTION_STEPS = 2000; // cap for navigating ships

export class TrailRenderer {
  private group = new THREE.Group();
  private trailStore = new TrailStore(MAX_TRAIL_POINTS);
  private trailLines: Map<EntityId, THREE.Line> = new Map();
  private projectionLines: Map<EntityId, THREE.Line> = new Map();
  private destinationMarkers: Map<EntityId, THREE.Group> = new Map();
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
    for (const [id, marker] of this.destinationMarkers) {
      if (!activeIds.has(id)) {
        this.group.remove(marker);
        this.destinationMarkers.delete(id);
      }
    }

    for (const entityId of ships) {
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship)!;
      this.updateTrailLine(entityId, ship.faction === 'player' ? TRAIL_COLOR_PLAYER : TRAIL_COLOR_ENEMY);
      this.updateProjectionLine(world, entityId, zoom);
      this.updateDestinationMarker(world, entityId, zoom);
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

    const hasNav = nav && nav.phase !== 'arrived';

    // Only show projection for ships with velocity or active navigation
    if (!vel) return;
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
    if (speed < 0.01 && !hasNav) {
      const existing = this.projectionLines.get(entityId);
      if (existing) {
        existing.visible = false;
      }
      return;
    }

    const color = hasNav ? PROJECTION_COLOR_NAV : PROJECTION_COLOR_DRIFT;
    const opacity = hasNav ? PROJECTION_OPACITY_NAV : PROJECTION_OPACITY_DRIFT;

    const points = this.projectPath(pos, vel, thruster, nav);
    const maxPoints = points.length;

    let line = this.projectionLines.get(entityId);
    // Reallocate buffer if it's too small for the current trajectory
    if (line) {
      const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr.count < maxPoints) {
        this.group.remove(line);
        line.geometry.dispose();
        this.projectionLines.delete(entityId);
        line = undefined;
      }
    }

    if (!line) {
      const bufferSize = Math.max(PROJECTION_STEPS + 1, maxPoints);
      const positions = new Float32Array(bufferSize * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity,
        dashSize: 500,
        gapSize: 300,
      });
      line = new THREE.Line(geo, mat);
      this.projectionLines.set(entityId, line);
      this.group.add(line);
    }

    // Update color and opacity based on navigation state
    const mat = line.material as THREE.LineDashedMaterial;
    mat.color.setHex(color);
    mat.opacity = opacity;

    line.visible = true;

    const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < points.length; i++) {
      posAttr.setXYZ(i, points[i].x, points[i].y, 0.3);
    }
    posAttr.needsUpdate = true;
    line.geometry.setDrawRange(0, points.length);
    line.computeLineDistances();
  }

  private updateDestinationMarker(world: World, entityId: EntityId, zoom: number): void {
    const nav = world.getComponent<NavigationOrder>(entityId, COMPONENT.NavigationOrder);
    const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship);

    // Only show for player ships with active navigation
    if (!nav || nav.phase === 'arrived' || !ship || ship.faction !== 'player') {
      const existing = this.destinationMarkers.get(entityId);
      if (existing) existing.visible = false;
      return;
    }

    let marker = this.destinationMarkers.get(entityId);
    if (!marker) {
      marker = this.createDestinationMarker();
      this.destinationMarkers.set(entityId, marker);
      this.group.add(marker);
    }

    marker.visible = true;
    marker.position.set(nav.destinationX, nav.destinationY, 0.4);

    // Scale marker with zoom so it stays visible
    const s = zoom * DESTINATION_MARKER_SIZE;
    marker.scale.set(s, s, 1);
  }

  private createDestinationMarker(): THREE.Group {
    const group = new THREE.Group();

    // Crosshair: 4 lines forming a +
    const armLength = 1;
    const gapRadius = 0.3;
    const arms = [
      [0, gapRadius, 0, armLength],    // up
      [0, -gapRadius, 0, -armLength],  // down
      [gapRadius, 0, armLength, 0],    // right
      [-gapRadius, 0, -armLength, 0],  // left
    ];
    for (const [x1, y1, x2, y2] of arms) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([x1, y1, 0, x2, y2, 0], 3));
      const mat = new THREE.LineBasicMaterial({
        color: DESTINATION_COLOR,
        transparent: true,
        opacity: DESTINATION_OPACITY,
      });
      group.add(new THREE.Line(geo, mat));
    }

    // Diamond outline around the crosshair
    const d = 0.5;
    const diamondGeo = new THREE.BufferGeometry();
    diamondGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, d, 0,  d, 0, 0,  0, -d, 0,  -d, 0, 0,
    ], 3));
    const diamondMat = new THREE.LineBasicMaterial({
      color: DESTINATION_COLOR,
      transparent: true,
      opacity: DESTINATION_OPACITY * 0.6,
    });
    group.add(new THREE.LineLoop(diamondGeo, diamondMat));

    return group;
  }

  private projectPath(
    pos: Position, vel: Velocity,
    thruster: Thruster | undefined,
    nav: NavigationOrder | undefined,
  ): TrailPoint[] {
    const points: TrailPoint[] = [{ x: pos.x, y: pos.y }];
    let px = pos.x, py = pos.y;
    let vx = vel.vx, vy = vel.vy;

    // If navigating, simulate the PN guidance forward
    if (nav && thruster && nav.phase !== 'arrived') {
      const a = thruster.maxThrust;
      const rotSpeed = thruster.rotationSpeed;

      for (let i = 0; i < MAX_NAV_PROJECTION_STEPS; i++) {
        const dx = nav.targetX - px;
        const dy = nav.targetY - py;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < nav.arrivalThreshold) break;

        const dirX = dx / dist;
        const dirY = dy / dist;
        const speed = Math.sqrt(vx * vx + vy * vy);

        // Same PN logic as NavigationSystem
        const rotTime = Math.PI / rotSpeed;
        const rotBuffer = speed * rotTime * 0.5;
        const effectiveDist = Math.max(0, dist - rotBuffer);
        const maxApproachSpeed = Math.sqrt(2 * a * effectiveDist);

        const desiredVx = dirX * maxApproachSpeed;
        const desiredVy = dirY * maxApproachSpeed;
        const dvx = desiredVx - vx;
        const dvy = desiredVy - vy;
        const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);

        if (dvMag > 0.01) {
          vx += (dvx / dvMag) * a * PROJECTION_DT;
          vy += (dvy / dvMag) * a * PROJECTION_DT;
        }

        px += vx * PROJECTION_DT;
        py += vy * PROJECTION_DT;
        points.push({ x: px, y: py });
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

  dispose(): void {
    for (const [, line] of this.trailLines) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    for (const [, line] of this.projectionLines) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    for (const [, marker] of this.destinationMarkers) {
      this.group.remove(marker);
    }
    this.trailLines.clear();
    this.projectionLines.clear();
    this.destinationMarkers.clear();
    this.scene.remove(this.group);
  }
}
