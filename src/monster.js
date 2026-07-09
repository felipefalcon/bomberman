import { Graphics } from 'pixi.js';

export const MONSTER_SPEED = 0.85;

export class Monster {
  constructor(tx, ty, tileSize) {
    this.tileSize = tileSize;
    this.tx = tx;
    this.ty = ty;
    this.speed = MONSTER_SPEED;
    this.lives = 1;
    this.target = null;
    this.direction = null;
    this.sprite = new Graphics();

    const half = this.tileSize / 2;
    this.sprite.beginFill(0xCC0000);
    this.sprite.drawRect(-half + 4, -half + 4, this.tileSize - 8, this.tileSize - 8);
    this.sprite.endFill();

    this.sprite.x = tx * this.tileSize + half;
    this.sprite.y = ty * this.tileSize + half;
  }

  update(delta, map, bombs) {
    if (!this.target) {
      this._chooseTarget(map, bombs);
    }
    if (!this.target) return;

    const half = this.tileSize / 2;
    const targetX = this.target.tx * this.tileSize + half;
    const targetY = this.target.ty * this.tileSize + half;

    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = this.speed * delta;

    if (distance <= speed || distance === 0) {
      this.sprite.x = targetX;
      this.sprite.y = targetY;
      this.tx = this.target.tx;
      this.ty = this.target.ty;
      this.direction = this.target.direction;
      this.target = null;
      return;
    }

    this.sprite.x += (dx / distance) * speed;
    this.sprite.y += (dy / distance) * speed;
  }

  _chooseTarget(map, bombs) {
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    if (this.direction) {
      const forward = { tx: this.tx + this.direction.dx, ty: this.ty + this.direction.dy, direction: this.direction };
      if (!map.isBlocked(forward.tx, forward.ty) && !bombs.some((bomb) => bomb.tx === forward.tx && bomb.ty === forward.ty)) {
        this.target = forward;
        return;
      }
    }

    const choices = directions
      .map((dir) => ({ tx: this.tx + dir.dx, ty: this.ty + dir.dy, direction: dir }))
      .filter(({ tx, ty }) => {
        if (map.isBlocked(tx, ty)) return false;
        if (bombs.some((bomb) => bomb.tx === tx && bomb.ty === ty)) return false;
        return true;
      });

    if (choices.length === 0) return;
    const next = choices[Math.floor(Math.random() * choices.length)];
    this.target = next;
  }

  isOnTile(tx, ty) {
    const currentTx = Math.floor(this.sprite.x / this.tileSize);
    const currentTy = Math.floor(this.sprite.y / this.tileSize);
    return currentTx === tx && currentTy === ty;
  }

  takeDamage() {
    this.lives -= 1;
    return this.lives > 0;
  }
}
