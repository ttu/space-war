import { SpaceWarGame } from './game/SpaceWarGame';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const container = document.getElementById('game-container') as HTMLElement;

const game = new SpaceWarGame(canvas, container);
game.start();

// Expose for Playwright e2e tests when loaded with ?e2e=1
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('e2e') === '1') {
  (window as unknown as { __spaceWarGame: SpaceWarGame }).__spaceWarGame = game;
}
