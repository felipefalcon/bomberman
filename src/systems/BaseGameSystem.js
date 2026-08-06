import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus } from '../engine/EventBus.js';

export class BaseGameSystem {
  constructor(eventBus = globalEventBus, map = null, gameContainer = null) {
    this.eventBus = eventBus;
    this.map = map;
    this.gameContainer = gameContainer;
    this.tileSize = GAME_CONFIG.TILE_SIZE;
  }

  setAssets(frames, mapping) {
    // Optional for subclasses
  }

  destroy() {
    this.map = null;
    this.gameContainer = null;
  }
}
