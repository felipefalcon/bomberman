import { AnimatedSprite, Graphics } from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';
import { ComponentManager } from '../components/ComponentManager.js';
import { getCornerTileKeys, getCorners, tileCenter, tileKey, toTile } from '../utils/tileUtils.js';

export class Player {
  // textures: optional object with player spritesheets by player number {1: frames, 2: frames, ...}
  // mapping: optional object with animation mappings by player number {1: mapping, 2: mapping, ...}
  constructor(x, y, tileSize = GAME_CONFIG.TILE_SIZE, textures = null, mapping = null, gameState = null) {
    this.tileSize = tileSize;
    this.spriteScale = GAME_CONFIG.PLAYER_SPRITE_SCALE;
    this.baseSpeed = GAME_CONFIG.PLAYER_BASE_SPEED;
    this.speed = this.baseSpeed; // pixels per tick (multiplied by delta)
    this.halfSize = this.tileSize / 2;
    this.hitboxSize = GAME_CONFIG.PLAYER_HITBOX_SIZE;
    this.collisionHalf = Math.floor(this.hitboxSize / 2);

    this.textures = textures || {};
    this.mapping = mapping || {};
    this.gameState = gameState; // Reference to GameState for reading state

    // Component system for powerups
    this.componentManager = new ComponentManager();

    // Default to player 1 sprites
    this.playerId = null;
    this.currentPlayerNumber = 1;

    if (this.textures[this.currentPlayerNumber] && this.mapping[this.currentPlayerNumber]) {
      // create an AnimatedSprite using the idle frame by default
      const playerTextures = this.textures[this.currentPlayerNumber];
      const playerMapping = this.mapping[this.currentPlayerNumber];
      const idleFrames = (playerMapping.idleDown || [0]).map(i => playerTextures[i]).filter(Boolean);
      this.sprite = new AnimatedSprite(idleFrames.length ? idleFrames : [playerTextures[0]]);
      this.sprite.animationSpeed = GAME_CONFIG.ANIMATION_SPEED;
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
    this.sprite.roundPixels = true;
    this.sprite.x = x;
    this.sprite.y = y;

    // Visual/animation state only (game state is in GameState)
    this._facing = 'down';
    this.blinkTimer = 0;
    this.isBlinking = false;
    this.blinkDuration = GAME_CONFIG.PLAYER_BLINK_DURATION;
  }

  // Getters for player state from GameState
  get lives() {
    return this.gameState?.playerState?.lives ?? GAME_CONFIG.PLAYER_STARTING_LIVES;
  }

  get maxBombs() {
    return this.gameState?.playerState?.maxBombs ?? GAME_CONFIG.PLAYER_STARTING_BOMBS;
  }

  get activeBombs() {
    return this.gameState?.playerState?.activeBombs ?? 0;
  }

  set activeBombs(value) {
    if (this.gameState) {
      this.gameState.playerState.activeBombs = value;
    }
  }

  get explosionRange() {
    return this.gameState?.playerState?.explosionRange ?? GAME_CONFIG.PLAYER_STARTING_RANGE;
  }

  get speedPowerups() {
    return this.gameState?.playerState?.speedPowerups ?? 0;
  }

  get canPierceBlocks() {
    return (this.componentManager.hasComponent('pierce') || this.gameState?.playerState?.canPierceBlocks) ?? false;
  }

  get hasKickBomb() {
    return (this.componentManager.hasComponent('kick_bomb') || this.gameState?.playerState?.hasKickBomb) ?? false;
  }

  get hasThrowBomb() {
    return (this.componentManager.hasComponent('throw_bomb') || this.gameState?.playerState?.hasThrowBomb) ?? false;
  }

  get hasCrossBlock() {
    return (this.componentManager.hasComponent('cross_block') || this.gameState?.playerState?.hasCrossBlock) ?? false;
  }

  get hasCrossBomb() {
    return (this.componentManager.hasComponent('cross_bomb') || this.gameState?.playerState?.hasCrossBomb) ?? false;
  }

  get hasFollowerBomb() {
    return (this.componentManager.hasComponent('follower_bomb') || this.gameState?.playerState?.hasFollowerBomb) ?? false;
  }

  get hasLandMine() {
    return (this.componentManager.hasComponent('land_mine') || this.gameState?.playerState?.hasLandMine) ?? false;
  }

  get damageBlinkTicks() {
    return this.gameState?.playerState?.damageBlinkTicks ?? 0;
  }

  setPlayerIdentity(playerId) {
    this.playerId = playerId;
    const playerNumber = this._resolvePlayerNumber(playerId);
    this._updatePlayerSprites(playerNumber);
  }

  _resolvePlayerNumber(playerId) {
    if (!playerId) return 1;
    if (playerId.startsWith('player-')) {
      const parsed = Number(playerId.split('-').pop());
      return Number.isFinite(parsed) ? parsed : 1;
    }
    if (playerId === 'p1' || playerId === 'player1' || playerId === '1') return 1;
    if (playerId === 'p2' || playerId === 'player2' || playerId === '2') return 2;
    if (playerId === 'p3' || playerId === 'player3' || playerId === '3') return 3;
    if (playerId === 'p4' || playerId === 'player4' || playerId === '4') return 4;
    return 1;
  }

  _updatePlayerSprites(playerNumber) {
    if (this.currentPlayerNumber === playerNumber) return;

    this.currentPlayerNumber = playerNumber;

    // Check if we have sprites for this player
    if (this.textures[playerNumber] && this.mapping[playerNumber]) {
      const playerTextures = this.textures[playerNumber];
      const playerMapping = this.mapping[playerNumber];

      // Update the sprite textures
      if (this.sprite instanceof AnimatedSprite) {
        const idleFrames = (playerMapping.idleDown || [0]).map(i => playerTextures[i]).filter(Boolean);
        this.sprite.textures = idleFrames.length ? idleFrames : [playerTextures[0]];
      }
    }
  }

  takeDamage() {
    const damageBlinkTicks = this.gameState?.playerState?.damageBlinkTicks ?? 0;
    if (this.lives <= 0 || damageBlinkTicks > 0) return false;
    // Update GameState instead of local state
    if (this.gameState) {
      this.gameState.playerState.lives -= 1;
    }
    this.startBlink();
    return this.lives > 0;
  }

  startBlink() {
    this.isBlinking = true;
    this.blinkTimer = 0;
    // Set damageBlinkTicks in gameState for online sync
    if (this.gameState) {
      this.gameState.playerState.damageBlinkTicks = this.blinkDuration;
    }
  }

  update(delta, keys, map, bombs = [], bombSystem = null, skipLocalPositionIntegration = false) {
    // Handle blink effect when taking damage
    const damageBlinkTicks = this.gameState?.playerState?.damageBlinkTicks ?? 0;
    
    // Start blinking if damageBlinkTicks is set and not already blinking
    if (damageBlinkTicks > 0 && !this.isBlinking) {
      this.startBlink();
    }
    
    // Stop blinking if damageBlinkTicks is 0
    if (damageBlinkTicks <= 0 && this.isBlinking) {
      this.isBlinking = false;
      this.sprite.alpha = 1;
    }
    
    if (this.isBlinking) {
      this.blinkTimer += delta;
      
      // Alternate between 50% and 100% opacity every 10 ticks
      const blinkPhase = Math.floor((this.blinkTimer / GAME_CONFIG.PLAYER_BLINK_INTERVAL_TICKS) % 2);
      this.sprite.alpha = blinkPhase === 0 ? 0.5 : 1;
      
      // End blink after duration
      if (this.blinkTimer >= this.blinkDuration) {
        this.isBlinking = false;
        this.sprite.alpha = 1;
      }
      
      // Decrement damageBlinkTicks in gameState for online sync (only in local mode)
      if (this.gameState && !window.__ONLINE_ENABLED__) {
        this.gameState.playerState.damageBlinkTicks = Math.max(0, damageBlinkTicks - delta);
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

    if (!skipLocalPositionIntegration) {
      this._tryMove(moveX, moveY, map, bombs, bombSystem);
    }

    if (vx === 0 && vy === 0 && !window.__ONLINE_ENABLED__) {
      this._stabilizeIdlePose();
    }
  }

  _stabilizeIdlePose() {
    // When idle, keep sprite on crisp pixel coordinates to avoid visual drift.
    this.sprite.x = Math.round(this.sprite.x);
    this.sprite.y = Math.round(this.sprite.y);

    // If already almost centered in a tile, snap fully to the tile center.
    const centeredTile = tileCenter(toTile(this.sprite.x, this.tileSize), toTile(this.sprite.y, this.tileSize), this.tileSize);
    if (Math.abs(this.sprite.x - centeredTile.x) < 1.1) {
      this.sprite.x = centeredTile.x;
    }
    if (Math.abs(this.sprite.y - centeredTile.y) < 1.1) {
      this.sprite.y = centeredTile.y;
    }

    // Snap instantâneo para posição alvo se estiver online e parado
    if (window.__ONLINE_ENABLED__ && this.gameState?.playerState?.localAuthorityTarget) {
      const target = this.gameState.playerState.localAuthorityTarget;
      const errX = target.x - this.sprite.x;
      const errY = target.y - this.sprite.y;
      if (Math.abs(errX) < 2 && Math.abs(errY) < 2) {
        this.sprite.x = target.x;
        this.sprite.y = target.y;
      }
    }
  }

  _tryMove(dx, dy, map, bombs, bombSystem = null) {
    // Apply snapping when changing direction perpendicular to current movement
    if (dx !== 0 && dy === 0) {
      // Moving horizontally - snap Y to tile center if close
      const centeredTileY = tileCenter(0, toTile(this.sprite.y, this.tileSize), this.tileSize).y;
      const distFromCenter = Math.abs(this.sprite.y - centeredTileY);
      if (distFromCenter < 4) { // Reduzido de 8 para 4
        this.sprite.y = centeredTileY;
      }
    }
    if (dy !== 0 && dx === 0) {
      // Moving vertically - snap X to tile center if close
      const centeredTileX = tileCenter(toTile(this.sprite.x, this.tileSize), 0, this.tileSize).x;
      const distFromCenter = Math.abs(this.sprite.x - centeredTileX);
      if (distFromCenter < 4) { // Reduzido de 8 para 4
        this.sprite.x = centeredTileX;
      }
    }

    // Axis-separated movement for smoother sliding along walls
    if (dx !== 0) {
      const nx = this.sprite.x + dx;
      if (!this._collidesAt(nx, this.sprite.y, map, bombs, bombSystem)) {
        this.sprite.x = nx;
      }
    }
    if (dy !== 0) {
      const ny = this.sprite.y + dy;
      if (!this._collidesAt(this.sprite.x, ny, map, bombs, bombSystem)) {
        this.sprite.y = ny;
      }
    }
  }

  _collidesAt(cx, cy, map, bombs, bombSystem = null) {
    // check collision box corners using collisionHalf
    const currentTiles = getCornerTileKeys(this.sprite.x, this.sprite.y, this.collisionHalf, this.tileSize);
    const corners = getCorners(cx, cy, this.collisionHalf);
    const bombByTile = new Map();

    for (const bomb of bombs) {
      bombByTile.set(tileKey(bomb.tx, bomb.ty), bomb);
    }

    for (const c of corners) {
      const tx = toTile(c.x, this.tileSize);
      const ty = toTile(c.y, this.tileSize);

      const tile = tileKey(tx, ty);

      if (this.hasCrossBlock && map.isDestructible(tx, ty)) {
        continue; // Allow movement through cross blocks
      } else if (this.hasCrossBomb && !map.isWall(tx, ty) && bombByTile.has(tile)) {
        continue; // Allow movement through cross bombs
      } else if (map.isBlocked(tx, ty)) return true;

      
      // if (map.isBlocked(tx, ty)) return true;

      const bomb = bombByTile.get(tile);
      if (bomb) {
        // Land mines are traversable
        if (bomb.isLandMine) {
          continue;
        }
        
        if (currentTiles.has(tile)) {
          continue;
        }
        
        // If player has kick bomb powerup, kick the bomb instead of blocking
        if (this.hasKickBomb && bombSystem && !bomb.isSliding) {
          const dx = Math.sign(cx - this.sprite.x);
          const dy = Math.sign(cy - this.sprite.y);
          
          // Only kick in cardinal directions
          if (Math.abs(dx) + Math.abs(dy) === 1) {
            bombSystem.kickBomb(bomb, dx, dy);
            // return false; // Allow movement through the bomb
          }
        }
        
        return true;
      }
    }
    return false;
  }

  _updateAnimation(vx, vy) {
    const playerTextures = this.textures[this.currentPlayerNumber];
    const playerMapping = this.mapping[this.currentPlayerNumber];

    if (!playerTextures || !playerMapping) return;

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

    const frames = (playerMapping[anim] || []).map(i => playerTextures[i]).filter(Boolean);
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

