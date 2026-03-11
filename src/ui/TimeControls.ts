import type { TimeScale } from '../engine/core/GameTime';
import { GameTime } from '../engine/core/GameTime';

export interface TimeControlsCallbacks {
  onPauseToggle: () => void;
  onSpeedChange: (scale: TimeScale) => void;
  onLoadoutClick?: () => void;
}

const SPEED_SCALES: TimeScale[] = [1, 2, 4, 10, 20, 50, 100, 1000, 10000];

function speedLabel(scale: TimeScale): string {
  if (scale === 1000) return '1k';
  if (scale === 10000) return '10k';
  return `${scale}x`;
}

/**
 * Pause/speed buttons and game clock. Renders into the given container.
 */
export class TimeControls {
  private root: HTMLElement;
  private pausedLabel: HTMLElement;
  private gameTimeLabel: HTMLElement;
  private speedButtons: HTMLButtonElement[] = [];

  constructor(
    container: HTMLElement,
    private gameTime: GameTime,
    callbacks: TimeControlsCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'time-controls';
    this.root.className = 'time-controls-panel';

    this.pausedLabel = document.createElement('span');
    this.pausedLabel.className = 'paused-label';
    this.pausedLabel.id = 'paused-label';
    this.pausedLabel.setAttribute('aria-live', 'polite');
    this.pausedLabel.textContent = 'PAUSED';
    this.root.appendChild(this.pausedLabel);

    const btnPause = document.createElement('button');
    btnPause.type = 'button';
    btnPause.id = 'btn-pause';
    btnPause.title = 'Space';
    btnPause.textContent = '⏸';
    btnPause.addEventListener('click', () => callbacks.onPauseToggle());
    this.root.appendChild(btnPause);

    for (const scale of SPEED_SCALES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.speed = String(scale);
      btn.textContent = speedLabel(scale as TimeScale);
      btn.addEventListener('click', () => callbacks.onSpeedChange(scale as TimeScale));
      this.speedButtons.push(btn);
      this.root.appendChild(btn);
    }

    this.gameTimeLabel = document.createElement('span');
    this.gameTimeLabel.className = 'game-time';
    this.gameTimeLabel.id = 'game-time';
    this.gameTimeLabel.textContent = 'T+00:00';
    this.root.appendChild(this.gameTimeLabel);

    const targetingReadout = document.createElement('span');
    targetingReadout.className = 'targeting-readout';
    targetingReadout.id = 'targeting-readout';
    this.root.appendChild(targetingReadout);

    const btnLoadout = document.createElement('button');
    btnLoadout.type = 'button';
    btnLoadout.id = 'btn-loadout';
    btnLoadout.title = 'Edit fleet loadout';
    btnLoadout.textContent = 'Loadout';
    if (callbacks.onLoadoutClick) {
      btnLoadout.addEventListener('click', () => callbacks.onLoadoutClick!());
    }
    this.root.appendChild(btnLoadout);

    container.appendChild(this.root);
  }

  /** Call each frame or when time/pause changes. */
  update(): void {
    this.gameTimeLabel.textContent = this.gameTime.formatElapsed();
    this.pausedLabel.classList.toggle('visible', this.gameTime.paused);
    this.speedButtons.forEach((btn, i) => {
      btn.classList.toggle('active', SPEED_SCALES[i] === this.gameTime.timeScale);
    });
  }

  getTargetingReadoutElement(): HTMLElement {
    return this.root.querySelector('#targeting-readout')!;
  }
}
