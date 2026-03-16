import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import { Position, CelestialBody, COMPONENT } from '../engine/components';
import { DANGER_ZONE_MULTIPLIER } from '../engine/constants';

interface BodyVisual {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  gravityRings: THREE.LineLoop[];
  dangerRing: THREE.LineLoop;
  label: THREE.Sprite;
}

const BODY_COLORS: Record<string, number> = {
  star: 0xaa8833,
  planet: 0x334466,
  moon: 0x445566,
  station: 0x446644,
  asteroid: 0x554433,
};

export class CelestialRenderer {
  private visuals: Map<EntityId, BodyVisual> = new Map();
  private group = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  update(world: World, zoom: number): void {
    const bodyEntities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    const activeIds = new Set(bodyEntities);

    // Remove dead entities
    for (const [id, visual] of this.visuals) {
      if (!activeIds.has(id)) {
        this.group.remove(visual.group);
        this.visuals.delete(id);
      }
    }

    for (const entityId of bodyEntities) {
      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const body = world.getComponent<CelestialBody>(entityId, COMPONENT.CelestialBody)!;

      let visual = this.visuals.get(entityId);
      if (!visual) {
        visual = this.createBodyVisual(body);
        this.visuals.set(entityId, visual);
        this.group.add(visual.group);
      }

      visual.group.position.set(pos.x, pos.y, 0);

      // Scale body to always be visible but proportional
      const minVisualRadius = zoom * 0.008;
      const visualRadius = Math.max(body.radius, minVisualRadius);
      visual.bodyMesh.scale.set(visualRadius, visualRadius, 1);

      // Show/hide gravity rings based on zoom
      for (let i = 0; i < visual.gravityRings.length; i++) {
        const ringRadius = body.radius * (3 + i * 3);
        visual.gravityRings[i].scale.set(ringRadius, ringRadius, 1);
        visual.gravityRings[i].visible = ringRadius > zoom * 0.02;
      }

      // Danger zone ring (matches CollisionSystem)
      const dangerRadius = body.radius * DANGER_ZONE_MULTIPLIER;
      visual.dangerRing.scale.set(dangerRadius, dangerRadius, 1);
      visual.dangerRing.visible = dangerRadius > zoom * 0.02;

      // Label
      const labelScale = zoom * 0.04;
      const aspectRatio = (visual.label as THREE.Sprite & { userData: { labelAspectRatio?: number } }).userData
        .labelAspectRatio ?? 4;
      visual.label.scale.set(labelScale * aspectRatio, labelScale, 1);
      visual.label.position.set(0, -(visualRadius + labelScale), 0);
    }
  }

  private createBodyVisual(body: CelestialBody): BodyVisual {
    const group = new THREE.Group();
    const color = BODY_COLORS[body.bodyType] ?? 0x444444;

    // Body circle (filled)
    const bodyGeo = new THREE.CircleGeometry(1, 32);
    const bodyMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(bodyMesh);

    // Gravity well rings (3 concentric rings)
    const gravityRings: THREE.LineLoop[] = [];
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.BufferGeometry();
      const points: number[] = [];
      const segments = 64;
      for (let j = 0; j <= segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        points.push(Math.cos(angle), Math.sin(angle), 0);
      }
      ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const ringMat = new THREE.LineBasicMaterial({
        color: 0x223344,
        transparent: true,
        opacity: 0.2 - i * 0.05,
      });
      const ring = new THREE.LineLoop(ringGeo, ringMat);
      gravityRings.push(ring);
      group.add(ring);
    }

    // Danger zone ring at 2x radius
    const dangerGeo = new THREE.BufferGeometry();
    const dangerPoints: number[] = [];
    const dangerSegments = 64;
    for (let j = 0; j <= dangerSegments; j++) {
      const angle = (j / dangerSegments) * Math.PI * 2;
      dangerPoints.push(Math.cos(angle), Math.sin(angle), 0);
    }
    dangerGeo.setAttribute('position', new THREE.Float32BufferAttribute(dangerPoints, 3));
    const dangerMat = new THREE.LineBasicMaterial({
      color: 0xcc4422,
      transparent: true,
      opacity: 0.15,
    });
    const dangerRing = new THREE.LineLoop(dangerGeo, dangerMat);
    group.add(dangerRing);

    // Name label
    const label = this.createLabel(body.name);
    group.add(label);

    return { group, bodyMesh, gravityRings, dangerRing, label };
  }

  private createLabel(text: string): THREE.Sprite {
    const padding = 24;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = '36px Courier New';
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    canvas.width = Math.max(256, Math.ceil(textWidth) + padding);
    canvas.height = 64;
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '36px Courier New';
    ctx.fillStyle = '#6888a8';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    (sprite as THREE.Sprite & { userData: { labelAspectRatio?: number } }).userData.labelAspectRatio =
      canvas.width / canvas.height;
    return sprite;
  }

  dispose(): void {
    for (const [, visual] of this.visuals) {
      this.group.remove(visual.group);
    }
    this.visuals.clear();
    this.scene.remove(this.group);
  }
}
