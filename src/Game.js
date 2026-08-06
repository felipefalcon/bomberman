import * as PIXI from 'pixi.js';
import { GameInitializer } from './core/GameInitializer.js';
import { GameLoop } from './core/GameLoop.js';
import { GameEvents } from './engine/EventBus.js';
import { GAME_CONFIG } from './config/Constants.js';

/**
 * Game - Main game class
 * Orchestrates game initialization and loop using modular components
 */
export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    
    // Modular components
    this.initializer = null;
    this.gameLoop = null;
    
    // Game components (set by initializer)
    this.components = null;
    this.unsubscribers = [];
    this.onlineMatchFinished = false;
  }

  /**
   * Start the game
   */
  async start() {
    // Install HUD font
    PIXI.BitmapFont.install({
      name: 'HUDFont',
      chars: PIXI.BitmapFontManager.ASCII,
      resolution: window.devicePixelRatio || 1,
      padding: 8,
      textureStyle: { scaleMode: 'nearest' },
      style: {
        fontFamily: 'Silkscreen, monospace',
        fontSize: 8,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });

    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room') || 'room';
    const seed = this._buildSeed(roomId);
    const onlineEnabled = params.get('online') === '1' || params.get('online') === 'true';
    const playerId = params.get('player') || undefined;

    GAME_CONFIG.RNG_SEED = seed;
    window.__ROOM_SEED__ = seed;
    window.__ONLINE_ENABLED__ = onlineEnabled;

    // Initialize game components
    this.initializer = new GameInitializer(this.app);
    this.components = await this.initializer.initialize();
    
    // Initialize game loop
    this.gameLoop = new GameLoop(this.components);

    const onlineBridge = this.components.managers.onlineStateBridge;
    if (onlineBridge) {
      onlineBridge.onSnapshot = (snapshot) => {
        if (!snapshot || !window.__ONLINE_ENABLED__) return;
        this.components?.managers?.hud?.setRoomPlayers?.(snapshot.players || []);
        this.gameLoop?._renderRemotePlayers?.(snapshot.players || [], snapshot.tick);
        this.gameLoop?._syncOnlineWorld?.(snapshot, 1);
        this._handleOnlineMatchFinished(snapshot);
      };

      onlineBridge.onRoomState = (roomState) => {
        if (!roomState || !window.__ONLINE_ENABLED__) return;
        const gameState = this.components?.managers?.gameState;
        this.components?.managers?.hud?.setRoomPlayers?.(roomState.players || []);
        if (gameState?.setOnlineCountdown) {
          const seconds = Number(roomState?.countdownSeconds || 0);
          if (roomState?.status === 'countdown') {
            gameState.setOnlineCountdown(seconds);
          } else if (roomState?.status === 'playing' || roomState?.status === 'waiting' || roomState?.status === 'finished') {
            gameState.clearOnlineCountdown();
          }
        }
      };
    }

    if (onlineEnabled && onlineBridge) {
      onlineBridge.enable(roomId, playerId);
      onlineBridge.playerId = playerId || onlineBridge.playerId;
    }

    this.components.player?.setPlayerIdentity?.(onlineBridge?.playerId || playerId || 'player-1');

    onlineBridge?.applySnapshot?.({
      players: [
        {
          playerId: onlineBridge?.playerId || 'local',
          x: this.components.player.sprite.x,
          y: this.components.player.sprite.y,
        },
      ],
    });
    this.gameLoop.start(this.app);
    
    // Setup additional event listeners
    this._setupEventListeners();
    
    // Load audio assets
    await this._loadAudioAssets();
    
  }

  _buildSeed(roomId = 'room') {
    const normalized = String(roomId || 'room').trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  _normalizePlayerId(playerId) {
    const raw = String(playerId || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'p1' || raw === 'player1' || raw === '1') return 'player-1';
    if (raw === 'p2' || raw === 'player2' || raw === '2') return 'player-2';
    if (raw === 'p3' || raw === 'player3' || raw === '3') return 'player-3';
    if (raw === 'p4' || raw === 'player4' || raw === '4') return 'player-4';
    if (raw.startsWith('player-')) return raw;
    return raw;
  }

  _formatWinnerLabel(playerId) {
    const normalized = this._normalizePlayerId(playerId);
    if (!normalized) return 'Ninguem';
    if (normalized.startsWith('player-')) {
      return `P${normalized.split('-').pop()}`;
    }
    return normalized;
  }

  _handleOnlineMatchFinished(snapshot) {
    if (!window.__ONLINE_ENABLED__ || this.onlineMatchFinished) return;
    if (snapshot?.status !== 'finished') return;

    this.onlineMatchFinished = true;

    const onlineBridge = this.components?.managers?.onlineStateBridge;
    const localId = this._normalizePlayerId(onlineBridge?.playerId);
    const winnerId = this._normalizePlayerId(snapshot?.winnerPlayerId);
    const isWinner = !!winnerId && localId === winnerId;

    const gameState = this.components?.managers?.gameState;
    if (gameState) {
      gameState.isGameOver = true;
      gameState.isRunning = false;
      gameState.isPaused = true;
      gameState.isPreGameCountdownActive = false;
    }

    this.gameLoop?.stop?.();
    this.components?.managers?.input?.clear?.();
    this.components?.managers?.audio?.stop?.();
    this.components?.managers?.audio?.playSoundEffect?.('gameOver');

    const titleText = isWinner ? 'VITORIA!' : 'DERROTA';
    const subtitleText = isWinner
      ? 'Voce venceu a partida'
      : `Vencedor: ${this._formatWinnerLabel(winnerId)}`;

    const centerX = (this.components.tileSize * this.components.map.cols) / 2;
    const centerY = (this.components.tileSize * this.components.map.rows) / 2;

    const title = new PIXI.BitmapText({
      text: titleText,
      style: {
        fontFamily: 'HUDFont',
        fontSize: 16,
        fill: isWinner ? 0x6cff9c : 0xff5f5f,
      },
      anchor: 0.5,
      roundPixels: true,
    });
    title.x = centerX;
    title.y = centerY - 8;
    this.components.gameContainer.addChild(title);

    const subtitle = new PIXI.BitmapText({
      text: subtitleText,
      style: {
        fontFamily: 'HUDFont',
        fontSize: 8,
        fill: 0xffffff,
      },
      anchor: 0.5,
      roundPixels: true,
    });
    subtitle.x = centerX;
    subtitle.y = centerY + 10;
    this.components.gameContainer.addChild(subtitle);

    const reloadHint = new PIXI.BitmapText({
      text: 'Recarregue a pagina para nova partida',
      style: {
        fontFamily: 'HUDFont',
        fontSize: 7,
        fill: 0xfff2b8,
      },
      anchor: 0.5,
      roundPixels: true,
    });
    reloadHint.x = centerX;
    reloadHint.y = centerY + 26;
    this.components.gameContainer.addChild(reloadHint);
  }

  /**
   * Load audio assets
   */
  async _loadAudioAssets() {
    const audioManager = this.components.managers.audio;
    
    const musicPromise = audioManager.loadMusic(`${import.meta.env.BASE_URL}assets/18 Where it All Began.mp3`)
      .catch((err) => console.warn('Could not load background music. Error:', err));

    const explosionSoundPromise = audioManager.loadSoundEffect('explosion', `${import.meta.env.BASE_URL}assets/SB5 Sound Effects (12).wav`)
      .catch((err) => console.warn('Could not load explosion sound. Error:', err));

    const damageSoundPromise = audioManager.loadSoundEffect('damage', `${import.meta.env.BASE_URL}assets/SB5 Sound Effects (100).wav`)
      .catch((err) => console.warn('Could not load damage sound. Error:', err));

    const gameOverSoundPromise = audioManager.loadSoundEffect('gameOver', `${import.meta.env.BASE_URL}assets/10 Bad Luck.mp3`)
      .catch((err) => console.warn('Could not load game over sound. Error:', err));

    await Promise.all([musicPromise, explosionSoundPromise, damageSoundPromise, gameOverSoundPromise]);
  }

  /**
   * Setup additional event listeners
   */
  _setupEventListeners() {
    const gameState = this.components.managers.gameState;
    
    // Listen for damage events and apply to actual player
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'player' && this.components.player) {
        this.components.player.takeDamage();
        this._refreshHUD();
        if (this.components.player.lives <= 0) {
          this._handlePlayerDeath();
        }
      }
    }));
    
    // Listen for monster damage events
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'monster' && data.monster) {
        this.components.systems.monster.damageMonster(data.monster);
      }
    }));

    // Ensure powerups destroyed by explosion are removed from PowerupSystem state too
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'powerup' && data.powerup) {
        this.components.systems.powerup.removePowerup(data.powerup);
      }
    }));

    // Monster touch damage uses a separate event and must also sync to player entity
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.MONSTER_DAMAGE_PLAYER, () => {
      if (!this.components.player) return;
      this.components.player.takeDamage();
      this._refreshHUD();
      if (this.components.player.lives <= 0) {
        this._handlePlayerDeath();
      }
    }));
  }

  /**
   * Refresh HUD display
   */
  _refreshHUD() {
    if (!this.components.player) return;
    this.components.managers.hud?.setLives(this.components.player.lives);
    this.components.managers.hud?.updatePowerups(this.components.player);
  }

  /**
   * Handle player death
   */
  _handlePlayerDeath() {
    this.components.managers.audio.stop();
    this.components.managers.audio.playSoundEffect('gameOver');
    
    if (this.components.player) {
      this.components.player.sprite.tint = 0xff0000;
      this.components.managers.input.clear();
    }
    
    const gameOver = new PIXI.BitmapText({
      text: 'Game Over',
      style: {
        fontFamily: 'HUDFont',
        fontSize: 12,
        fill: 0xff0000,
      },
      anchor: 0.5,
      roundPixels: true,
    });
    gameOver.x = (this.components.tileSize * this.components.map.cols) / 2;
    gameOver.y = (this.components.tileSize * this.components.map.rows) / 2;
    this.components.gameContainer.addChild(gameOver);
    this.app.ticker.stop();
  }

  /**
   * Stop the game
   */
  stop() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    if (this.gameLoop) {
      this.gameLoop.stop();
    }

    this.initializer?.destroy?.();
  }
}

