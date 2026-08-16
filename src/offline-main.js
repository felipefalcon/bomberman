import * as PIXI from 'pixi.js';
import { Game } from './core/Game.js';
import { GAME_CONFIG } from './config/Constants.js';

const GAME_ZOOM = GAME_CONFIG.GAME_ZOOM;
const SIDEBAR_WIDTH = GAME_CONFIG.SIDEBAR_WIDTH;
const LOGICAL_WIDTH = GAME_CONFIG.MAP_COLS * GAME_CONFIG.TILE_SIZE + SIDEBAR_WIDTH;
const LOGICAL_HEIGHT = GAME_CONFIG.MAP_ROWS * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE; // +1 tile for HUD row

async function bootstrap() {
  try {
    console.log('Starting offline game bootstrap...');
    
    if (document.fonts?.load) {
      await document.fonts.load('8px Silkscreen');
    }

    console.log('Creating PIXI application...');
    const app = new PIXI.Application();

    console.log('Initializing PIXI app...');
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

    const gameContainer = document.getElementById('game');
    if (!gameContainer) {
      throw new Error('Game container not found');
    }
    gameContainer.appendChild(app.canvas);

    // scale the stage so logical coordinates remain in 32x32 tiles
    app.stage.scale.set(GAME_ZOOM);
    window.__PIXI_APP__ = app;

    // Force offline mode
    window.__ONLINE_ENABLED__ = false;
    window.__OFFLINE_MODE__ = true;
    
    // Generate random seed for variety
    const randomSeed = Math.floor(Math.random() * 1000000);
    console.log('Using random seed:', randomSeed);
    GAME_CONFIG.RNG_SEED = randomSeed;
    window.__ROOM_SEED__ = randomSeed;

    console.log('Creating game instance...');
    const game = new Game(app);
    window.__GAME__ = game;
    
    console.log('Starting game...');
    await game.start();
    
    console.log('Game started successfully!');
  } catch (error) {
    console.error('Error starting offline game:', error);
    
    // Show error on screen
    const gameContainer = document.getElementById('game');
    if (gameContainer) {
      gameContainer.innerHTML = `
        <div style="color: white; padding: 20px; font-family: monospace;">
          <h2>Error loading game</h2>
          <p>${error.message}</p>
          <pre style="background: #333; padding: 10px; overflow: auto;">${error.stack}</pre>
        </div>
      `;
    }
  }
}

bootstrap();
