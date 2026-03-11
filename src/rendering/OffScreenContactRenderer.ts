import * as THREE from 'three';
import { World } from '../engine/types';
import {
  Position,
  Ship,
  ContactTracker,
  COMPONENT,
  Faction,
} from '../engine/components';

/** Distance in world km from view edge to place the marker (inside the view). */
const EDGE_INSET = 0.02;

const FACTION_COLORS: Record<Faction, number> = {
  player: 0x4488cc,
  enemy: 0xcc4444,
  neutral: 0x888888,
};

/**
 * Renders small markers at the viewport edge for ships/contacts that are outside
 * the current view, so the player stays aware of fleets at other planets.
 */
export class OffScreenContactRenderer {
  private group = new THREE.Group();
  private markers: { group: THREE.Group; mesh: THREE.Mesh }[] = [];
  private poolSize = 0;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  update(
    world: World,
    camX: number,
    camY: number,
    zoom: number,
    aspect: number,
    playerContacts?: ContactTracker,
    gameTime?: number,
  ): void {
    const halfW = zoom * aspect;
    const halfH = zoom;
    const left = camX - halfW;
    const right = camX + halfW;
    const bottom = camY - halfH;
    const top = camY + halfH;

    const offScreen: { x: number; y: number; faction: Faction }[] = [];

    // Player ships outside view
    const ships = world.query(COMPONENT.Position, COMPONENT.Ship);
    for (const id of ships) {
      const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      if (this.isOutside(pos.x, pos.y, left, right, bottom, top)) {
        offScreen.push({ x: pos.x, y: pos.y, faction: 'player' });
      }
    }

    // Detected enemy contacts outside view
    if (playerContacts && gameTime !== undefined) {
      for (const [entityId, contact] of playerContacts.contacts) {
        if (contact.lost) continue;
        const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship);
        if (!ship || ship.faction === 'player') continue;
        const age = gameTime - contact.receivedTime;
        const x = contact.lastKnownX + contact.lastKnownVx * age;
        const y = contact.lastKnownY + contact.lastKnownVy * age;
        if (this.isOutside(x, y, left, right, bottom, top)) {
          offScreen.push({ x, y, faction: ship.faction });
        }
      }
    }

    this.ensurePool(offScreen.length);
    this.group.visible = offScreen.length > 0;

    const insetW = halfW * (1 - EDGE_INSET);
    const insetH = halfH * (1 - EDGE_INSET);

    for (let i = 0; i < offScreen.length; i++) {
      const { x, y, faction } = offScreen[i];
      const edge = this.clampToViewEdge(x, y, camX, camY, insetW, insetH);
      const marker = this.markers[i];
      marker.group.visible = true;
      marker.group.position.set(edge.x, edge.y, 2);
      (marker.mesh.material as THREE.MeshBasicMaterial).color.setHex(FACTION_COLORS[faction]);
    }
    for (let i = offScreen.length; i < this.markers.length; i++) {
      this.markers[i].group.visible = false;
    }
  }

  private isOutside(
    x: number,
    y: number,
    left: number,
    right: number,
    bottom: number,
    top: number,
  ): boolean {
    return x < left || x > right || y < bottom || y > top;
  }

  /** Clamp (x,y) to the view rectangle; result is on the edge (inset). */
  private clampToViewEdge(
    x: number,
    y: number,
    camX: number,
    camY: number,
    halfW: number,
    halfH: number,
  ): { x: number; y: number } {
    const dx = x - camX;
    const dy = y - camY;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
      return { x: camX + halfW, y: camY };
    }
    const t = Math.min(halfW / Math.max(Math.abs(dx), 1e-9), halfH / Math.max(Math.abs(dy), 1e-9), 1);
    return {
      x: camX + dx * t,
      y: camY + dy * t,
    };
  }

  private ensurePool(count: number): void {
    const size = Math.max(count, 8);
    if (size <= this.poolSize) return;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.5);
    shape.lineTo(-0.35, -0.4);
    shape.lineTo(0.35, -0.4);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    for (let i = this.poolSize; i < size; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: FACTION_COLORS.enemy,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const group = new THREE.Group();
      group.add(mesh);
      const scale = 800;
      group.scale.set(scale, scale, 1);
      this.group.add(group);
      this.markers.push({ group, mesh });
    }
    this.poolSize = size;
  }

  dispose(): void {
    for (const { mesh } of this.markers) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.markers = [];
    this.poolSize = 0;
    this.scene.remove(this.group);
  }
}
