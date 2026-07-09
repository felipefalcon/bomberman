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

    // load player spritesheet (user should place assets/player-spritesheet.png in the workspace)
    loadPlayerSprites('/assets/player-spritesheet.png', this.tileSize)
      .then(({ frames, mapping }) => {
        this.player = new Player(startX, startY, this.tileSize, frames, mapping);
        this.stage.addChild(this.player.sprite);
      })
      .catch(() => {
        // fallback to placeholder if loading fails
        this.player = new Player(startX, startY, this.tileSize);
        this.stage.addChild(this.player.sprite);
      });

    this.app.ticker.add(this.update.bind(this));
  }

  update(delta) {
    if (this.player) this.player.update(delta, this.keys, this.map);
  }
}
