import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position,
  CelestialBody,
  Ship,
  ContactTracker,
  COMPONENT,
} from '../engine/components';

/** Consider contacts within this distance (km) of a body as "at" that planet. */
const NEAR_BODY_RADIUS_KM = 8_000_000;

/** Offset below planet center for the indicator, in world km (scale with zoom). */
const VERTICAL_OFFSET_FACTOR = 0.04;

const ENEMY_INDICATOR_COLOR = 0xcc4444;

/**
 * Renders an "enemies here" indicator at each planet (or celestial body) that has
 * detected enemy contacts within sensor range. Makes it clear that intel shows
 * enemies around other planets even when they are far and data is minutes old.
 */
export class PlanetContactIndicatorsRenderer {
  private group = new THREE.Group();
  /** One indicator per body that has contacts; keyed by body entity id. */
  private indicators: Map<
    EntityId,
    { group: THREE.Group; dot: THREE.Mesh; label: THREE.Sprite }
  > = new Map();
  private bodyIdsWithContacts = new Set<EntityId>();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  update(
    world: World,
    zoom: number,
    playerContacts?: ContactTracker,
    gameTime?: number,
  ): void {
    if (!playerContacts || gameTime === undefined) {
      this.group.visible = false;
      return;
    }

    const bodyEntities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    const bodyPositions = new Map<EntityId, { x: number; y: number; name: string }>();
    for (const id of bodyEntities) {
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      bodyPositions.set(id, { x: pos.x, y: pos.y, name: body.name });
    }

    // Count contacts per body (extrapolated position, within NEAR_BODY_RADIUS_KM)
    const countByBody = new Map<EntityId, number>();
    for (const [entityId, contact] of playerContacts.contacts) {
      if (contact.lost) continue;
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship);
      if (!ship || ship.faction === 'player') continue;
      const age = gameTime - contact.receivedTime;
      const x = contact.lastKnownX + contact.lastKnownVx * age;
      const y = contact.lastKnownY + contact.lastKnownVy * age;

      let nearestId: EntityId | null = null;
      let nearestDist = Infinity;
      for (const [bodyId, info] of bodyPositions) {
        const dx = x - info.x;
        const dy = y - info.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < NEAR_BODY_RADIUS_KM && d < nearestDist) {
          nearestDist = d;
          nearestId = bodyId;
        }
      }
      if (nearestId !== null) {
        countByBody.set(nearestId, (countByBody.get(nearestId) ?? 0) + 1);
      }
    }

    this.bodyIdsWithContacts = new Set(countByBody.keys());
    this.group.visible = this.bodyIdsWithContacts.size > 0;

    for (const [bodyId, count] of countByBody) {
      const info = bodyPositions.get(bodyId)!;
      let ind = this.indicators.get(bodyId);
      if (!ind) {
        ind = this.createIndicator();
        this.indicators.set(bodyId, ind);
        this.group.add(ind.group);
      }
      ind.group.visible = true;
      ind.group.position.set(info.x, info.y - zoom * VERTICAL_OFFSET_FACTOR, 1.5);
      // Small dot: zoom-based so it stays visible but doesn't block the planet
      const dotSize = zoom * 0.0012;
      ind.dot.scale.set(dotSize, dotSize, 1);
      const labelSize = zoom * 0.004;
      ind.label.scale.set(labelSize * 4, labelSize, 1);
      this.updateLabelSprite(ind.label, count);
    }

    for (const [bodyId, ind] of this.indicators) {
      if (!this.bodyIdsWithContacts.has(bodyId)) {
        ind.group.visible = false;
      }
    }
  }

  private createIndicator(): {
    group: THREE.Group;
    dot: THREE.Mesh;
    label: THREE.Sprite;
  } {
    const group = new THREE.Group();
    const geo = new THREE.CircleGeometry(1, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: ENEMY_INDICATOR_COLOR,
      transparent: true,
      opacity: 0.6,
    });
    const dot = new THREE.Mesh(geo, mat);
    group.add(dot);

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 32;
    const texture = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });
    const label = new THREE.Sprite(labelMat);
    (label as THREE.Sprite & { userData: { canvas?: HTMLCanvasElement } }).userData.canvas = canvas;
    label.position.set(0, -2, 0); // below the small dot
    group.add(label);

    return { group, dot, label };
  }

  private updateLabelSprite(sprite: THREE.Sprite, count: number): void {
    const canvas = (sprite as THREE.Sprite & { userData: { canvas?: HTMLCanvasElement } }).userData.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 24px Courier New';
    ctx.fillStyle = '#cc4444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = count > 1 ? `${count} contacts` : '1 contact';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ((sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture).needsUpdate = true;
  }

  dispose(): void {
    for (const ind of this.indicators.values()) {
      ind.dot.geometry.dispose();
      (ind.dot.material as THREE.Material).dispose();
      (ind.label.material as THREE.Material).dispose();
    }
    this.indicators.clear();
    this.scene.remove(this.group);
  }
}
