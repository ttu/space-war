import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Missile,
  COMPONENT,
} from '../engine/components';

interface MissileVisual {
  group: THREE.Group;
  dots: THREE.Mesh[];
  trail: THREE.Line;
}

const MISSILE_COLOR_PLAYER = 0x88bbff;
const MISSILE_COLOR_ENEMY = 0xff6644;
const TRAIL_OPACITY = 0.4;
const MAX_TRAIL_POINTS = 50;
const BALLISTIC_OPACITY = 0.3;

export class MissileRenderer {
  private visuals: Map<EntityId, MissileVisual> = new Map();
  private group = new THREE.Group();
  private trailHistory: Map<EntityId, { x: number; y: number }[]> = new Map();
  private tickCounter = 0;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  /** Called each simulation tick to record missile positions for trails. */
  recordPositions(world: World): void {
    this.tickCounter++;
    if (this.tickCounter % 3 !== 0) return;

    const missiles = world.query(COMPONENT.Position, COMPONENT.Missile);
    for (const id of missiles) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      let trail = this.trailHistory.get(id);
      if (!trail) {
        trail = [];
        this.trailHistory.set(id, trail);
      }
      trail.push({ x: pos.x, y: pos.y });
      if (trail.length > MAX_TRAIL_POINTS) {
        trail.shift();
      }
    }
  }

  update(world: World, zoom: number): void {
    const missileEntities = world.query(COMPONENT.Position, COMPONENT.Missile);
    const activeIds = new Set(missileEntities);

    // Remove visuals for dead missiles
    for (const [id, visual] of this.visuals) {
      if (!activeIds.has(id)) {
        this.group.remove(visual.group);
        this.group.remove(visual.trail);
        visual.trail.geometry.dispose();
        for (const dot of visual.dots) {
          dot.geometry.dispose();
        }
        this.visuals.delete(id);
        this.trailHistory.delete(id);
      }
    }

    const dotScale = zoom * 0.005;

    for (const entityId of missileEntities) {
      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const missile = world.getComponent<Missile>(entityId, COMPONENT.Missile)!;

      let visual = this.visuals.get(entityId);
      if (!visual) {
        visual = this.createMissileVisual(missile);
        this.visuals.set(entityId, visual);
        this.group.add(visual.group);
        this.group.add(visual.trail);
      }

      // Position the dot group
      visual.group.position.set(pos.x, pos.y, 1.5);

      // Update dot count visibility and scale
      for (let i = 0; i < visual.dots.length; i++) {
        visual.dots[i].visible = i < missile.count;
        visual.dots[i].scale.set(dotScale, dotScale, 1);
      }

      // Dim if ballistic
      const opacity = missile.guidanceMode === 'ballistic' ? BALLISTIC_OPACITY : 0.9;
      for (const dot of visual.dots) {
        (dot.material as THREE.MeshBasicMaterial).opacity = opacity;
      }

      // Update trail
      this.updateTrail(entityId, visual.trail);
    }
  }

  private createMissileVisual(missile: Missile): MissileVisual {
    const group = new THREE.Group();
    const color = missile.launcherFaction === 'player' ? MISSILE_COLOR_PLAYER : MISSILE_COLOR_ENEMY;

    // Create dots in a cluster pattern
    const dots: THREE.Mesh[] = [];
    const maxDots = Math.min(missile.count, 8);
    const spread = 0.3;
    for (let i = 0; i < maxDots; i++) {
      const angle = (i / maxDots) * Math.PI * 2;
      const offsetX = Math.cos(angle) * spread * (i > 0 ? 1 : 0);
      const offsetY = Math.sin(angle) * spread * (i > 0 ? 1 : 0);

      const geo = new THREE.CircleGeometry(1, 6);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const dot = new THREE.Mesh(geo, mat);
      dot.position.set(offsetX, offsetY, 0);
      dots.push(dot);
      group.add(dot);
    }

    // Trail line (in world space)
    const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: TRAIL_OPACITY,
    });
    const trail = new THREE.Line(trailGeo, trailMat);

    return { group, dots, trail };
  }

  private updateTrail(entityId: EntityId, trail: THREE.Line): void {
    const history = this.trailHistory.get(entityId);
    if (!history || history.length < 2) return;

    const posAttr = trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < history.length; i++) {
      posAttr.setXYZ(i, history[i].x, history[i].y, 1.0);
    }
    posAttr.needsUpdate = true;
    trail.geometry.setDrawRange(0, history.length);
  }

  dispose(): void {
    for (const [, visual] of this.visuals) {
      this.group.remove(visual.group);
      this.group.remove(visual.trail);
      visual.trail.geometry.dispose();
    }
    this.visuals.clear();
    this.trailHistory.clear();
    this.scene.remove(this.group);
  }
}
