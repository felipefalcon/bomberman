import * as PIXI from 'pixi.js';
import { TileMap } from './map.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
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
    this.monsters = [];
    this.livesText = null;
  }

  start() {
    this.map = new TileMap(this.app, this.tileSize, 13, 11);
    this.stage.addChild(this.map.container);

    PIXI.BitmapFont.install({
      name: 'HUDFont',
      chars: PIXI.BitmapFontManager.ASCII,
      resolution: window.devicePixelRatio || 1,
      padding: 8,
      textureStyle: { scaleMode: 'nearest' },
      style: {
        fontFamily: 'Silkscreen, monospace',
        fontSize: 8,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });

    this.livesText = new PIXI.BitmapText({
      text: 'Lives: 3',
      style: {
        fontFamily: 'HUDFont',
        fontSize: 8,
        fill: 0xffffff,
      },
      roundPixels: true,
    });
    this.livesText.x = 6;
    this.livesText.y = 6;
    this.stage.addChild(this.livesText);

    this._spawnMonsters(3);

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
    const tickDelta = typeof delta === 'number' ? delta : delta?.deltaTime ?? 1;

    if (this.player) {
      this.player.update(tickDelta, this.keys, this.map, this.bombs);
      this._processBombInput();
    }
    this._updateBombs(tickDelta);
    this._updateMonsters(tickDelta);
    this._updateExplosions(tickDelta);
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
    if (this.map.isBlocked(tx, ty)) return;
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
    bomb.rect(0, 0, this.tileSize, this.tileSize);
    bomb.fill(0x000000);
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

  _spawnMonsters(count) {
    const spawnTiles = this._findMonsterSpawnTiles(count);
    for (const { tx, ty } of spawnTiles) {
      const monster = new Monster(tx, ty, this.tileSize);
      this.monsters.push(monster);
      this.stage.addChild(monster.sprite);
    }
  }

  _findMonsterSpawnTiles(count) {
    const positions = [];
    for (let ty = 1; ty < this.map.rows - 1; ty++) {
      for (let tx = 1; tx < this.map.cols - 1; tx++) {
        const isStartArea = (tx === 1 && ty === 1) || (tx === 2 && ty === 1) || (tx === 1 && ty === 2);
        if (isStartArea) continue;
        if (this.map.isBlocked(tx, ty)) continue;
        const distanceFromStart = Math.abs(tx - 1) + Math.abs(ty - 1);
        if (distanceFromStart < 6) continue;
        positions.push({ tx, ty });
      }
    }
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    return positions.slice(0, count);
  }

  _explodeBomb(bomb) {
    this.bombs = this.bombs.filter((b) => b !== bomb);
    this.stage.removeChild(bomb.sprite);

    const center = { tx: bomb.tx, ty: bomb.ty };
    this._createExplosion(center);
    this._destroyTileAt(center.tx, center.ty);

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
        this._destroyTileAt(tx, ty);
      }
    }
  }

  _destroyTileAt(tx, ty) {
    if (this.map.isDestructible(tx, ty)) {
      this.map.destroyTile(tx, ty);
    }
  }

  _createExplosion(cell) {
    const explosion = {
      tx: cell.tx,
      ty: cell.ty,
      timer: 20,
      hasDamagedMonsters: false,
      sprite: this._createExplosionSprite(cell.tx, cell.ty),
    };
    this.explosions.push(explosion);
    this.stage.addChild(explosion.sprite);
  }

  _createExplosionSprite(tx, ty) {
    const gfx = new PIXI.Graphics();
    gfx.rect(0, 0, this.tileSize, this.tileSize);
    gfx.fill({ color: 0xFFCC33, alpha: 0.8 });
    gfx.x = tx * this.tileSize;
    gfx.y = ty * this.tileSize;
    return gfx;
  }

  _updateExplosions(delta) {
    const expire = [];
    for (const explosion of this.explosions) {
      explosion.timer -= delta;
      if (this.player && !explosion.hasDamagedPlayer && this._isPlayerOnTile(explosion.tx, explosion.ty)) {
        explosion.hasDamagedPlayer = true;
        this.player.takeDamage();
        this._refreshLivesText();
        if (this.player.lives <= 0) {
          this._handlePlayerDeath();
        }
      }
      if (!explosion.hasDamagedMonsters) {
        const hitMonsters = this.monsters.filter((monster) => monster.isOnTile(explosion.tx, explosion.ty));
        if (hitMonsters.length > 0) {
          explosion.hasDamagedMonsters = true;
          for (const monster of hitMonsters) {
            if (!monster.takeDamage()) {
              this._removeMonster(monster);
            }
          }
        }
      }
      if (explosion.timer <= 0) {
        expire.push(explosion);
      }
    }
    for (const explosion of expire) {
      this.stage.removeChild(explosion.sprite);
      this.explosions = this.explosions.filter((e) => e !== explosion);
    }
  }

  _updateMonsters(delta) {
    for (const monster of this.monsters.slice()) {
      monster.update(delta, this.map, this.bombs);
      if (this.player && monster.isOnTile(Math.floor(this.player.sprite.x / this.tileSize), Math.floor(this.player.sprite.y / this.tileSize))) {
        if (!monster.lastPlayerTouch) {
          monster.lastPlayerTouch = true;
          this.player.takeDamage();
          this._refreshLivesText();
          if (this.player.lives <= 0) {
            this._handlePlayerDeath();
          }
        }
      } else {
        monster.lastPlayerTouch = false;
      }
    }
  }

  _removeMonster(monster) {
    this.stage.removeChild(monster.sprite);
    this.monsters = this.monsters.filter((m) => m !== monster);
  }

  _isPlayerOnTile(tx, ty) {
    const playerTx = Math.floor(this.player.sprite.x / this.tileSize);
    const playerTy = Math.floor(this.player.sprite.y / this.tileSize);
    return playerTx === tx && playerTy === ty;
  }

  _refreshLivesText() {
    if (!this.livesText || !this.player) return;
    this.livesText.text = `Lives: ${this.player.lives}`;
  }

  _handlePlayerDeath() {
    if (this.player) {
      this.player.sprite.tint = 0xff0000;
      this.keys = {};
    }
    const gameOver = new PIXI.Text({
      text: 'Game Over',
      style: {
        fontFamily: 'Arial',
        fontSize: 28,
        fill: 0xff0000,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    gameOver.anchor.set(0.5, 0.5);
    gameOver.x = (this.tileSize * 13) / 2;
    gameOver.y = (this.tileSize * 11) / 2;
    this.stage.addChild(gameOver);
    this.app.ticker.stop();
  }
}

