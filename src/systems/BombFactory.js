import { GAME_CONFIG } from '../config/Constants.js';
import { isSpriteOnTile } from '../utils/tileUtils.js';

export class BombFactory {
  static createBomb({ tx, ty, player, enemies, tileSize, bombFuseTicks, createBombSprite, findNearestEnemy }) {
    const willBeLandMine = player.hasLandMine;
    const willBeFollower = !willBeLandMine && player.hasFollowerBomb;

    const bomb = {
      tx,
      ty,
      timer: bombFuseTicks,
      sprite: createBombSprite(tx, ty, willBeFollower, willBeLandMine),
      soundPlayed: false,
      isSliding: false,
      slideDx: 0,
      slideDy: 0,
      slideSpeed: GAME_CONFIG.BOMB_SLIDE_SPEED || 4,
      slideProgress: 0,
      nextTx: tx,
      nextTy: ty,
      canMove: false,
      isThrowing: false,
      throwDx: 0,
      throwDy: 0,
      throwProgress: 0,
      throwStartTx: tx,
      throwStartTy: ty,
      throwTargetTx: tx,
      throwTargetTy: ty,
      throwDistance: 2,
      throwSpeed: 4,
      isFollower: false,
      targetEnemy: null,
      followSpeed: GAME_CONFIG.BOMB_FOLLOW_SPEED || 2,
      isLandMine: false,
      isTriggered: false,
      triggerTimer: GAME_CONFIG.LAND_MINE_TRIGGER_TICKS,
      blinkTimer: 0,
      playerTileOnPlacement: null,
    };

    if (willBeLandMine) {
      bomb.isLandMine = true;
      bomb.timer = Infinity;

      if (isSpriteOnTile(player.sprite, tx, ty, tileSize)) {
        bomb.playerTileOnPlacement = true;
      }
    } else if (willBeFollower) {
      bomb.isFollower = true;
      bomb.targetEnemy = findNearestEnemy(tx, ty, enemies);
    }

    return bomb;
  }
}
