import * as PIXI from 'pixi.js';
import { TileMap } from './map.js';
import { Player } from './player.js';
import { loadPlayerSprites } from './playerSprite.js';

export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    this.tileSize = 32;
    this.keys = {};
  }

  start() {
    this.map = new TileMap(this.app, this.tileSize, 13, 11);
    this.stage.addChild(this.map.container);

    // simple keyboard state
    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    // place player near top-left free tile
    const startX = this.tileSize * 1.5;
    const startY = this.tileSize * 1.5;

    // Try to load spritesheet from public assets (place player-spritesheet.png in public/assets)
    const sheetUrl = '/assets/player-spritesheet.png';
    loadPlayerSprites(sheetUrl, this.tileSize)
      .then(({ frames, mapping }) => {
        this.player = new Player(startX, startY, this.tileSize, frames, mapping);
        this.stage.addChild(this.player.sprite);
      })
      .catch((err) => {
        console.warn('Could not load spritesheet from', sheetUrl, 'using placeholder. Error:', err);
        this.player = new Player(startX, startY, this.tileSize);
        this.stage.addChild(this.player.sprite);
      });

    this.app.ticker.add(this.update.bind(this));
  }

  update(delta) {
    if (this.player) this.player.update(delta, this.keys, this.map);
  }
}

