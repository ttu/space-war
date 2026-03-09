import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import { Position, CelestialBody, COMPONENT } from '../engine/components';

interface BodyVisual {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  gravityRings: THREE.LineLoop[];
  label: THREE.Sprite;
}

const BODY_COLORS: Record<string, number> = {
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

      // Label
      const labelScale = zoom * 0.025;
      visual.label.scale.set(labelScale * 4, labelScale, 1);
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

    // Name label
    const label = this.createLabel(body.name);
    group.add(label);

    return { group, bodyMesh, gravityRings, label };
  }

  private createLabel(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = '24px Courier New';
    ctx.fillStyle = '#6888a8';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    return new THREE.Sprite(material);
  }

  dispose(): void {
    for (const [, visual] of this.visuals) {
      this.group.remove(visual.group);
    }
    this.visuals.clear();
    this.scene.remove(this.group);
  }
}
