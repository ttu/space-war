import * as THREE from 'three';
import type { EventBus } from '../engine/core/EventBus';
import { getGlowTexture } from './glowTexture';

const RING_SEGMENTS = 48;

interface EffectStyle {
  /** Real-time duration in ms (wall clock, so it's visible at any time scale). */
  durationMs: number;
  /** Min ring radius in world km. */
  minRadius: number;
  /** Ring radius as a fraction of camera zoom, so effects stay visible zoomed out. */
  zoomFraction: number;
  particleCount: number;
  /** Fraction of ring radius the debris reaches by the end. */
  particleReach: number;
  ringColor: number;
  debrisColor: number;
  glowColor: number;
  /** Optional floating text shown above the effect. */
  label?: { text: string; color: string };
}

/** Ship destroyed: big, slow fireball. */
const SHIP_EXPLOSION: EffectStyle = {
  durationMs: 1600, minRadius: 3000, zoomFraction: 0.1, particleCount: 16, particleReach: 0.6,
  ringColor: 0xff8844, debrisColor: 0xff6622, glowColor: 0xffaa55,
};

/** Missile warhead hits a ship: hot white-orange flash on the hull. */
const MISSILE_IMPACT: EffectStyle = {
  durationMs: 800, minRadius: 1200, zoomFraction: 0.05, particleCount: 10, particleReach: 0.7,
  ringColor: 0xffcc66, debrisColor: 0xffaa44, glowColor: 0xffeecc,
  label: { text: 'HIT', color: '#ffb060' },
};

/** PDC kills a missile: small cyan pop, labelled so it can't be mistaken for a hit. */
const MISSILE_INTERCEPT: EffectStyle = {
  durationMs: 700, minRadius: 500, zoomFraction: 0.03, particleCount: 8, particleReach: 0.7,
  ringColor: 0x44ffff, debrisColor: 0x88ffff, glowColor: 0x66ffff,
  label: { text: 'INTERCEPTED', color: '#66ffff' },
};

interface ExplosionEffect {
  startMs: number;
  duration: number;
  maxRingRadius: number;
  particleCount: number;
  ring: THREE.LineLoop;
  ringMat: THREE.LineBasicMaterial;
  ringGeom: THREE.BufferGeometry;
  flash: THREE.LineLoop;
  flashMat: THREE.LineBasicMaterial;
  flashGeom: THREE.BufferGeometry;
  particles: THREE.Points;
  particleMat: THREE.PointsMaterial;
  particleGeom: THREE.BufferGeometry;
  glow: THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  label?: THREE.Sprite;
  labelAspect: number;
  /** Per-particle velocity in world km/ms: [vx0, vy0, vx1, vy1, ...] */
  velocities: Float32Array;
  /** Origin of the explosion in world km. */
  x: number;
  y: number;
}

function buildRingGeometry(segments: number): THREE.BufferGeometry {
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(a);
    positions[i * 3 + 1] = Math.sin(a);
    positions[i * 3 + 2] = 0;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geom;
}

/**
 * Renders short-lived effects for ship destruction, missile hits and PDC
 * intercepts. Animation runs in real wall-clock time so it's always visible
 * regardless of game time scale.
 */
export class ExplosionRenderer {
  private group = new THREE.Group();
  private effects: ExplosionEffect[] = [];
  /** Latest camera zoom, used to size new effects. */
  private zoom = 0;
  /** Label textures are shared per text so repeated intercepts don't allocate. */
  private labelTextures = new Map<string, { texture: THREE.Texture; aspect: number }>();

  constructor(scene: THREE.Scene, eventBus: EventBus) {
    scene.add(this.group);
    eventBus.subscribe('ShipDestroyed', (e) => {
      const x = e.data?.x as number | undefined ?? 0;
      const y = e.data?.y as number | undefined ?? 0;
      this.spawn(x, y, SHIP_EXPLOSION);
    });
    eventBus.subscribe('MissileImpact', (e) => this.spawnAtEvent(e.data, MISSILE_IMPACT));
    eventBus.subscribe('MissileIntercepted', (e) => this.spawnAtEvent(e.data, MISSILE_INTERCEPT));
  }

  private spawnAtEvent(data: Record<string, unknown> | undefined, style: EffectStyle): void {
    const x = data?.x as number | undefined;
    const y = data?.y as number | undefined;
    if (x !== undefined && y !== undefined) this.spawn(x, y, style);
  }

