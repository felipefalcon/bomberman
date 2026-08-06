import { PowerupComponent } from './PowerupComponent.js';

/**
 * SpeedComponent - Increases player movement speed
 */
export class SpeedComponent extends PowerupComponent {
  apply(player, gameState) {
    player.speed *= 1.2; // 20% speed boost
    if (gameState) {
      gameState.playerState.speedPowerups += 1;
    }
  }

  remove(player, gameState) {
    if (gameState && gameState.playerState.speedPowerups > 0) {
      gameState.playerState.speedPowerups -= 1;
      player.speed /= 1.2;
    }
  }
}

/**
 * BombComponent - Increases max bomb count
 */
export class BombComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.maxBombs += 1;
    }
  }

  remove(player, gameState) {
    if (gameState && gameState.playerState.maxBombs > 1) {
      gameState.playerState.maxBombs -= 1;
    }
  }
}

/**
 * RangeComponent - Increases explosion range
 */
export class RangeComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.explosionRange += 1;
    }
  }

  remove(player, gameState) {
    if (gameState && gameState.playerState.explosionRange > 1) {
      gameState.playerState.explosionRange -= 1;
    }
  }
}

/**
 * PierceComponent - Allows explosions to pass through blocks
 */
export class PierceComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.canPierceBlocks = true;
    }
  }

  remove(player, gameState) {
    if (gameState) {
      gameState.playerState.canPierceBlocks = false;
    }
  }
}

/**
 * KickBombComponent - Allows kicking bombs
 */
export class KickBombComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.hasKickBomb = true;
    }
  }

  remove(player, gameState) {
    if (gameState) {
      gameState.playerState.hasKickBomb = false;
    }
  }
}

/**
 * ThrowBombComponent - Allows throwing bombs
 */
export class ThrowBombComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.hasThrowBomb = true;
    }
  }

  remove(player, gameState) {
    if (gameState) {
      gameState.playerState.hasThrowBomb = false;
    }
  }
}

/**
 * CrossBlockComponent - Allows crossing through blocks
 */
export class CrossBlockComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.hasCrossBlock = true;
    }
  }

  remove(player, gameState) {
    if (gameState) {
      gameState.playerState.hasCrossBlock = false;
    }
  }
}

/**
 * CrossBombComponent - Allows crossing over bombs
 */
export class CrossBombComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.hasCrossBomb = true;
    }
  }

  remove(player, gameState) {
    if (gameState) {
      gameState.playerState.hasCrossBomb = false;
    }
  }
}

/**
 * FollowerBombComponent - Bombs follow enemies
 */
export class FollowerBombComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.hasFollowerBomb = true;
      gameState.playerState.hasLandMine = false;
    }
  }

  remove(player, gameState) {
    if (gameState) {
      gameState.playerState.hasFollowerBomb = false;
    }
  }
}

/**
 * LandMineComponent - Bombs become landmines
 */
export class LandMineComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.hasLandMine = true;
      gameState.playerState.hasFollowerBomb = false;
    }
  }

  remove(player, gameState) {
    if (gameState) {
      gameState.playerState.hasLandMine = false;
    }
  }
}

/**
 * ExtraLifeComponent - Adds an extra life
 */
export class ExtraLifeComponent extends PowerupComponent {
  apply(player, gameState) {
    if (gameState) {
      gameState.playerState.lives += 1;
    }
  }

  remove(player, gameState) {
    if (gameState && gameState.playerState.lives > 1) {
      gameState.playerState.lives -= 1;
    }
  }
}
