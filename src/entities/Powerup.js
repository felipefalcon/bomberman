import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';

export class Powerup {
  constructor(tx, ty, tileSize, type, texture) {
    this.tx = tx;
    this.ty = ty;
    this.tileSize = tileSize;
    this.type = type; // 'speed', 'bomb', 'range', 'shield', 'life', 'detonator'
    this.spriteScale = GAME_CONFIG.POWERUP_SPRITE_SCALE;
    
    // Create sprite
    this.sprite = new PIXI.Sprite(texture);
    this.sprite.scale.set(this.spriteScale, this.spriteScale);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.x = tx * tileSize + tileSize / 2;
    this.sprite.y = ty * tileSize + tileSize / 2;
    
    // Animation for powerup floating/bobbing
    this.animTimer = 0;
    this.floatOffset = 0;
  }

  update(delta) {
    // Bobbing animation
    this.animTimer += delta;
    this.floatOffset = Math.sin(this.animTimer * GAME_CONFIG.POWERUP_BOB_SPEED) * GAME_CONFIG.POWERUP_BOB_AMOUNT;
    this.sprite.y = this.ty * this.tileSize + this.tileSize / 2 + this.floatOffset;
  }

  isOnTile(tx, ty) {
    return this.tx === tx && this.ty === ty;
  }
}
