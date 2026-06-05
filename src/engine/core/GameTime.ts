export type TimeScale = 1 | 2 | 4 | 10 | 20 | 50 | 100 | 1000 | 10000;

export class GameTime {
  /** Elapsed simulation time in seconds */
  elapsed = 0;
  /** Time scale multiplier */
  timeScale: TimeScale = 1;
  /** Last speed saved before slowing to 1x, restored by restoreSpeed() */
  private savedScale: TimeScale = 4;
  /** When true, simulation is fully frozen (game over, manual pause). */
  private _paused = false;

  /** Fixed timestep for simulation (seconds per tick) */
  readonly fixedDt = 0.1; // 10 ticks per second

  get isPaused(): boolean { return this._paused; }

  tick(realDeltaSeconds: number): number {
    if (this._paused) return 0;
    const simDelta = realDeltaSeconds * this.timeScale;
    this.elapsed += simDelta;
    return simDelta;
  }

  pause(): void { this._paused = true; }
  resume(): void { this._paused = false; }

  /**
   * Toggle between paused and 1x (or last saved speed above 1x).
   * Used by the Space / pause button.
   */
  toggleSlowdown(): void {
    if (this._paused) {
      this._paused = false;
      return;
    }
    if (this.timeScale > 1) {
      this.savedScale = this.timeScale;
      this.timeScale = 1;
    } else {
      this.timeScale = this.savedScale;
    }
  }

  /** Slow to 1x, saving current speed (if > 1) for later restore. */
  slowToMin(): void {
    this._paused = false;
    if (this.timeScale > 1) {
      this.savedScale = this.timeScale;
    }
    this.timeScale = 1;
  }

  /** Restore speed to the last saved scale (above 1x). */
  restoreSpeed(): void {
    this._paused = false;
    this.timeScale = this.savedScale;
  }

  setTimeScale(scale: TimeScale): void {
    this._paused = false;
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
