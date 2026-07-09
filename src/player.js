import { AnimatedSprite, Graphics, Point } from 'pixi.js';

export class Player {
  // textures: optional array of PIXI.Texture frames
  // mapping: optional animation mapping object
  constructor(x, y, tileSize = 32, textures = null, mapping = null) {
    this.tileSize = tileSize;
    this.speed = 2.6; // pixels per tick (multiplied by delta)
    this.halfSize = this.tileSize / 2;
    // collision hitbox slightly smaller than visual — default 26x26
    this.hitboxSize = 26;
    this.collisionHalf = Math.floor(this.hitboxSize / 2);

    this.textures = textures;
    this.mapping = mapping;

    if (this.textures && this.mapping) {
      // create an AnimatedSprite using the idle frame by default
      const idleFrames = (this.mapping.idleDown || [0]).map(i => this.textures[i]).filter(Boolean);
      this.sprite = new AnimatedSprite(idleFrames.length ? idleFrames : [this.textures[0]]);
      this.sprite.animationSpeed = 0.15;
      this.sprite.loop = true;
      this.sprite.play();
      this.sprite.scale.set(1, 1);
    } else {
      this.sprite = new Graphics();
      this.sprite.beginFill(0x33cc33);
      this.sprite.drawRect(-this.halfSize, -this.halfSize, this.tileSize, this.tileSize);
      this.sprite.endFill();
    }

    if (this.sprite.anchor && typeof this.sprite.anchor.set === 'function') {
      this.sprite.anchor.set(0.5, 0.5);
    } else {
      this.sprite.anchor = new Point(0.5, 0.5);
    }
    this.sprite.x = x;
    this.sprite.y = y;

    this._facing = 'down';
  }

  update(delta, keys, map) {
    let vx = 0, vy = 0;
    if (keys['arrowup'] || keys['w']) vy = -1;
    if (keys['arrowdown'] || keys['s']) vy = 1;
    if (keys['arrowleft'] || keys['a']) vx = -1;
    if (keys['arrowright'] || keys['d']) vx = 1;

    if (vx !== 0 && vy !== 0) {
      const inv = Math.SQRT1_2;
      vx *= inv; vy *= inv;
    }

    const moveX = vx * this.speed * delta;
    const moveY = vy * this.speed * delta;

    // decide animation based on input
    this._updateAnimation(vx, vy);

    this._tryMove(moveX, moveY, map);
  }

  _tryMove(dx, dy, map) {
    // Axis-separated movement for smoother sliding along walls
    if (dx !== 0) {
      const nx = this.sprite.x + dx;
      if (!this._collidesAt(nx, this.sprite.y, map)) this.sprite.x = nx;
    }
    if (dy !== 0) {
      const ny = this.sprite.y + dy;
      if (!this._collidesAt(this.sprite.x, ny, map)) this.sprite.y = ny;
    }
  }

  _collidesAt(cx, cy, map) {
    // check collision box corners using collisionHalf
    const corners = [
      { x: cx - this.collisionHalf, y: cy - this.collisionHalf },
      { x: cx + this.collisionHalf - 1, y: cy - this.collisionHalf },
      { x: cx - this.collisionHalf, y: cy + this.collisionHalf - 1 },
      { x: cx + this.collisionHalf - 1, y: cy + this.collisionHalf - 1 },
    ];

    for (const c of corners) {
      const tx = Math.floor(c.x / this.tileSize);
      const ty = Math.floor(c.y / this.tileSize);
      if (map.isWall(tx, ty)) return true;
    }
    return false;
  }

  _updateAnimation(vx, vy) {
    if (!this.textures || !this.mapping) return;

    let anim = null;
    if (vx === 0 && vy === 0) {
      anim = 'idle' + capitalize(this._facing);
    } else {
      if (Math.abs(vx) > Math.abs(vy)) {
        this._facing = vx > 0 ? 'right' : 'left';
      } else {
        this._facing = vy > 0 ? 'down' : 'up';
      }
      anim = 'walk' + capitalize(this._facing);
    }

    const frames = (this.mapping[anim] || []).map(i => this.textures[i]).filter(Boolean);
    if (frames.length === 0) return;

    const shouldFlip = this._facing === 'left';

    if (this.sprite instanceof AnimatedSprite) {
      // replace textures if different
      const current = this.sprite.textures;
      if (current.length !== frames.length || current[0] !== frames[0]) {
        this.sprite.textures = frames;
        this.sprite.gotoAndPlay(0);
      }
    }

    if (shouldFlip) {
      this.sprite.scale.x = -1;
    } else if (this.sprite.scale.x < 0) {
      this.sprite.scale.x = 1;
    }
  }
}

function capitalize(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

