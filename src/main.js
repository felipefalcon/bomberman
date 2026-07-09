import * as PIXI from 'pixi.js';
import { Game } from './game.js';

const ZOOM = 2.5;
const LOGICAL_WIDTH = 13 * 32;
const LOGICAL_HEIGHT = 11 * 32;

const app = new PIXI.Application({
  width: LOGICAL_WIDTH * ZOOM,
  height: LOGICAL_HEIGHT * ZOOM,
  backgroundColor: 0x1099bb,
  resolution: window.devicePixelRatio || 1,
});

// nearest-neighbor rendering for pixel art
app.view.style.imageRendering = 'pixelated';
app.renderer.view.style.imageRendering = 'pixelated';

document.getElementById('game').appendChild(app.view);

// scale the stage so logical coordinates remain in 32x32 tiles
app.stage.scale.set(ZOOM);

const game = new Game(app);
game.start();
