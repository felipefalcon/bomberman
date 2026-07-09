import * as PIXI from 'pixi.js';

export class TileMap {
  constructor(app, tileSize = 32, cols = 13, rows = 11) {
    this.app = app;
    this.tileSize = tileSize;
    this.cols = cols;
    this.rows = rows;
    this.container = new PIXI.Container();
    this.tiles = [];

    this._generate();
  }

  _generate() {
    for (let y = 0; y < this.rows; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.cols; x++) {
        // simple rules: border walls + pillars on even coords
        let t = 0; // 0 = floor, 1 = wall
        if (x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1) t = 1;
        if (x % 2 === 0 && y % 2 === 0) t = 1;

        // leave open spaces near the start area
        const isStartSafe = (x === 1 && y === 1) || (x === 2 && y === 1) || (x === 1 && y === 2);
        if (t === 0 && !isStartSafe && Math.random() < 0.47) {
          t = 2; // destructible crate
        }

        const g = new PIXI.Graphics();
        if (t === 1) {
          g.beginFill(0x666666);
          g.lineStyle(1, 0x444444);
          g.drawRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
          g.endFill();
        } else if (t === 2) {
          g.beginFill(0x8B4513);
          g.lineStyle(1, 0x5A2E0C);
          g.drawRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
          g.endFill();
        } else {
          g.beginFill(0xCCAA88);
          g.lineStyle(1, 0xB28A63);
          g.drawRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
          g.endFill();
        }

        this.container.addChild(g);
        this.tiles[y][x] = t;
      }
    }
  }

  isWall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return true;
    return this.tiles[ty][tx] === 1;
  }

  isBlocked(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return true;
    return this.tiles[ty][tx] === 1 || this.tiles[ty][tx] === 2;
  }

  isDestructible(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return false;
    return this.tiles[ty][tx] === 2;
  }

  destroyTile(tx, ty) {
    if (!this.isDestructible(tx, ty)) return false;
    this.tiles[ty][tx] = 0;
    const index = ty * this.cols + tx;
    const child = this.container.children[index];
    if (child) this.container.removeChild(child);
    const g = new PIXI.Graphics();
    g.beginFill(0xCCAA88);
    g.lineStyle(1, 0xB28A63);
    g.drawRect(tx * this.tileSize, ty * this.tileSize, this.tileSize, this.tileSize);
    g.endFill();
    this.container.addChildAt(g, index);
    return true;
  }
}
