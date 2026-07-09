import * as PIXI from 'pixi.js';
import { Game } from './game.js';

const GAME_ZOOM = 2; // adjust game zoom here
const LOGICAL_WIDTH = 13 * 32;
const LOGICAL_HEIGHT = 11 * 32;

async function bootstrap() {
  if (document.fonts?.load) {
    await document.fonts.load('8px Silkscreen');
  }

  const app = new PIXI.Application();

  await app.init({
    width: LOGICAL_WIDTH * GAME_ZOOM,
    height: LOGICAL_HEIGHT * GAME_ZOOM,
    background: 0x1099bb,
    resolution: window.devicePixelRatio || 1,
  });

  // nearest-neighbor rendering for pixel art
  app.canvas.style.imageRendering = 'pixelated';

  document.getElementById('game').appendChild(app.canvas);

  // scale the stage so logical coordinates remain in 32x32 tiles
  app.stage.scale.set(GAME_ZOOM);

  const game = new Game(app);
  game.start();
}

bootstrap();
