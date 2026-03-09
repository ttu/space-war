import { SpaceWarGame } from './game/SpaceWarGame';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const container = document.getElementById('game-container') as HTMLElement;

const game = new SpaceWarGame(canvas, container);
game.start();
