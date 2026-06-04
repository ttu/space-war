export type TimeScale = 1 | 2 | 4 | 10 | 20 | 50 | 100 | 1000 | 10000;

export class GameTime {
  /** Elapsed simulation time in seconds */
  elapsed = 0;
  /** Time scale multiplier — minimum is 1 (no true pause) */
  timeScale: TimeScale = 1;
  /** Last speed saved before slowing to 1x, restored by restoreSpeed() */
  private savedScale: TimeScale = 4;

  /** Fixed timestep for simulation (seconds per tick) */
  readonly fixedDt = 0.1; // 10 ticks per second

  tick(realDeltaSeconds: number): number {
    const simDelta = realDeltaSeconds * this.timeScale;
    this.elapsed += simDelta;
    return simDelta;
  }

  /**
   * Toggle between 1x (tactical slow) and the last higher speed.
   * If currently above 1x: saves scale and slows to 1.
   * If at 1x: restores savedScale.
   */
  toggleSlowdown(): void {
    if (this.timeScale > 1) {
      this.savedScale = this.timeScale;
      this.timeScale = 1;
    } else {
      this.timeScale = this.savedScale;
    }
  }

  /** Slow to 1x, saving current speed (if > 1) for later restore. */
  slowToMin(): void {
    if (this.timeScale > 1) {
      this.savedScale = this.timeScale;
    }
    this.timeScale = 1;
  }

  /** Restore speed to the last saved scale (above 1x). */
  restoreSpeed(): void {
    this.timeScale = this.savedScale;
  }

  setTimeScale(scale: TimeScale): void {
    this.timeScale = scale;
    if (scale > 1) {
      this.savedScale = scale;
    }
  }

  /** Format elapsed time as T+[Dd ]HH:MM:SS (days only when ≥1) */
  formatElapsed(): string {
    const totalSeconds = Math.floor(this.elapsed);
    const days = Math.floor(totalSeconds / 86400);
    const remainder = totalSeconds % 86400;
    const hours = Math.floor(remainder / 3600);
    const minutes = Math.floor((remainder % 3600) / 60);
    const seconds = remainder % 60;
    const timePart = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return days > 0 ? `T+${days}d ${timePart}` : `T+${timePart}`;
  }
}
