import {
  BombActionHandler,
  BombLifecycleHandler,
  DestroyingBlockAnimator,
} from '../application/index.js';
import { RuntimeMetricsCollector } from '../infrastructure/index.js';

/**
 * GameLoop - Manages the main game update loop
 * Handles delta time, system updates, and game state updates
 */
export class GameLoop {
  constructor(gameComponents) {
    this.components = gameComponents;
    this.isRunning = false;
    this.ticker = null;
    this.rafId = null;
    this.lastFrameTime = null;
    this.boundUpdate = this.update.bind(this);
    this.bombActionHandler = new BombActionHandler(this.components);
    this.bombLifecycleHandler = new BombLifecycleHandler(this.components);
    this.destroyingBlockAnimator = new DestroyingBlockAnimator(this.components);
    this.runtimeMetrics = new RuntimeMetricsCollector(this.components, this.components.managers.gameState.eventBus);
  }

  /**
   * Start the game loop
   * @param {Object} app - PIXI Application instance
   */
  start(app) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.ticker = app.ticker;
    this.lastFrameTime = null;
    this._scheduleFrame();
  }

  /**
   * Stop the game loop
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _scheduleFrame() {
    if (!this.isRunning) return;
    if (this.rafId) return;

    this.rafId = requestAnimationFrame((timestamp) => {
      this.rafId = null;
      this._onFrame(timestamp);
    });
  }

  _onFrame(timestamp) {
    if (!this.isRunning) return;

    if (this.lastFrameTime == null) {
      this.lastFrameTime = timestamp;
    }

    const delta = Math.min(4, (timestamp - this.lastFrameTime) / 16.6667);
    this.lastFrameTime = timestamp;

    this.boundUpdate(delta);
    this._scheduleFrame();
  }

  /**
   * Main update loop - called every frame
   * @param {Object} delta - Time delta
   */
  update(delta) {
    try {
      const tickDelta = typeof delta === 'number' ? delta : delta?.deltaTime ?? 1;

      // Update game state (timer, etc.)
      this.components.managers.gameState.update(tickDelta);

      const inputManager = this.components.managers.input;
      const movementCommand = inputManager.getMovementCommand();
      const bombCommand = this.bombActionHandler.buildCommand();
      console.log('[gameLoop] tick', { tickDelta, keys: inputManager.keys, player: !!this.components.player });

      // Update player
      if (this.components.player) {
        const bombs = this.components.systems.bomb.getBombs();
        const onlineBridge = this.components.managers.onlineStateBridge;
        const snapshot = onlineBridge?.getSnapshot?.();
        const player = this.components.player;

        const shouldApplyRemoteSnapshot = Boolean(snapshot?.player && onlineBridge?.enabled && onlineBridge?.connected);

        if (shouldApplyRemoteSnapshot) {
          player.sprite.x = snapshot.player.x;
          player.sprite.y = snapshot.player.y;
        } else {
          player.update(tickDelta, inputManager.keys, this.components.map, bombs, this.components.systems.bomb);
        }

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
      
      // HUD timer is updated by GameState UI event emission.
      this.runtimeMetrics.observeFrame(tickDelta);

      if (this.components.managers.gameState?.eventBus) {
        this.components.managers.gameState.eventBus.emit('game:input_command', {
          movement: movementCommand,
          bomb: bombCommand,
        });
      }
    } catch (error) {
      console.error('[gameLoop] update failed', error);
    }
  }
}
