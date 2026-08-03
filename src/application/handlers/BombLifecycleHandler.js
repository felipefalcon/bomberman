import { GAME_CONFIG } from '../../config/Constants.js';

export class BombLifecycleHandler {
  constructor(components) {
    this.components = components;
  }

  onBombExplode(bomb) {
    if (this.components.player && this.components.player.activeBombs > 0) {
      this.components.player.activeBombs -= 1;
    }

    this.components.systems.explosion.processExplosionPropagation(
      bomb,
      this.components.player,
      (tx, ty) => this.destroyTileAt(tx, ty)
    );
  }

  destroyTileAt(tx, ty) {
    if (!this.components.map.isDestructible(tx, ty)) return;

    const block = this.components.map.destroyTile(tx, ty);
    if (block && block.sprite) {
      this.components.gameContainer.addChild(block.sprite);
      this.components.destroyingBlocks.push({
        sprite: block.sprite,
        timer: GAME_CONFIG.BLOCK_DESTRUCTION_DURATION,
        tx,
        ty,
      });
    }

    this.components.systems.powerup.trySpawnPowerup(tx, ty);
  }
}
