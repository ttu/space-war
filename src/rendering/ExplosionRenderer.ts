import * as THREE from 'three';
import type { EventBus } from '../engine/core/EventBus';

/** Real-time duration of the explosion animation in milliseconds. */
const DURATION_MS = 1600;
/** Max radius of the expanding ring in world km. */
const MAX_RING_RADIUS = 3000;
const RING_SEGMENTS = 48;
/** Number of debris particles per explosion. */
const PARTICLE_COUNT = 16;
/** Debris spread speed: particles reach MAX_RING_RADIUS * 0.6 by end. */
const PARTICLE_SPEED = (MAX_RING_RADIUS * 0.6) / DURATION_MS;

const RING_COLOR = new THREE.Color(0xff8844);
const FLASH_COLOR = new THREE.Color(0xffffff);
const DEBRIS_COLOR = new THREE.Color(0xff6622);

interface ExplosionEffect {
  startMs: number;
  ring: THREE.LineLoop;
  ringMat: THREE.LineBasicMaterial;
  ringGeom: THREE.BufferGeometry;
  flash: THREE.LineLoop;
  flashMat: THREE.LineBasicMaterial;
  flashGeom: THREE.BufferGeometry;
  particles: THREE.Points;
  particleMat: THREE.PointsMaterial;
  particleGeom: THREE.BufferGeometry;
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
 * Renders short-lived explosion effects at ship destruction sites.
 * Animation runs in real wall-clock time so it's always visible regardless
 * of game time scale.
 */
export class ExplosionRenderer {
  private group = new THREE.Group();
  private effects: ExplosionEffect[] = [];

  constructor(scene: THREE.Scene, eventBus: EventBus) {
    scene.add(this.group);
    eventBus.subscribe('ShipDestroyed', (e) => {
      const x = e.data?.x as number | undefined ?? 0;
      const y = e.data?.y as number | undefined ?? 0;
      this.spawn(x, y);
    });
  }

  private spawn(x: number, y: number): void {
    const ringGeom = buildRingGeometry(RING_SEGMENTS);
    const ringMat = new THREE.LineBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 1 });
    const ring = new THREE.LineLoop(ringGeom, ringMat);
    ring.position.set(x, y, 0.1);

    const flashGeom = buildRingGeometry(RING_SEGMENTS);
    const flashMat = new THREE.LineBasicMaterial({ color: FLASH_COLOR, transparent: true, opacity: 1 });
    const flash = new THREE.LineLoop(flashGeom, flashMat);
    flash.position.set(x, y, 0.11);

    const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 2);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = PARTICLE_SPEED * (0.4 + Math.random() * 0.6);
      velocities[i * 2] = Math.cos(angle) * speed;
      velocities[i * 2 + 1] = Math.sin(angle) * speed;
      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = 0.05;
    }
    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: DEBRIS_COLOR,
      size: 3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 1,
    });
    const particles = new THREE.Points(particleGeom, particleMat);

    this.group.add(ring);
    this.group.add(flash);
    this.group.add(particles);

    this.effects.push({
      startMs: performance.now(),
      ring, ringMat, ringGeom,
      flash, flashMat, flashGeom,
      particles, particleMat, particleGeom,
      velocities, x, y,
    });
  }

  update(): void {
    const now = performance.now();
    this.effects = this.effects.filter((eff) => {
      const elapsed = now - eff.startMs;
      const t = Math.min(1, elapsed / DURATION_MS);

      if (t >= 1) {
        this.group.remove(eff.ring);
        this.group.remove(eff.flash);
        this.group.remove(eff.particles);
        eff.ringGeom.dispose();
        eff.ringMat.dispose();
        eff.flashGeom.dispose();
        eff.flashMat.dispose();
        eff.particleGeom.dispose();
        eff.particleMat.dispose();
        return false;
      }

      // Expanding ring: grows and fades
      const ringRadius = t * MAX_RING_RADIUS;
      eff.ring.scale.set(ringRadius, ringRadius, 1);
      eff.ringMat.opacity = 1 - t;

      // Flash: quick bright burst in first 20% then gone
      const flashT = Math.min(1, t / 0.2);
      const flashRadius = flashT * MAX_RING_RADIUS * 0.3;
      eff.flash.scale.set(flashRadius, flashRadius, 1);
      eff.flashMat.opacity = Math.max(0, 1 - flashT * 1.5);

      // Debris particles: spread outward, fade out in second half
      const posAttr = eff.particleGeom.attributes['position'] as THREE.BufferAttribute;
      const pos = posAttr.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3] = eff.x + eff.velocities[i * 2] * elapsed;
        pos[i * 3 + 1] = eff.y + eff.velocities[i * 2 + 1] * elapsed;
      }
      posAttr.needsUpdate = true;
      eff.particleMat.opacity = t < 0.5 ? 1 : 2 * (1 - t);

      return true;
    });
  }

  dispose(): void {
    for (const eff of this.effects) {
      eff.ringGeom.dispose();
      eff.ringMat.dispose();
      eff.flashGeom.dispose();
      eff.flashMat.dispose();
      eff.particleGeom.dispose();
      eff.particleMat.dispose();
    }
    this.effects = [];
  }
}
