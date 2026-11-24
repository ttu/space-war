import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import {
  Position, Velocity, Ship, Selectable, Thruster, COMPONENT, Faction,
  ContactTracker, DetectedContact, Missile,
} from '../engine/components';
import { getGlowTexture } from './glowTexture';

interface ShipVisual {
  group: THREE.Group;
  icon: THREE.Mesh;
  outline: THREE.LineLoop;
  glow: THREE.Sprite;
  selectionRing: THREE.LineLoop;
  targetReticle: THREE.Group;
  velocityLine: THREE.Line;
  thrustIndicator: THREE.Sprite;
  label: THREE.Sprite;
  labelAspect: number;
}

const FACTION_COLORS: Record<Faction, number> = {
  player: 0x55aaff,
  enemy: 0xff5555,
  neutral: 0x999999,
};

const SELECTION_COLOR = 0x44cccc;
const TARGET_RETICLE_COLOR = 0xff4444;

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

    // Build set of entities targeted by player missiles
    const targetedByPlayer = new Set<EntityId>();
    const missileEntities = world.query(COMPONENT.Position, COMPONENT.Missile);
    for (const mid of missileEntities) {
      const missile = world.getComponent<Missile>(mid, COMPONENT.Missile)!;
      if (missile.launcherFaction === 'player') {
        targetedByPlayer.add(missile.targetId);
      }
    }

    // Scale factor: ships should be visible regardless of zoom
    const iconScale = zoom * 0.022;

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
        visual = this.createShipVisual(ship.faction, ship.name);
        this.visuals.set(entityId, visual);
        this.group.add(visual.group);
      }
      visual.group.visible = true;

      // Update icon color: dimmed grey when going dark
      const iconMaterial = visual.icon.material as THREE.MeshBasicMaterial;
      iconMaterial.color.setHex(ship.darkMode ? 0x555555 : FACTION_COLORS[ship.faction]);
      (visual.glow.material as THREE.SpriteMaterial).visible = !ship.darkMode;

      // Position: use velocity-extrapolated position for enemy contacts
      if (contact && gameTime !== undefined) {
        const age = gameTime - contact.receivedTime;
        const estX = contact.lastKnownX + contact.lastKnownVx * age;
        const estY = contact.lastKnownY + contact.lastKnownVy * age;
        visual.group.position.set(estX, estY, 1);
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
      (visual.outline.material as THREE.LineBasicMaterial).opacity = iconMat.opacity;
      (visual.glow.material as THREE.SpriteMaterial).opacity = iconMat.opacity * 0.7;
      (visual.label.material as THREE.SpriteMaterial).opacity = Math.min(1, iconMat.opacity + 0.1);

      // Scale icon to be visible at any zoom
      visual.icon.scale.set(iconScale, iconScale, 1);
      visual.outline.scale.set(iconScale, iconScale, 1);
      visual.glow.scale.set(iconScale * 4, iconScale * 4, 1);
      visual.selectionRing.scale.set(iconScale * 1.4, iconScale * 1.4, 1);

      // Selection ring visibility
      visual.selectionRing.visible = selectable?.selected ?? false;

      // Target reticle visibility (enemy ships targeted by player missiles)
      const isTargeted = targetedByPlayer.has(entityId);
      visual.targetReticle.visible = isTargeted;
      if (isTargeted) {
        visual.targetReticle.scale.set(iconScale * 1.6, iconScale * 1.6, 1);
      }

      // Velocity vector line
      if (vel) {
        const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
        if (speed > 0.01) {
          const lineLength = Math.min(speed * 120, zoom * 0.5);
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
        const thrustScale = iconScale * (0.8 + thruster.throttle * 1.2);
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
      const labelHeight = iconScale * 1.8;
      visual.label.scale.set(labelHeight * visual.labelAspect, labelHeight, 1);
      visual.label.position.set(0, -iconScale * 1.5, 0);
    }
  }

  private createShipVisual(faction: Faction, name: string): ShipVisual {
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

    // Soft faction glow behind the icon
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    group.add(glow);
    group.add(icon);

    // Bright rim so the hull shape stays crisp against the glow
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(iconShape.getPoints());
    const outline = new THREE.LineLoop(outlineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    group.add(outline);

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

    // Target reticle: four corner brackets forming a square reticle
    const targetReticle = this.createTargetReticle();
    targetReticle.visible = false;
    group.add(targetReticle);

    // Velocity vector line
    const velGeo = new THREE.BufferGeometry();
    velGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const velMat = new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });
    const velocityLine = new THREE.Line(velGeo, velMat);
    group.add(velocityLine);

    // Thrust indicator: additive drive-plume glow
    const thrustIndicator = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: 0xffaa44,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    thrustIndicator.visible = false;
    group.add(thrustIndicator);

    // Name label
    const { sprite: label, aspect: labelAspect } = this.createTextSprite(name, color);
    group.add(label);

    return { group, icon, outline, glow, selectionRing, targetReticle, velocityLine, thrustIndicator, label, labelAspect };
  }

  private createTargetReticle(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: TARGET_RETICLE_COLOR, transparent: true, opacity: 0.8 });
    // Four corner brackets at ±1, each bracket is an L-shape (0.4 length)
    const bracketLen = 0.4;
    const corners = [
      { x: -1, y: 1, dx: 1, dy: -1 },   // top-left
      { x: 1, y: 1, dx: -1, dy: -1 },    // top-right
      { x: -1, y: -1, dx: 1, dy: 1 },    // bottom-left
      { x: 1, y: -1, dx: -1, dy: 1 },    // bottom-right
    ];
    for (const c of corners) {
      const points = new Float32Array([
        c.x + c.dx * bracketLen, c.y, 0,
        c.x, c.y, 0,
        c.x, c.y + c.dy * bracketLen, 0,
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      g.add(new THREE.Line(geo, mat));
    }
    return g;
  }

  private createTextSprite(text: string, color: number): { sprite: THREE.Sprite; aspect: number } {
    const font = '32px Courier New';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
    canvas.height = 44;
    ctx.font = font; // resizing the canvas resets context state
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    return { sprite: new THREE.Sprite(material), aspect: canvas.width / canvas.height };
  }

  dispose(): void {
    for (const [, visual] of this.visuals) {
      this.group.remove(visual.group);
    }
    this.visuals.clear();
    this.scene.remove(this.group);
  }
}
