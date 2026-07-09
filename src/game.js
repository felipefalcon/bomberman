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
    this.bombFuseTicks = 180; // 3 seconds at 60 FPS
    this.lastZ = false;
    this.bombs = [];
    this.explosions = [];
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
    if (this.player) {
      this.player.update(delta, this.keys, this.map);
      this._processBombInput();
    }
    this._updateBombs(delta);
    this._updateExplosions(delta);
  }

  _processBombInput() {
    const zPressed = !!this.keys['z'];
    if (zPressed && !this.lastZ) {
      this._placeBomb();
    }
    this.lastZ = zPressed;
  }

  _placeBomb() {
    const tx = Math.floor(this.player.sprite.x / this.tileSize);
    const ty = Math.floor(this.player.sprite.y / this.tileSize);
    if (this.map.isWall(tx, ty)) return;
    if (this.bombs.some((b) => b.tx === tx && b.ty === ty)) return;

    const bomb = {
      tx,
      ty,
      timer: this.bombFuseTicks,
      sprite: this._createBombSprite(tx, ty),
    };
    this.bombs.push(bomb);
    this.stage.addChild(bomb.sprite);
  }

  _createBombSprite(tx, ty) {
    const bomb = new PIXI.Graphics();
    bomb.beginFill(0x000000);
    bomb.drawRect(0, 0, this.tileSize, this.tileSize);
    bomb.endFill();
    bomb.x = tx * this.tileSize;
    bomb.y = ty * this.tileSize;
    return bomb;
  }

  _updateBombs(delta) {
    const expire = [];
    for (const bomb of this.bombs) {
      bomb.timer -= delta;
      if (bomb.timer <= 0) {
        expire.push(bomb);
      }
    }
    for (const bomb of expire) {
      this._explodeBomb(bomb);
    }
  }

  _explodeBomb(bomb) {
    this.bombs = this.bombs.filter((b) => b !== bomb);
    this.stage.removeChild(bomb.sprite);

    const center = { tx: bomb.tx, ty: bomb.ty };
    this._createExplosion(center);

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const dir of directions) {
      const tx = bomb.tx + dir.dx;
      const ty = bomb.ty + dir.dy;
      if (!this.map.isWall(tx, ty)) {
        this._createExplosion({ tx, ty });
      }
    }
  }

  _createExplosion(cell) {
    const explosion = {
      tx: cell.tx,
      ty: cell.ty,
      timer: 20,
      sprite: this._createExplosionSprite(cell.tx, cell.ty),
    };
    this.explosions.push(explosion);
    this.stage.addChild(explosion.sprite);
  }

  _createExplosionSprite(tx, ty) {
    const gfx = new PIXI.Graphics();
    gfx.beginFill(0xFFCC33, 0.8);
    gfx.drawRect(0, 0, this.tileSize, this.tileSize);
    gfx.endFill();
    gfx.x = tx * this.tileSize;
    gfx.y = ty * this.tileSize;
    return gfx;
  }

  _updateExplosions(delta) {
    const expire = [];
    for (const explosion of this.explosions) {
      explosion.timer -= delta;
      if (explosion.timer <= 0) {
        expire.push(explosion);
      }
    }
    for (const explosion of expire) {
      this.stage.removeChild(explosion.sprite);
      this.explosions = this.explosions.filter((e) => e !== explosion);
    }
  }
}

