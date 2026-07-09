import * as PIXI from 'pixi.js';
import { loadTilesetTiles } from './tilesetLoader.js';
import { loadBlockTexture } from './blockLoader.js';
import { loadPillarTexture } from './pillarLoader.js';

export class TileMap {
  constructor(app, tileSize = 32, cols = 17, rows = 13) {
    this.app = app;
    this.tileSize = tileSize;
    this.cols = cols;
    this.rows = rows;
    this.container = new PIXI.Container();
    this.tiles = [];
    this.tilesetFrames = null;
    this.tilesetMapping = null;
    this.blockTexture = null;
    this.pillarTexture = null;
    this.debugMode = false; // Desabilitado para debug

    this._initPromise = this._init();
  }

  async _init() {
    try {
      const tileset = await loadTilesetTiles();
      this.tilesetFrames = tileset.frames;
      this.tilesetMapping = tileset.mapping;
    } catch (err) {
      console.error('Failed to load tileset:', err);
      this.tilesetFrames = null;
    }

    try {
      this.blockTexture = await loadBlockTexture();
    } catch (err) {
      console.error('Failed to load block texture:', err);
      this.blockTexture = null;
    }

    try {
      this.pillarTexture = await loadPillarTexture();
    } catch (err) {
      console.error('Failed to load pillar texture:', err);
      this.pillarTexture = null;
    }

    this._generate();
  }

  _generate() {
    for (let y = 0; y < this.rows; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.cols; x++) {
        // simple rules: border walls + pillars on even coords
        let t = 0; // 0 = floor, 1 = wall, 2 = destructible crate
        if (x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1) t = 1;
        if (x % 2 === 0 && y % 2 === 0) t = 1;

        // leave open spaces near the start area
        const isStartSafe = (x === 1 && y === 1) || (x === 2 && y === 1) || (x === 1 && y === 2);
        if (t === 0 && !isStartSafe && Math.random() < 0.47) {
          t = 2; // destructible crate
        }

        // Use tileset/block/pillar texture if available, otherwise fallback to graphics
        let sprite = null;
        
        // Check if it's a pilar (internal wall)
        const isBorderWall = (x === 0 || x === this.cols - 1 || y === 0 || y === this.rows - 1);
        const isPilar = t === 1 && !isBorderWall;
        const isCrate = t === 2;

        if (isPilar && this.pillarTexture) {
          // Use pillar texture for internal walls
          sprite = new PIXI.Sprite(this.pillarTexture);
          sprite.anchor.set(0, 0); // Ensure anchor is at top-left
          sprite.position.set(x * this.tileSize, y * this.tileSize);
          sprite.scale.set(2, 2); // Scale from 16x16 to 32x32
          sprite.roundPixels = true; // Pixel-perfect rendering
          this.container.addChild(sprite);
        } else if (isCrate && this.blockTexture) {
          // Use block texture for destructible crates
          sprite = new PIXI.Sprite(this.blockTexture);
          sprite.anchor.set(0, 0); // Ensure anchor is at top-left
          sprite.position.set(x * this.tileSize, y * this.tileSize);
          sprite.scale.set(2, 2); // Scale from 16x16 to 32x32
          sprite.roundPixels = true; // Pixel-perfect rendering
          this.container.addChild(sprite);
        } else if (this.tilesetFrames && this.tilesetFrames.length > 0) {
          // Use tileset for border walls, floor, and fallback for pilars/crates
          let frameIndex = 0;
          if (t === 1) {
            // Cantos (verificar primeiro)
            if (x === 0 && y === 0) {
              frameIndex = 1; // canto topo-esquerdo
            } else if (x === this.cols - 1 && y === 0) {
              frameIndex = 4; // canto topo-direito
            } else if (x === 0 && y === this.rows - 1) {
              frameIndex = 25; // canto fundo-esquerdo
            } else if (x === this.cols - 1 && y === this.rows - 1) {
              frameIndex = 28; // canto fundo-direito
            }
            // Paredes
            else if (y === 0) {
              frameIndex = 2; // parede topo
            } else if (x === 0) {
              frameIndex = 13; // parede esquerda
            } else if (y === this.rows - 1) {
              frameIndex = 26; // parede fundo
            } else if (x === this.cols - 1) {
              frameIndex = 16; // parede direita
            } else {
              frameIndex = 2; // pilares internos (fallback)
            }
          } else if (t === 2) {
            frameIndex = 6; // crate (fallback)
          } else {
            frameIndex = 8; // chão
          }

          sprite = new PIXI.Sprite(this.tilesetFrames[frameIndex]);
          sprite.x = x * this.tileSize;
          sprite.y = y * this.tileSize;
          // Scale from 16x16 to 32x32
          sprite.scale.set(this.tileSize / 16, this.tileSize / 16);
          sprite.roundPixels = true; // Pixel-perfect rendering
          this.container.addChild(sprite);

          // Debug: Renderizar número do frame
          if (this.debugMode) {
            const debugText = new PIXI.Text({
              text: frameIndex.toString(),
              style: {
                fontFamily: 'Arial',
                fontSize: 8,
                fill: 0xffffff,
                stroke: { color: 0x000000, width: 1 },
              },
            });
            debugText.x = x * this.tileSize + 2;
            debugText.y = y * this.tileSize + 2;
            this.container.addChild(debugText);
          }
        } else {
          // Fallback to graphics if tileset not loaded
          const g = new PIXI.Graphics();
          if (t === 1) {
            g.rect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
            g.fill(0x666666);
            g.stroke({ color: 0x444444, width: 1 });
          } else if (t === 2) {
            g.rect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
            g.fill(0x8B4513);
            g.stroke({ color: 0x5A2E0C, width: 1 });
          } else {
            g.rect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
            g.fill(0xCCAA88);
            g.stroke({ color: 0xB28A63, width: 1 });
          }
          this.container.addChild(g);
        }

        this.tiles[y][x] = t;
      }
    }
  }

  isWall(tx, ty) {
    if (!this._isValidTileCoord(tx, ty)) return true;
    return this.tiles[ty][tx] === 1;
  }

  isBlocked(tx, ty) {
    if (!this._isValidTileCoord(tx, ty)) return true;
    return this.tiles[ty][tx] === 1 || this.tiles[ty][tx] === 2;
  }

  isDestructible(tx, ty) {
    if (!this._isValidTileCoord(tx, ty)) return false;
    return this.tiles[ty][tx] === 2;
  }

  _isValidTileCoord(tx, ty) {
    return Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }

  destroyTile(tx, ty) {
    if (!this.isDestructible(tx, ty)) return false;
    this.tiles[ty][tx] = 0;
    const index = ty * this.cols + tx;
    const child = this.container.children[index];
    if (child) this.container.removeChild(child);

    // Create floor sprite or graphics
    let sprite = null;
    if (this.tilesetFrames && this.tilesetFrames.length > 0) {
      sprite = new PIXI.Sprite(this.tilesetFrames[8]); // floor tile (frame 8)
      sprite.x = tx * this.tileSize;
      sprite.y = ty * this.tileSize;
      sprite.scale.set(this.tileSize / 16, this.tileSize / 16);
      sprite.roundPixels = true; // Pixel-perfect rendering
    } else {
      sprite = new PIXI.Graphics();
      sprite.rect(tx * this.tileSize, ty * this.tileSize, this.tileSize, this.tileSize);
      sprite.fill(0xCCAA88);
      sprite.stroke({ color: 0xB28A63, width: 1 });
    }

    this.container.addChildAt(sprite, index);
    return true;
  }
}
