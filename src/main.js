import * as PIXI from 'pixi.js';
import { Game } from './game.js';

const GAME_ZOOM = 2; // adjust game zoom here
const LOGICAL_WIDTH = 17 * 32;
const LOGICAL_HEIGHT = 11 * 32 + 32; // +1 tile for HUD row

async function bootstrap() {
  if (document.fonts?.load) {
    await document.fonts.load('8px Silkscreen');
  }

  const app = new PIXI.Application();

  await app.init({
    width: LOGICAL_WIDTH * GAME_ZOOM,
    height: LOGICAL_HEIGHT * GAME_ZOOM,
    backgroundAlpha: 0,
    resolution: 1,
    antialias: false,
    roundPixels: true,
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
