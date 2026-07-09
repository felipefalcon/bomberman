import * as PIXI from 'pixi.js';
import { Game } from './game.js';

const GAME_ZOOM = 2; // adjust game zoom here
const LOGICAL_WIDTH = 13 * 32;
const LOGICAL_HEIGHT = 11 * 32;

const app = new PIXI.Application({
  width: LOGICAL_WIDTH * GAME_ZOOM,
  height: LOGICAL_HEIGHT * GAME_ZOOM,
  backgroundColor: 0x1099bb,
  resolution: window.devicePixelRatio || 1,
});

// nearest-neighbor rendering for pixel art
app.view.style.imageRendering = 'pixelated';
app.renderer.view.style.imageRendering = 'pixelated';

document.getElementById('game').appendChild(app.view);

// scale the stage so logical coordinates remain in 32x32 tiles
app.stage.scale.set(GAME_ZOOM);

const game = new Game(app);
game.start();
