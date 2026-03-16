import { CameraController } from './Camera';

interface FocusAnimation {
  phase: 'zoomOut' | 'pan' | 'zoomIn';
  startTime: number;
  fromX: number;
  fromY: number;
  fromZoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
  zoomOutLevel: number;
}

const FOCUS_ZOOM_OUT_S = 0.15;
const FOCUS_PAN_S = 0.25;
const FOCUS_ZOOM_IN_S = 0.12;
const FOCUS_ZOOM_OUT_LEVEL = 120_000;
const FOCUS_FINAL_ZOOM = 8000;

/**
 * Manages camera focus animations: zoom out → pan to target → zoom in.
 */
export class CameraAnimator {
  private animation: FocusAnimation | null = null;

  constructor(private camera: CameraController) {}

  /** Whether a focus animation is currently playing. */
  get isAnimating(): boolean {
    return this.animation != null;
  }

  /** Start a focus animation to the given world coordinates. */
  startFocus(targetX: number, targetY: number): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const pos = this.camera.getPosition();
    const fromZoom = this.camera.getZoom();
    const zoomOutLevel = Math.max(fromZoom, FOCUS_ZOOM_OUT_LEVEL);
    this.animation = {
      phase: 'zoomOut',
      startTime: now,
      fromX: pos.x,
      fromY: pos.y,
      fromZoom,
      targetX,
      targetY,
      targetZoom: FOCUS_FINAL_ZOOM,
      zoomOutLevel,
    };
  }

  /** Cancel any in-progress animation. */
  cancel(): void {
    this.animation = null;
  }

  /** Advance the animation one frame. Call from render loop. */
  update(): void {
    const a = this.animation;
    if (!a) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedMs = now - a.startTime;

    if (a.phase === 'zoomOut') {
      const durationMs = FOCUS_ZOOM_OUT_S * 1000;
      const t = Math.min(1, elapsedMs / durationMs);
      const smooth = t * t;
      const zoom = a.fromZoom + (a.zoomOutLevel - a.fromZoom) * smooth;
      this.camera.setPosition(a.fromX, a.fromY);
      this.camera.setZoom(zoom);
      if (t >= 1) {
        a.phase = 'pan';
        a.startTime = now;
      }
      return;
    }
    if (a.phase === 'pan') {
      const durationMs = FOCUS_PAN_S * 1000;
      const t = Math.min(1, elapsedMs / durationMs);
      const smooth = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const x = a.fromX + (a.targetX - a.fromX) * smooth;
      const y = a.fromY + (a.targetY - a.fromY) * smooth;
      this.camera.setPosition(x, y);
      this.camera.setZoom(a.zoomOutLevel);
      if (t >= 1) {
        a.phase = 'zoomIn';
        a.startTime = now;
      }
      return;
    }
    // zoomIn
    const durationMs = FOCUS_ZOOM_IN_S * 1000;
    const t = Math.min(1, elapsedMs / durationMs);
    const smooth = 1 - (1 - t) * (1 - t);
    const zoom = a.zoomOutLevel + (a.targetZoom - a.zoomOutLevel) * smooth;
    this.camera.setPosition(a.targetX, a.targetY);
    this.camera.setZoom(zoom);
    if (t >= 1) this.animation = null;
  }
}
