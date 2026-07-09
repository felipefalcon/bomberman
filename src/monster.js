import { AnimatedSprite, Graphics } from 'pixi.js';

export const MONSTER_SPEED = 0.85;

export class Monster {
  constructor(tx, ty, tileSize = 32, textures = null, mapping = null) {
    this.tileSize = tileSize;
    this.tx = tx;
    this.ty = ty;
    this.speed = MONSTER_SPEED;
    this.lives = 1;
    this.target = null;
    this.direction = null;
    this.isTrapped = false;
    this.lastAnimationFacing = null; // Track last animation to avoid redundant updates
    this.spriteScale = 1.5; // Scale multiplier for rendering (1.5 = 48x48)
    this.animationSpeed = 0.15;
    
    this.textures = textures;
    this.mapping = mapping;

    if (this.textures && this.mapping) {
      // create an AnimatedSprite using the idle frame by default
      const idleFrames = (this.mapping.idleDown || [0]).map(i => this.textures[i]).filter(Boolean);
      this.sprite = new AnimatedSprite(idleFrames.length ? idleFrames : [this.textures[0]]);
      this.sprite.animationSpeed = this.animationSpeed;
      this.sprite.loop = true;
      this.sprite.play();
      this.sprite.scale.set(this.spriteScale, this.spriteScale);
    } else {
      this.sprite = new Graphics();
      const half = this.tileSize / 2;
      this.sprite.rect(-half + 4, -half + 4, this.tileSize - 8, this.tileSize - 8);
      this.sprite.fill(0xCC0000);
    }

    if (this.sprite.anchor && typeof this.sprite.anchor.set === 'function') {
      this.sprite.anchor.set(0.5, 0.5);
    }

    const half = this.tileSize / 2;
    this.sprite.x = tx * this.tileSize + half;
    this.sprite.y = ty * this.tileSize + half;

    this._facing = 'down';
  }

  update(delta, map, bombs) {
    if (!this.target) {
      this._chooseTarget(map, bombs);
    }
    
    // If trapped, keep animating down
    if (this.isTrapped) {
      this._updateAnimation({ dx: 0, dy: 1 }); // Down direction
      return;
    }
    
    // Always update animation, even if no target
    if (!this.target) {
      this._updateAnimation(null); // Pass null to show "parado" animation
      return;
    }

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
      this._updateAnimation(this.direction);
      return;
    }

    this.sprite.x += (dx / distance) * speed;
    this.sprite.y += (dy / distance) * speed;
    this._updateAnimation(this.target.direction);
  }

  _updateAnimation(direction) {
    if (!this.textures || !this.mapping) return;

    let facing = this._facing;
    let frames = null;
    let newFacing = null;

    if (direction) {
      if (direction.dx > 0) {
        newFacing = 'right';
        frames = this.mapping.walkRight;
      } else if (direction.dx < 0) {
        newFacing = 'left';
        frames = this.mapping.walkLeft;
      } else if (direction.dy < 0) {
        newFacing = 'up';
        frames = this.mapping.walkUp;
      } else if (direction.dy > 0) {
        newFacing = 'down';
        frames = this.mapping.walkDown;
      }
    } else {
      // When stopped, always animate down
      newFacing = 'down';
      frames = this.mapping.walkDown;
    }

    if (newFacing && frames && frames.length > 0) {
      // Only update animation if facing changed (don't restart every frame)
      if (newFacing !== this.lastAnimationFacing) {
        this.lastAnimationFacing = newFacing;
        this._facing = newFacing;

        // Convert to ping-pong animation
        const ppFrames = this._toPingPongFrames(frames);
        const textureFrames = ppFrames.map(i => {
          if (i < 0 || i >= this.textures.length) {
            console.warn(`Invalid frame index ${i}, textures length: ${this.textures.length}`);
            return this.textures[0];
          }
          return this.textures[i];
        }).filter(Boolean);

        if (textureFrames.length > 0 && this.sprite instanceof AnimatedSprite) {
          this.sprite.textures = textureFrames;
          this.sprite.gotoAndPlay(0);
        }
      }
    }

    // Apply flip for left-facing
    if (this.sprite.scale && typeof this.sprite.scale.set === 'function') {
      this.sprite.scale.x = (newFacing === 'left') ? -this.spriteScale : this.spriteScale;
      this.sprite.scale.y = this.spriteScale;
      if (this.sprite.anchor && typeof this.sprite.anchor.set === 'function') {
        this.sprite.anchor.set(0.5, 0.5);
      }
    }
  }

  _toPingPongFrames(frames) {
    // Ping-pong: [0,1,2,3] => [0,1,2,3,2,1]
    return frames.concat(frames.slice(1, -1).reverse());
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
        this.isTrapped = false;
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

    if (choices.length === 0) {
      // Trapped in all directions - mark as trapped
      this.isTrapped = true;
      return;
    }
    
    this.isTrapped = false;
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