  private spawn(x: number, y: number, style: EffectStyle): void {
    const radius = Math.max(style.minRadius, this.zoom * style.zoomFraction);

    const ringGeom = buildRingGeometry(RING_SEGMENTS);
    const ringMat = new THREE.LineBasicMaterial({ color: style.ringColor, transparent: true, opacity: 1 });
    const ring = new THREE.LineLoop(ringGeom, ringMat);
    ring.position.set(x, y, 0.1);

    const flashGeom = buildRingGeometry(RING_SEGMENTS);
    const flashMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    const flash = new THREE.LineLoop(flashGeom, flashMat);
    flash.position.set(x, y, 0.11);

    const particleSpeed = (radius * style.particleReach) / style.durationMs;
    const particlePositions = new Float32Array(style.particleCount * 3);
    const velocities = new Float32Array(style.particleCount * 2);
    for (let i = 0; i < style.particleCount; i++) {
      const angle = (i / style.particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = particleSpeed * (0.4 + Math.random() * 0.6);
      velocities[i * 2] = Math.cos(angle) * speed;
      velocities[i * 2 + 1] = Math.sin(angle) * speed;
      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = 0.05;
    }
    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: style.debrisColor,
      size: 7,
      sizeAttenuation: false,
      map: getGlowTexture(),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeom, particleMat);

    const glowMat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: style.glowColor,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(x, y, 0.09);

    this.group.add(glow, ring, flash, particles);

    let label: THREE.Sprite | undefined;
    let labelAspect = 1;
    if (style.label) {
      const tex = this.getLabelTexture(style.label.text, style.label.color);
      label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.texture, transparent: true, depthWrite: false }));
      labelAspect = tex.aspect;
      this.group.add(label);
    }

    this.effects.push({
      startMs: performance.now(),
      duration: style.durationMs,
      maxRingRadius: radius,
      particleCount: style.particleCount,
      ring, ringMat, ringGeom,
      flash, flashMat, flashGeom,
      particles, particleMat, particleGeom,
      glow, glowMat,
      label, labelAspect,
      velocities, x, y,
    });
  }

  private getLabelTexture(text: string, color: string): { texture: THREE.Texture; aspect: number } {
    const cached = this.labelTextures.get(text);
    if (cached) return cached;
    const font = 'bold 30px Courier New';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
    canvas.height = 40;
    ctx.font = font; // resizing the canvas resets context state
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, 29);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const entry = { texture, aspect: canvas.width / canvas.height };
    this.labelTextures.set(text, entry);
    return entry;
  }

  update(zoom: number): void {
    this.zoom = zoom;
    const now = performance.now();
    this.effects = this.effects.filter((eff) => {
      const elapsed = now - eff.startMs;
      const t = Math.min(1, elapsed / eff.duration);

      if (t >= 1) {
        this.disposeEffect(eff);
        return false;
      }

      // Expanding ring: grows and fades
      const ringRadius = t * eff.maxRingRadius;
      eff.ring.scale.set(ringRadius, ringRadius, 1);
      eff.ringMat.opacity = 1 - t;

      // Flash: quick bright burst in first 20% then gone
      const flashT = Math.min(1, t / 0.2);
      const flashRadius = flashT * eff.maxRingRadius * 0.3;
      eff.flash.scale.set(flashRadius, flashRadius, 1);
      eff.flashMat.opacity = Math.max(0, 1 - flashT * 1.5);

      // Fireball: swells fast, then fades out
      const glowSize = eff.maxRingRadius * (0.6 + 0.8 * Math.min(1, t / 0.15));
      eff.glow.scale.set(glowSize, glowSize, 1);
      eff.glowMat.opacity = Math.pow(1 - t, 2);

      // Label: screen-constant size, drifts upward, fades in the last 40%
      if (eff.label) {
        const h = zoom * 0.04;
        eff.label.scale.set(h * eff.labelAspect, h, 1);
        eff.label.position.set(eff.x, eff.y + zoom * (0.04 + 0.03 * t), 0.12);
        (eff.label.material as THREE.SpriteMaterial).opacity = t < 0.6 ? 1 : (1 - t) / 0.4;
      }

      // Debris particles: spread outward, fade out in second half
      const posAttr = eff.particleGeom.attributes['position'] as THREE.BufferAttribute;
      const pos = posAttr.array as Float32Array;
      for (let i = 0; i < eff.particleCount; i++) {
        pos[i * 3] = eff.x + eff.velocities[i * 2] * elapsed;
        pos[i * 3 + 1] = eff.y + eff.velocities[i * 2 + 1] * elapsed;
      }
      posAttr.needsUpdate = true;
      eff.particleMat.opacity = t < 0.5 ? 1 : 2 * (1 - t);

      return true;
    });
  }

  private disposeEffect(eff: ExplosionEffect): void {
    this.group.remove(eff.ring, eff.flash, eff.particles, eff.glow);
    eff.ringGeom.dispose();
    eff.ringMat.dispose();
    eff.flashGeom.dispose();
    eff.flashMat.dispose();
    eff.particleGeom.dispose();
    eff.particleMat.dispose();
    eff.glowMat.dispose();
    if (eff.label) {
      this.group.remove(eff.label);
      (eff.label.material as THREE.Material).dispose();
    }
  }

  dispose(): void {
    for (const eff of this.effects) this.disposeEffect(eff);
    this.effects = [];
    for (const { texture } of this.labelTextures.values()) texture.dispose();
    this.labelTextures.clear();
  }
}
