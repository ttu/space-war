import { GameTime } from '../engine/core/GameTime';

export class GameLoop {
  private animationFrameId: number | null = null;
  private lastTimestamp = 0;
  private accumulator = 0;

  constructor(
    private gameTime: GameTime,
    private onFixedUpdate: (dt: number) => void,
    private onRender: (alpha: number) => void,
  ) {}

  start(): void {
    this.lastTimestamp = performance.now();
    this.accumulator = 0;
    this.loop(this.lastTimestamp);
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop = (timestamp: number): void => {
    this.animationFrameId = requestAnimationFrame(this.loop);

    const realDelta = Math.min((timestamp - this.lastTimestamp) / 1000, 0.25); // cap to avoid spiral
    this.lastTimestamp = timestamp;

    const simDelta = this.gameTime.tick(realDelta);
    this.accumulator += simDelta;

    // Fixed timestep simulation updates
    const dt = this.gameTime.fixedDt;
    while (this.accumulator >= dt) {
      this.onFixedUpdate(dt);
      this.accumulator -= dt;
    }

    // Render with interpolation alpha
    const alpha = this.accumulator / dt;
    this.onRender(alpha);
  };
}
