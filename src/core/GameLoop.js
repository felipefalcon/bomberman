import {
  BombActionHandler,
  BombLifecycleHandler,
  DestroyingBlockAnimator,
  HudTimerSync,
} from '../application/index.js';

/**
 * GameLoop - Manages the main game update loop
 * Handles delta time, system updates, and game state updates
 */
export class GameLoop {
  constructor(gameComponents) {
    this.components = gameComponents;
    this.isRunning = false;
    this.ticker = null;
    this.bombActionHandler = new BombActionHandler(this.components);
    this.bombLifecycleHandler = new BombLifecycleHandler(this.components);
    this.destroyingBlockAnimator = new DestroyingBlockAnimator(this.components);
    this.hudTimerSync = new HudTimerSync(this.components);
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
      this.bombActionHandler.processInput();
    }
    
    // Update input manager after processing input (for next frame)
    this.components.managers.input.update();
    
    // Update systems
    this.components.systems.bomb.update(
      tickDelta,
      (bomb) => this.bombLifecycleHandler.onBombExplode(bomb),
      this.components.systems.monster.getMonsters(),
      this.components.player
    );
    this.components.systems.explosion.update(tickDelta, this.components.player, this.components.systems.monster.getMonsters(), this.components.systems.powerup.getPowerups());
    this.components.systems.powerup.update(tickDelta, this.components.player);
    this.components.systems.monster.update(tickDelta, this.components.player, this.components.systems.bomb.getBombs());
    
    // Block destruction animation
    this.destroyingBlockAnimator.update(tickDelta);
    
    // Update HUD timer
    this.hudTimerSync.refresh();
  }
}
