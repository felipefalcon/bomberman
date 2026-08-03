import { GAME_CONFIG } from '../../config/Constants.js';

export class DestroyingBlockAnimator {
  constructor(components) {
    this.components = components;
  }

  update(delta) {
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

    if (toRemove.length === 0) return;
    const removed = new Set(toRemove);
    this.components.destroyingBlocks = this.components.destroyingBlocks.filter((block) => !removed.has(block));
  }
}
