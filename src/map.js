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

        const g = new PIXI.Graphics();
        if (t === 1) {
          g.beginFill(0x666666);
          g.lineStyle(1, 0x444444);
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
}
