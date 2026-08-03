import { spriteToTile } from '../../utils/tileUtils.js';

export class BombActionHandler {
  constructor(components) {
    this.components = components;
  }

  processInput() {
    const input = this.components.managers.input;
    if (input.isKeyPressed('z')) {
      this.handleBombAction();
    }
  }

  buildCommand() {
    const input = this.components.managers.input;
    if (!input.isKeyPressed('z')) {
      return null;
    }

    return { type: 'bomb', timestamp: Date.now() };
  }

  handleBombAction() {
    const playerTile = spriteToTile(this.components.player?.sprite, this.components.tileSize);
    if (!playerTile) return;

    if (this.components.player.hasThrowBomb) {
      const bomb = this.components.systems.bomb.getBombAt(playerTile.tx, playerTile.ty);
      if (bomb) {
        this.throwBomb(bomb);
        return;
      }
    }

    this.components.systems.bomb.placeBomb(
      playerTile.tx,
      playerTile.ty,
      this.components.player,
      this.components.systems.monster.getMonsters()
    );
  }

  throwBomb(bomb) {
    const facing = this.components.player._facing;
    let dx = 0;
    let dy = 0;

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
}
