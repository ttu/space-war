import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Velocity, Ship, Selectable, Thruster, COMPONENT, Faction,
  ContactTracker, DetectedContact,
} from '../engine/components';

interface ShipVisual {
  group: THREE.Group;
  icon: THREE.Mesh;
  selectionRing: THREE.LineLoop;
  velocityLine: THREE.Line;
  thrustIndicator: THREE.Mesh;
  label: THREE.Sprite;
}

const FACTION_COLORS: Record<Faction, number> = {
  player: 0x4488cc,
  enemy: 0xcc4444,
  neutral: 0x888888,
};

const SELECTION_COLOR = 0x44cccc;

export class ShipRenderer {
  private visuals: Map<EntityId, ShipVisual> = new Map();
  private group = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
  }

  update(world: World, _alpha: number, zoom: number, playerContacts?: ContactTracker, gameTime?: number): void {
    const shipEntities = world.query(COMPONENT.Position, COMPONENT.Ship);
    const activeIds = new Set(shipEntities);

    // Remove visuals for dead entities
    for (const [id, visual] of this.visuals) {
      if (!activeIds.has(id)) {
        this.group.remove(visual.group);
        this.visuals.delete(id);
      }
    }

    // Scale factor: ships should be visible regardless of zoom
    const iconScale = zoom * 0.015;

    for (const entityId of shipEntities) {
      const pos = world.getComponent<Position>(entityId, COMPONENT.Position)!;
      const ship = world.getComponent<Ship>(entityId, COMPONENT.Ship)!;
      const vel = world.getComponent<Velocity>(entityId, COMPONENT.Velocity);
      const selectable = world.getComponent<Selectable>(entityId, COMPONENT.Selectable);
      const thruster = world.getComponent<Thruster>(entityId, COMPONENT.Thruster);

      // Fog of war: skip undetected enemy ships
      let contact: DetectedContact | undefined;
      if (playerContacts && ship.faction !== 'player') {
        contact = playerContacts.contacts.get(entityId);
        if (!contact) {
          // Not detected — hide if visual exists
          const existing = this.visuals.get(entityId);
          if (existing) {
            existing.group.visible = false;
          }
          continue;
        }
      }

      let visual = this.visuals.get(entityId);
      if (!visual) {
        visual = this.createShipVisual(ship.faction);
        this.visuals.set(entityId, visual);
        this.group.add(visual.group);
      }
      visual.group.visible = true;

      // Position: use detected (light-delayed) position for enemy contacts
      if (contact) {
        visual.group.position.set(contact.lastKnownX, contact.lastKnownY, 1);
      } else {
        visual.group.position.set(pos.x, pos.y, 1);
      }

      // Confidence-based opacity for detected enemies
      const iconMat = visual.icon.material as THREE.MeshBasicMaterial;
      if (contact && gameTime !== undefined) {
        const age = gameTime - contact.receivedTime;
        const ageFactor = Math.max(0.3, 1.0 - age * 0.02);
        const signalFactor = Math.min(1.0, contact.signalStrength * 1e9);
        const opacity = contact.lost
          ? Math.max(0.1, 0.4 * ageFactor)
          : ageFactor * signalFactor;
        iconMat.opacity = Math.max(0.15, Math.min(0.9, opacity));
      } else {
        iconMat.opacity = 0.9;
      }

      // Scale icon to be visible at any zoom
      visual.icon.scale.set(iconScale, iconScale, 1);
      visual.selectionRing.scale.set(iconScale * 1.4, iconScale * 1.4, 1);

      // Selection ring visibility
      visual.selectionRing.visible = selectable?.selected ?? false;

      // Velocity vector line
      if (vel) {
        const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
        if (speed > 0.01) {
          const lineLength = Math.min(speed * 50, zoom * 0.3);
          const nx = vel.vx / speed;
          const ny = vel.vy / speed;
          const positions = visual.velocityLine.geometry.getAttribute('position');
          positions.setXYZ(0, 0, 0, 0);
          positions.setXYZ(1, nx * lineLength, ny * lineLength, 0);
          positions.needsUpdate = true;
          visual.velocityLine.visible = true;
        } else {
          visual.velocityLine.visible = false;
        }
      }

      // Thrust indicator
      if (thruster && thruster.throttle > 0) {
        visual.thrustIndicator.visible = true;
        const thrustScale = iconScale * (0.5 + thruster.throttle * 0.5);
        visual.thrustIndicator.scale.set(thrustScale, thrustScale, 1);
        // Position behind the ship (opposite of thrust direction)
        const behindAngle = thruster.thrustAngle + Math.PI;
        visual.thrustIndicator.position.set(
          Math.cos(behindAngle) * iconScale * 1.2,
          Math.sin(behindAngle) * iconScale * 1.2,
          0,
        );
      } else {
        visual.thrustIndicator.visible = false;
      }

      // Label
      visual.label.scale.set(iconScale * 4, iconScale * 1.5, 1);
      visual.label.position.set(0, -iconScale * 2, 0);
    }
  }

  private createShipVisual(faction: Faction): ShipVisual {
    const group = new THREE.Group();
    const color = FACTION_COLORS[faction];

    // Ship icon: diamond shape
    const iconShape = new THREE.Shape();
    iconShape.moveTo(0, 1);
    iconShape.lineTo(0.6, 0);
    iconShape.lineTo(0, -0.3);
    iconShape.lineTo(-0.6, 0);
    iconShape.closePath();

    const iconGeo = new THREE.ShapeGeometry(iconShape);
    const iconMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    group.add(icon);

    // Selection ring
    const ringGeo = new THREE.BufferGeometry();
    const ringPoints: number[] = [];
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      ringPoints.push(Math.cos(angle), Math.sin(angle), 0);
    }
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPoints, 3));
    const ringMat = new THREE.LineBasicMaterial({ color: SELECTION_COLOR, transparent: true, opacity: 0.8 });
    const selectionRing = new THREE.LineLoop(ringGeo, ringMat);
    selectionRing.visible = false;
    group.add(selectionRing);

    // Velocity vector line
    const velGeo = new THREE.BufferGeometry();
    velGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const velMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
    const velocityLine = new THREE.Line(velGeo, velMat);
    group.add(velocityLine);

    // Thrust indicator (small circle glow)
    const thrustGeo = new THREE.CircleGeometry(0.5, 8);
    const thrustMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.7,
    });
    const thrustIndicator = new THREE.Mesh(thrustGeo, thrustMat);
    thrustIndicator.visible = false;
    group.add(thrustIndicator);

    // Name label
    const label = this.createTextSprite('');
    group.add(label);

    return { group, icon, selectionRing, velocityLine, thrustIndicator, label };
  }

  private createTextSprite(_text: string): THREE.Sprite {
    // Simple sprite placeholder - will show ship names later
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
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
