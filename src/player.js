import { AnimatedSprite, Graphics } from 'pixi.js';

export class Player {
  // textures: optional array of PIXI.Texture frames
  // mapping: optional animation mapping object
  constructor(x, y, tileSize = 32, textures = null, mapping = null) {
    this.tileSize = tileSize;
    this.spriteScale = 1.5; // Scale multiplier for rendering (1.5 = 48x48, 2 = 64x64)
    this.baseSpeed = 2.6;
    this.speed = this.baseSpeed; // pixels per tick (multiplied by delta)
    this.speedPowerups = 0;
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
      this.sprite.scale.set(this.spriteScale, this.spriteScale);
    } else {
      this.sprite = new Graphics();
      this.sprite.rect(-this.halfSize, -this.halfSize, this.tileSize, this.tileSize);
      this.sprite.fill(0x33cc33);
    }

    if (this.sprite.anchor && typeof this.sprite.anchor.set === 'function') {
      this.sprite.anchor.set(0.5, 0.5);
    }
    this.sprite.x = x;
    this.sprite.y = y;

    this.lives = 3;
    this._facing = 'down';
    this.blinkTimer = 0;
    this.isBlinking = false;
    this.blinkDuration = 60; // 3 blinks (6 frames) * 10 ticks each
    this.maxBombs = 1; // Maximum bombs can have at once
    this.activeBombs = 0; // Currently active bombs
    this.explosionRange = 1; // Explosion range in tiles
    this.canPierceBlocks = false; // Explosions can pass through blocks
    this.hasShield = false;
    this.hasDetonator = false;
  }

  takeDamage() {
    if (this.lives <= 0) return false;
    this.lives -= 1;
    this.startBlink();
    return this.lives > 0;
  }

  startBlink() {
    this.isBlinking = true;
    this.blinkTimer = 0;
  }

  update(delta, keys, map, bombs = []) {
    // Handle blink effect when taking damage
    if (this.isBlinking) {
      this.blinkTimer += delta;
      
      // Alternate between 50% and 100% opacity every 10 ticks
      const blinkPhase = Math.floor((this.blinkTimer / 10) % 2);
      this.sprite.alpha = blinkPhase === 0 ? 0.5 : 1;
      
      // End blink after duration
      if (this.blinkTimer >= this.blinkDuration) {
        this.isBlinking = false;
        this.sprite.alpha = 1;
      }
    }
    
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

    this._tryMove(moveX, moveY, map, bombs);
  }

  _tryMove(dx, dy, map, bombs) {
    // Axis-separated movement for smoother sliding along walls
    if (dx !== 0) {
      const nx = this.sprite.x + dx;
      if (!this._collidesAt(nx, this.sprite.y, map, bombs)) this.sprite.x = nx;
    }
    if (dy !== 0) {
      const ny = this.sprite.y + dy;
      if (!this._collidesAt(this.sprite.x, ny, map, bombs)) this.sprite.y = ny;
    }
  }

  _collidesAt(cx, cy, map, bombs) {
    // check collision box corners using collisionHalf
    const currentCorners = [
      { x: this.sprite.x - this.collisionHalf, y: this.sprite.y - this.collisionHalf },
      { x: this.sprite.x + this.collisionHalf - 1, y: this.sprite.y - this.collisionHalf },
      { x: this.sprite.x - this.collisionHalf, y: this.sprite.y + this.collisionHalf - 1 },
      { x: this.sprite.x + this.collisionHalf - 1, y: this.sprite.y + this.collisionHalf - 1 },
    ];
    const currentTiles = new Set(currentCorners.map((c) => `${Math.floor(c.x / this.tileSize)},${Math.floor(c.y / this.tileSize)}`));

    const corners = [
      { x: cx - this.collisionHalf, y: cy - this.collisionHalf },
      { x: cx + this.collisionHalf - 1, y: cy - this.collisionHalf },
      { x: cx - this.collisionHalf, y: cy + this.collisionHalf - 1 },
      { x: cx + this.collisionHalf - 1, y: cy + this.collisionHalf - 1 },
    ];

    for (const c of corners) {
      const tx = Math.floor(c.x / this.tileSize);
      const ty = Math.floor(c.y / this.tileSize);
      if (map.isBlocked(tx, ty)) return true;

      const bomb = bombs.find((bomb) => bomb.tx === tx && bomb.ty === ty);
      if (bomb) {
        if (currentTiles.has(`${tx},${ty}`)) {
          continue;
        }
        return true;
      }
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
    const animationFrames = anim.startsWith('walk') ? this._toPingPongFrames(frames) : frames;

    const shouldFlip = this._facing === 'left';

    if (this.sprite instanceof AnimatedSprite) {
      // replace textures if different
      const current = this.sprite.textures;
      if (current.length !== animationFrames.length || current[0] !== animationFrames[0]) {
        this.sprite.textures = animationFrames;
        this.sprite.play();
      }
      // always ensure anchor is centered
      if (this.sprite.anchor) {
        this.sprite.anchor.set(0.5, 0.5);
      }
    }

    if (shouldFlip) {
      this.sprite.scale.x = -this.spriteScale;
    } else if (this.sprite.scale.x < 0) {
      this.sprite.scale.x = this.spriteScale;
    }
  }

  _toPingPongFrames(frames) {
    if (frames.length <= 1) return frames;

    // Ping-pong centered: 2-1-0-1-2-3-4-3 and loops back to 2
    const middle = Math.floor(frames.length / 2);
    const leftPart = frames.slice(0, middle + 1).reverse();
    const rightPart = frames.slice(1);
    const backPart = frames.slice(middle + 1, -1).reverse();
    return leftPart.concat(rightPart).concat(backPart);
  }
}

function capitalize(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

