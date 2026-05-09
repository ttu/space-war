import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Velocity, Projectile,
  COMPONENT,
} from '../engine/components';

const PROJECTILE_COLOR_PLAYER = 0xaaccff;
const PROJECTILE_COLOR_ENEMY = 0xff8866;

interface Visual {
  head: THREE.Mesh;       // bright dot at the round
  streak: THREE.Line;     // tracer pointing back along velocity
  streakGeom: THREE.BufferGeometry;
}

export class ProjectileRenderer {
  private visuals: Map<EntityId, Visual> = new Map();
  private group = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  update(world: World, zoom: number): void {
    const projectiles = world.query(COMPONENT.Position, COMPONENT.Projectile);
    const activeIds = new Set(projectiles);

    for (const [id, v] of this.visuals) {
      if (!activeIds.has(id)) {
        this.removeVisual(id, v);
      }
    }

    // Head dot and streak both scale with zoom so the tracer reads at any
    // view. The streak length is short enough that consecutive rounds in a
    // burst show as separate tracers instead of merging into one bright
    // beam — at typical zoom you see five dots chasing each other.
    const headScale = zoom * 0.006;
    const STREAK_KM = zoom * 0.012;

    for (const entityId of projectiles) {
      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity);
      const proj = world.getComponent<Projectile>(entityId, COMPONENT.Projectile)!;

      let v = this.visuals.get(entityId);
      if (!v) {
        const color = proj.faction === 'player' ? PROJECTILE_COLOR_PLAYER : PROJECTILE_COLOR_ENEMY;
        const headGeo = new THREE.CircleGeometry(1, 8);
        const headMat = new THREE.MeshBasicMaterial({ color });
        const head = new THREE.Mesh(headGeo, headMat);
        const streakGeom = new THREE.BufferGeometry();
        streakGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const streakMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
        const streak = new THREE.Line(streakGeom, streakMat);
        v = { head, streak, streakGeom };
        this.visuals.set(entityId, v);
        this.group.add(head);
        this.group.add(streak);
      }

      v.head.position.set(pos.x, pos.y, 1.6);
      v.head.scale.set(headScale, headScale, 1);

      const speed = vel ? Math.hypot(vel.vx, vel.vy) : 0;
      const ux = speed > 0 ? vel!.vx / speed : 0;
      const uy = speed > 0 ? vel!.vy / speed : 0;
      const tailX = pos.x - ux * STREAK_KM;
      const tailY = pos.y - uy * STREAK_KM;
      const arr = v.streakGeom.attributes.position.array as Float32Array;
      arr[0] = tailX; arr[1] = tailY; arr[2] = 1.55;
      arr[3] = pos.x; arr[4] = pos.y; arr[5] = 1.55;
      v.streakGeom.attributes.position.needsUpdate = true;
    }
  }

  private removeVisual(id: EntityId, v: Visual): void {
    this.group.remove(v.head);
    this.group.remove(v.streak);
    v.head.geometry.dispose();
    (v.head.material as THREE.Material).dispose();
    v.streakGeom.dispose();
    (v.streak.material as THREE.Material).dispose();
    this.visuals.delete(id);
  }

  dispose(): void {
    for (const [id, v] of this.visuals) {
      this.removeVisual(id, v);
    }
    this.visuals.clear();
    this.scene.remove(this.group);
  }
}
