import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import { EventBus } from '../engine/core/EventBus';
import { Position, COMPONENT } from '../engine/components';

const PDC_COLOR_PLAYER = 0xaaccff;
const PDC_COLOR_ENEMY = 0xff8866;
/** Game-seconds a tracer remains visible. PDC fires every tick so this only
 *  needs to bridge the gap between consecutive ticks at the slowest time
 *  scale; longer values make the tracer feel like a sustained beam. */
const TRACER_LIFETIME_SEC = 0.4;

interface ActiveTracer {
  shooterId: EntityId;
  targetId: EntityId;
  faction: 'player' | 'enemy' | 'neutral';
  expiresAt: number;
  line: THREE.Line;
  geom: THREE.BufferGeometry;
  mat: THREE.LineBasicMaterial;
}

/**
 * Renders short tracer lines for PDC fire. PDCs apply damage probabilistically
 * (no projectile entities), so we visualize them as a fading line from shooter
 * to target driven by PDCFiring events.
 */
export class PDCRenderer {
  private group = new THREE.Group();
  private tracers: ActiveTracer[] = [];

  constructor(private scene: THREE.Scene, eventBus: EventBus) {
    this.scene.add(this.group);
    eventBus.subscribe('PDCFiring', (e) => {
      if (!e.entityId || !e.targetId) return;
      const faction = (e.data?.faction as 'player' | 'enemy' | 'neutral') ?? 'neutral';
      this.spawn(e.entityId, e.targetId, faction, e.time);
    });
  }

  update(world: World, gameTime: number): void {
    const surviving: ActiveTracer[] = [];
    for (const t of this.tracers) {
      if (gameTime > t.expiresAt) {
        this.dispose(t);
        continue;
      }
      const sp = world.getComponent<Position>(t.shooterId, COMPONENT.Position);
      const tp = world.getComponent<Position>(t.targetId, COMPONENT.Position);
      if (!sp || !tp) {
        this.dispose(t);
        continue;
      }
      const arr = t.geom.attributes.position.array as Float32Array;
      arr[0] = sp.x; arr[1] = sp.y; arr[2] = 1.55;
      arr[3] = tp.x; arr[4] = tp.y; arr[5] = 1.55;
      t.geom.attributes.position.needsUpdate = true;
      const ageFraction = (t.expiresAt - gameTime) / TRACER_LIFETIME_SEC;
      t.mat.opacity = Math.max(0, Math.min(0.7, ageFraction * 0.7));
      surviving.push(t);
    }
    this.tracers = surviving;
  }

  private spawn(shooterId: EntityId, targetId: EntityId, faction: 'player' | 'enemy' | 'neutral', gameTime: number): void {
    // Reuse an existing tracer for the same shooter+target pair so rapid-fire
    // ticks just refresh its expiry instead of piling up Three objects.
    for (const t of this.tracers) {
      if (t.shooterId === shooterId && t.targetId === targetId) {
        t.expiresAt = gameTime + TRACER_LIFETIME_SEC;
        return;
      }
    }
    const color = faction === 'player' ? PDC_COLOR_PLAYER : PDC_COLOR_ENEMY;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geom, mat);
    this.group.add(line);
    this.tracers.push({
      shooterId, targetId, faction,
      expiresAt: gameTime + TRACER_LIFETIME_SEC,
      line, geom, mat,
    });
  }

  private dispose(t: ActiveTracer): void {
    this.group.remove(t.line);
    t.geom.dispose();
    t.mat.dispose();
  }

  destroy(): void {
    for (const t of this.tracers) this.dispose(t);
    this.tracers = [];
    this.scene.remove(this.group);
  }
}
