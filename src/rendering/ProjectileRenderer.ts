import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Projectile,
  COMPONENT,
} from '../engine/components';

const PROJECTILE_COLOR_PLAYER = 0xaaccff;
const PROJECTILE_COLOR_ENEMY = 0xff8866;

export class ProjectileRenderer {
  private visuals: Map<EntityId, THREE.Mesh> = new Map();
  private group = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  update(world: World, zoom: number): void {
    const projectiles = world.query(COMPONENT.Position, COMPONENT.Projectile);
    const activeIds = new Set(projectiles);

    for (const [id, mesh] of this.visuals) {
      if (!activeIds.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.visuals.delete(id);
      }
    }

    const scale = zoom * 0.003;

    for (const entityId of projectiles) {
      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const proj = world.getComponent<Projectile>(entityId, COMPONENT.Projectile)!;

      let mesh = this.visuals.get(entityId);
      if (!mesh) {
        const color = proj.faction === 'player' ? PROJECTILE_COLOR_PLAYER : PROJECTILE_COLOR_ENEMY;
        const geo = new THREE.CircleGeometry(1, 8);
        const mat = new THREE.MeshBasicMaterial({ color });
        mesh = new THREE.Mesh(geo, mat);
        this.visuals.set(entityId, mesh);
        this.group.add(mesh);
      }

      mesh.position.set(pos.x, pos.y, 1.6);
      mesh.scale.set(scale, scale, 1);
    }
  }

  dispose(): void {
    for (const [, mesh] of this.visuals) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.visuals.clear();
    this.scene.remove(this.group);
  }
}
