import * as PIXI from 'pixi.js';
import { Game } from './Game.js';
import { GAME_CONFIG } from './config/Constants.js';

const GAME_ZOOM = GAME_CONFIG.GAME_ZOOM;
const SIDEBAR_WIDTH = GAME_CONFIG.SIDEBAR_WIDTH;
const LOGICAL_WIDTH = GAME_CONFIG.MAP_COLS * GAME_CONFIG.TILE_SIZE + SIDEBAR_WIDTH;
const LOGICAL_HEIGHT = GAME_CONFIG.MAP_ROWS * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE; // +1 tile for HUD row

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
  app.canvas.style.transform = `translateX(-${(SIDEBAR_WIDTH * GAME_ZOOM) / 2}px)`;

  document.getElementById('game').appendChild(app.canvas);

  // scale the stage so logical coordinates remain in 32x32 tiles
  app.stage.scale.set(GAME_ZOOM);
  window.__PIXI_APP__ = app;

  const game = new Game(app);
  window.__GAME__ = game;
  game.start();
}

bootstrap();
