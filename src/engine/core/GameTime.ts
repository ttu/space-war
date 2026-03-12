export type TimeScale = 1 | 2 | 4 | 10 | 20 | 50 | 100 | 1000 | 10000;

export class GameTime {
  /** Elapsed simulation time in seconds */
  elapsed = 0;
  /** Whether simulation is paused */
  paused = false;
  /** Time scale multiplier */
  timeScale: TimeScale = 1;

  /** Fixed timestep for simulation (seconds per tick) */
  readonly fixedDt = 0.1; // 10 ticks per second

  tick(realDeltaSeconds: number): number {
    if (this.paused) return 0;
    const simDelta = realDeltaSeconds * this.timeScale;
    this.elapsed += simDelta;
    return simDelta;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  setTimeScale(scale: TimeScale): void {
    this.timeScale = scale;
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
