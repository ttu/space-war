import * as THREE from 'three';
import { World, EntityId } from '../engine/types';
import { EventBus } from '../engine/core/EventBus';
import { Position, COMPONENT } from '../engine/components';

const PDC_COLOR_PLAYER = 0xaaddff;
const PDC_COLOR_ENEMY = 0xff9955;
/** How long a single tracer flash persists in game-seconds. Short so stacked
 *  tracers create a rapid-fire burst rather than a lingering beam. */
const TRACER_LIFETIME_SEC = 0.25;
/** Max overlapping tracers per shooter+target pair. Stacking gives a visual
 *  sense of high-cadence fire without spawning unbounded geometry. */
const MAX_TRACERS_PER_PAIR = 4;

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
 * Renders short tracer lines for PDC fire. Stacks up to MAX_TRACERS_PER_PAIR
 * lines per shooter+target pair so rapid fire looks like a bright burst.
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
      t.mat.opacity = Math.max(0, Math.min(1.0, ageFraction));
      surviving.push(t);
    }
    this.tracers = surviving;
  }

  private spawn(shooterId: EntityId, targetId: EntityId, faction: 'player' | 'enemy' | 'neutral', gameTime: number): void {
    // Count existing tracers for this pair; drop oldest if at cap
    const pairTracers = this.tracers.filter(
      (t) => t.shooterId === shooterId && t.targetId === targetId,
    );
    if (pairTracers.length >= MAX_TRACERS_PER_PAIR) {
      // Remove the oldest (lowest expiresAt) to make room
      const oldest = pairTracers.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b));
      const idx = this.tracers.indexOf(oldest);
      if (idx !== -1) {
        this.dispose(this.tracers[idx]);
        this.tracers.splice(idx, 1);
      }
    }
    const color = faction === 'player' ? PDC_COLOR_PLAYER : PDC_COLOR_ENEMY;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0 });
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
