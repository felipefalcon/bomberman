import { GAME_CONFIG } from '../config/Constants.js';

/**
 * GameLoop - Manages the main game update loop
 * Handles delta time, system updates, and game state updates
 */
export class GameLoop {
  constructor(gameComponents) {
    this.components = gameComponents;
    this.isRunning = false;
    this.ticker = null;
  }

  /**
   * Start the game loop
   * @param {Object} app - PIXI Application instance
   */
  start(app) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.ticker = app.ticker;
    this.ticker.add(this.update.bind(this));
  }

  /**
   * Stop the game loop
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.ticker) {
      this.ticker.remove(this.update.bind(this));
    }
  }

  /**
   * Main update loop - called every frame
   * @param {Object} delta - Time delta
   */
  update(delta) {
    const tickDelta = typeof delta === 'number' ? delta : delta?.deltaTime ?? 1;

    // Update game state (timer, etc.)
    this.components.managers.gameState.update(tickDelta);

    // Update player
    if (this.components.player) {
      const bombs = this.components.systems.bomb.getBombs();
      this.components.player.update(tickDelta, this.components.managers.input.keys, this.components.map, bombs, this.components.systems.bomb);
      this._processBombInput();
    }
    
    // Update input manager after processing input (for next frame)
    this.components.managers.input.update();
    
    // Update systems
    this.components.systems.bomb.update(tickDelta, (bomb) => this._explodeBomb(bomb), this.components.systems.monster.getMonsters(), this.components.player);
    this.components.systems.explosion.update(tickDelta, this.components.player, this.components.systems.monster.getMonsters(), this.components.systems.powerup.getPowerups());
    this.components.systems.powerup.update(tickDelta, this.components.player);
    this.components.systems.monster.update(tickDelta, this.components.player, this.components.systems.bomb.getBombs());
    
    // Block destruction animation
    this._updateDestroyingBlocks(tickDelta);
    
    // Update HUD timer
    this._refreshTimerText();
  }

  /**
   * Process bomb input from player
   */
  _processBombInput() {
    if (this.components.managers.input.isKeyPressed('z')) {
      this._handleBombAction();
    }
  }

  /**
   * Handle bomb action (place or throw)
   */
  _handleBombAction() {
    const tx = Math.floor(this.components.player.sprite.x / this.components.tileSize);
    const ty = Math.floor(this.components.player.sprite.y / this.components.tileSize);

    // Check if player has throw_bomb powerup and is standing on a bomb
    if (this.components.player.hasThrowBomb) {
      const bomb = this.components.systems.bomb.getBombAt(tx, ty);
      if (bomb) {
        // Throw the bomb in player's facing direction
        this._throwBomb(bomb);
        return;
      }
    }

    // Otherwise, place a new bomb
    this.components.systems.bomb.placeBomb(tx, ty, this.components.player, this.components.systems.monster.getMonsters());
  }

  /**
   * Throw a bomb in the player's facing direction
   * @param {Object} bomb - Bomb object
   */
  _throwBomb(bomb) {
    const facing = this.components.player._facing;
    let dx = 0, dy = 0;

    switch (facing) {
      case 'up':
        dy = -1;
        break;
      case 'down':
        dy = 1;
        break;
      case 'left':
        dx = -1;
        break;
      case 'right':
        dx = 1;
        break;
    }

    this.components.systems.bomb.throwBomb(bomb, dx, dy);
  }

  /**
   * Explode a bomb
   * @param {Object} bomb - Bomb object
   */
  _explodeBomb(bomb) {
    // Decrease active bomb count
    if (this.components.player && this.components.player.activeBombs > 0) {
      this.components.player.activeBombs -= 1;
    }

    // Use explosion system for propagation
    this.components.systems.explosion.processExplosionPropagation(bomb, this.components.player, (tx, ty) => this._destroyTileAt(tx, ty));
  }

  /**
   * Destroy a tile at the specified position
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   */
  _destroyTileAt(tx, ty) {
    if (!this.components.map.isDestructible(tx, ty)) return;

    const block = this.components.map.destroyTile(tx, ty);
    if (block && block.sprite) {
      // Add sprite to game container for destruction animation
      this.components.gameContainer.addChild(block.sprite);
      // Add destruction animation
      this.components.destroyingBlocks.push({
        sprite: block.sprite,
        timer: GAME_CONFIG.BLOCK_DESTRUCTION_DURATION,
        tx,
        ty,
      });
    }

    // Try to spawn powerup (even if no sprite for animation)
    this.components.systems.powerup.trySpawnPowerup(tx, ty);
  }

  /**
   * Update block destruction animations
   * @param {number} delta - Time delta
   */
  _updateDestroyingBlocks(delta) {
    const toRemove = [];
    
    for (const block of this.components.destroyingBlocks) {
      block.timer -= delta;
      if (block.sprite) {
        block.sprite.alpha = block.timer / GAME_CONFIG.BLOCK_DESTRUCTION_DURATION;
      }
      
      if (block.timer <= 0) {
        toRemove.push(block);
      }
    }
    
    for (const block of toRemove) {
      if (block.sprite) {
        this.components.gameContainer.removeChild(block.sprite);
      }
    }
    
    this.components.destroyingBlocks = this.components.destroyingBlocks.filter(b => !toRemove.includes(b));
  }

  /**
   * Refresh the timer display
   */
  _refreshTimerText() {
    this.components.managers.hud?.setTimer(this.components.managers.gameState.getTimeRemaining());
  }
}
