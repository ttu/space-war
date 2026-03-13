import * as THREE from 'three';
import { World } from '../engine/types';
import {
  Position, Ship, Selectable, CelestialBody,
  COMPONENT,
} from '../engine/components';

/** Max distance to extend shadow wedges (effectively infinite on screen). */
const SHADOW_EXTEND_DISTANCE = 20_000_000; // km

const OCCLUDING_BODY_TYPES = new Set(['star', 'planet', 'moon']);

interface ShadowWedge {
  mesh: THREE.Mesh;
  edge1: THREE.Line;
  edge2: THREE.Line;
}

export class SensorOcclusionRenderer {
  private group = new THREE.Group();
  private wedges: ShadowWedge[] = [];
  private wedgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x112244,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x4488aa,
    transparent: true,
    opacity: 0.5,
  });

  constructor(private scene: THREE.Scene) {
    this.group.renderOrder = -1;
    this.scene.add(this.group);
  }

  update(world: World, enabled: boolean): void {
    if (!enabled) {
      this.hideAll();
      return;
    }

    const selectedShips = this.getSelectedPlayerShips(world);
    if (selectedShips.length === 0) {
      this.hideAll();
      return;
    }

    const bodies = this.getOccludingBodies(world);
    if (bodies.length === 0) {
      this.hideAll();
      return;
    }

    const neededCount = selectedShips.length * bodies.length;
    this.ensureWedgePool(neededCount);

    let wedgeIdx = 0;
    for (const ship of selectedShips) {
      for (const body of bodies) {
        const wedge = this.wedges[wedgeIdx];
        this.updateWedge(wedge, ship.x, ship.y, body.x, body.y, body.radius);
        wedgeIdx++;
      }
    }

    for (let i = wedgeIdx; i < this.wedges.length; i++) {
      this.wedges[i].mesh.visible = false;
      this.wedges[i].edge1.visible = false;
      this.wedges[i].edge2.visible = false;
    }
  }

  private getSelectedPlayerShips(world: World): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = [];
    const ships = world.query(COMPONENT.Position, COMPONENT.Ship, COMPONENT.Selectable);
    for (const id of ships) {
      const ship = world.getComponent<Ship>(id, COMPONENT.Ship)!;
      if (ship.faction !== 'player') continue;
      const sel = world.getComponent<Selectable>(id, COMPONENT.Selectable)!;
      if (!sel.selected) continue;
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      result.push({ x: pos.x, y: pos.y });
    }
    return result;
  }

  private getOccludingBodies(world: World): { x: number; y: number; radius: number }[] {
    const result: { x: number; y: number; radius: number }[] = [];
    const entities = world.query(COMPONENT.Position, COMPONENT.CelestialBody);
    for (const id of entities) {
      const body = world.getComponent<CelestialBody>(id, COMPONENT.CelestialBody)!;
      if (!OCCLUDING_BODY_TYPES.has(body.bodyType)) continue;
      const pos = world.getComponent<Position>(id, COMPONENT.Position)!;
      result.push({ x: pos.x, y: pos.y, radius: body.radius });
    }
    return result;
  }

  private updateWedge(
    wedge: ShadowWedge,
    shipX: number, shipY: number,
    bodyX: number, bodyY: number,
    bodyRadius: number,
  ): void {
    const dx = bodyX - shipX;
    const dy = bodyY - shipY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= bodyRadius) {
      wedge.mesh.visible = false;
      wedge.edge1.visible = false;
      wedge.edge2.visible = false;
      return;
    }

    const angleToBody = Math.atan2(dy, dx);
    const halfAngle = Math.asin(bodyRadius / dist);

    const angle1 = angleToBody - halfAngle;
    const angle2 = angleToBody + halfAngle;

    // Tangent points on the body circle
    const tangent1X = bodyX + bodyRadius * Math.cos(angle1 + Math.PI / 2);
    const tangent1Y = bodyY + bodyRadius * Math.sin(angle1 + Math.PI / 2);
    const tangent2X = bodyX + bodyRadius * Math.cos(angle2 - Math.PI / 2);
    const tangent2Y = bodyY + bodyRadius * Math.sin(angle2 - Math.PI / 2);

    // Far points: extend tangent lines far beyond the body (from body center outward)
    const far1X = bodyX + Math.cos(angle1) * SHADOW_EXTEND_DISTANCE;
    const far1Y = bodyY + Math.sin(angle1) * SHADOW_EXTEND_DISTANCE;
    const far2X = bodyX + Math.cos(angle2) * SHADOW_EXTEND_DISTANCE;
    const far2Y = bodyY + Math.sin(angle2) * SHADOW_EXTEND_DISTANCE;

    // Wedge quad (2 triangles)
    const positions = wedge.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, tangent1X, tangent1Y, -1);
    positions.setXYZ(1, far1X, far1Y, -1);
    positions.setXYZ(2, far2X, far2Y, -1);
    positions.setXYZ(3, tangent1X, tangent1Y, -1);
    positions.setXYZ(4, far2X, far2Y, -1);
    positions.setXYZ(5, tangent2X, tangent2Y, -1);
    positions.needsUpdate = true;
    wedge.mesh.geometry.computeBoundingSphere();
    wedge.mesh.visible = true;

    // Edge lines
    const e1Pos = wedge.edge1.geometry.getAttribute('position') as THREE.BufferAttribute;
    e1Pos.setXYZ(0, tangent1X, tangent1Y, -0.5);
    e1Pos.setXYZ(1, far1X, far1Y, -0.5);
    e1Pos.needsUpdate = true;
    wedge.edge1.geometry.computeBoundingSphere();
    wedge.edge1.visible = true;

    const e2Pos = wedge.edge2.geometry.getAttribute('position') as THREE.BufferAttribute;
    e2Pos.setXYZ(0, tangent2X, tangent2Y, -0.5);
    e2Pos.setXYZ(1, far2X, far2Y, -0.5);
    e2Pos.needsUpdate = true;
    wedge.edge2.geometry.computeBoundingSphere();
    wedge.edge2.visible = true;
  }

  private ensureWedgePool(count: number): void {
    while (this.wedges.length < count) {
      const meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 3), 3));
      const mesh = new THREE.Mesh(meshGeo, this.wedgeMaterial);
      mesh.visible = false;

      const edge1Geo = new THREE.BufferGeometry();
      edge1Geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3), 3));
      const edge1 = new THREE.Line(edge1Geo, this.edgeMaterial);
      edge1.visible = false;

      const edge2Geo = new THREE.BufferGeometry();
      edge2Geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3), 3));
      const edge2 = new THREE.Line(edge2Geo, this.edgeMaterial);
      edge2.visible = false;

      this.group.add(mesh);
      this.group.add(edge1);
      this.group.add(edge2);

      this.wedges.push({ mesh, edge1, edge2 });
    }
  }

  private hideAll(): void {
    for (const wedge of this.wedges) {
      wedge.mesh.visible = false;
      wedge.edge1.visible = false;
      wedge.edge2.visible = false;
    }
  }

  dispose(): void {
    for (const wedge of this.wedges) {
      wedge.mesh.geometry.dispose();
      wedge.edge1.geometry.dispose();
      wedge.edge2.geometry.dispose();
      this.group.remove(wedge.mesh);
      this.group.remove(wedge.edge1);
      this.group.remove(wedge.edge2);
    }
    this.wedges = [];
    this.wedgeMaterial.dispose();
    this.edgeMaterial.dispose();
    this.scene.remove(this.group);
  }
}
