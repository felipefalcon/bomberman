import * as PIXI from 'pixi.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';

/**
 * HudManager - Unified HUD management for Top and Side panels
 * Combines functionality from TopHud and SidebarHud
 */
export class HudManager {
  constructor(stage, config, eventBus = globalEventBus) {
    this.stage = stage;
    this.config = config;
    this.eventBus = eventBus;
    
    this.topContainer = null;
    this.sidebarContainer = null;
    
    // Top HUD elements
    this.timerText = null;
    this.livesText = null;
    this.playerIconContainer = null;
    this.clockIconContainer = null;
    
    // Sidebar HUD elements
    this.powerupSlots = {};
    
    this.itemFrames = null;
    this.itemMapping = null;
    
    this.fontSize = 12;
    
    this.create();
    this.setupEventListeners();
  }

  /**
   * Create all HUD elements
   */
  create() {
    this.createTopHud();
    this.createSidebarHud();
  }

  /**
   * Create top HUD (lives and timer)
   */
  createTopHud() {
    const container = new PIXI.Container();
    container.x = this.config.sidebarWidth;
    this.stage.addChild(container);

    const width = this.config.mapCols * this.config.tileSize;
    const height = this.config.tileSize;

    // Frame
    const frame = new PIXI.Graphics();
    frame.rect(0, 0, width, height);
    frame.fill(0x203890);
    frame.rect(0, 0, width, height);
    frame.stroke({ color: 0x406000, width: 1 });
    frame.rect(1, 1, width - 2, height - 2);
    frame.stroke({ color: 0x58d800, width: 1 });
    container.addChild(frame);

    // Lives panel
    const livesPanel = this.createHudPanel(8, 5, 90, height - 6);
    container.addChild(livesPanel);

    this.playerIconContainer = new PIXI.Container();
    this.playerIconContainer.addChild(this.createPlayerIcon());
    livesPanel.addChild(this.playerIconContainer);

    this.livesText = new PIXI.BitmapText({
      text: '3',
      style: { fontFamily: 'HUDFont', fontSize: this.fontSize, fill: 0xffffff },
      roundPixels: true,
    });
    this.livesText.x = 26;
    this.livesText.y = 5;
    livesPanel.addChild(this.livesText);

    // Timer panel
    const timerPanel = this.createHudPanel((width / 2) - 40, 5, 82, height - 6);
    container.addChild(timerPanel);

    this.clockIconContainer = new PIXI.Container();
    this.clockIconContainer.addChild(this.createClockIcon());
    timerPanel.addChild(this.clockIconContainer);

    this.timerText = new PIXI.BitmapText({
      text: '3:20',
      style: { fontFamily: 'HUDFont', fontSize: this.fontSize, fill: 0xffffff },
      roundPixels: true,
    });
    this.timerText.x = 32;
    this.timerText.y = 5;
    timerPanel.addChild(this.timerText);

    this.topContainer = container;
  }

  /**
   * Create sidebar HUD (powerups)
   */
  createSidebarHud() {
    const container = new PIXI.Container();
    container.y = this.config.tileSize;
    this.stage.addChild(container);

    const height = this.config.mapRows * this.config.tileSize;
    
    // Background
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, this.config.sidebarWidth, height);
    container.addChild(bg);

    // Powerup slots
    const powerupRows = [
      { key: 'bomb', fallbackDraw: () => this.drawBombIcon(8, 9), withText: true },
      { key: 'range', fallbackDraw: () => this.drawRangeIcon(8, 9), withText: true },
      { key: 'speed', fallbackDraw: () => this.drawSpeedIcon(8, 9), withText: true },
      { key: 'pierce', fallbackDraw: () => this.drawPierceIcon(8, 9), withText: false },
      { key: 'shield', fallbackDraw: () => this.drawShieldIcon(8, 9), withText: false },
      { key: 'detonator', fallbackDraw: () => this.drawDetonatorIcon(8, 9), withText: false },
    ];

    powerupRows.forEach((row, index) => {
      const slot = this.createPowerupSlot(2, index * 28, row.key, row.fallbackDraw, row.withText);
      container.addChild(slot.container);
      this.powerupSlots[row.key] = slot;
    });

    this.sidebarContainer = container;
  }

  /**
   * Create a HUD panel
   */
  createHudPanel(x, y, width, height) {
    const panel = new PIXI.Container();
    panel.x = x;
    panel.y = y;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, width, height);
    bg.rect(0, 0, width, 3);
    panel.addChild(bg);

    return panel;
  }

  /**
   * Create a powerup slot
   */
  createPowerupSlot(x, y, key, fallbackDraw, withText) {
    const container = new PIXI.Container();
    container.x = x;
    container.y = y;
    container.alpha = 0.35;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, this.config.sidebarWidth, this.config.tileSize);
    bg.rect(0, 0, this.config.sidebarWidth, 3);
    container.addChild(bg);

    const iconContainer = new PIXI.Container();
    iconContainer.addChild(this.createPowerupIcon(key, fallbackDraw));
    container.addChild(iconContainer);

    let text = null;
    if (withText) {
      text = new PIXI.BitmapText({
        text: '0',
        style: { fontFamily: 'HUDFont', fontSize: 6, fill: 0xffffff },
        roundPixels: true,
      });
      text.x = 7;
      text.y = 19;
      container.addChild(text);
    }

    return { container, text, key, fallbackDraw, iconContainer };
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.eventBus.on(GameEvents.UI_UPDATE_LIVES, (data) => this.setLives(data.value));
    this.eventBus.on(GameEvents.UI_UPDATE_TIMER, (data) => this.setTimer(data.value));
    this.eventBus.on(GameEvents.UI_UPDATE_POWERUPS, (data) => this.updatePowerups(data.player));
  }

  /**
   * Set item assets
   */
  setItemIcons(itemFrames, itemMapping) {
    this.itemFrames = itemFrames;
    this.itemMapping = itemMapping;
    this.refreshIcons();
  }

  /**
   * Refresh all icons
   */
  refreshIcons() {
    // Refresh top HUD icons
    if (this.playerIconContainer) {
      this.playerIconContainer.removeChildren();
      this.playerIconContainer.addChild(this.createPlayerIcon());
    }

    if (this.clockIconContainer) {
      this.clockIconContainer.removeChildren();
      this.clockIconContainer.addChild(this.createClockIcon());
    }

    // Refresh powerup icons
    Object.values(this.powerupSlots).forEach((slot) => {
      if (!slot.iconContainer) return;
      slot.iconContainer.removeChildren();
      slot.iconContainer.addChild(this.createPowerupIcon(slot.key, slot.fallbackDraw));
    });
  }

  /**
   * Set lives display
   */
  setLives(value) {
    if (this.livesText) this.livesText.text = `${value}`;
  }

  /**
   * Set timer display
   */
  setTimer(timeRemaining) {
    if (!this.timerText) return;
    const t = Math.max(0, Math.ceil(timeRemaining));
    const mins = Math.floor(t / 60);
    const secs = t % 60;
    this.timerText.text = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Update powerup display from player state
   */
  updatePowerups(player) {
    if (!player) return;

    this.setPowerupSlotState('bomb', `${player.maxBombs}`, true);
    this.setPowerupSlotState('range', `${player.explosionRange}`, true);
    this.setPowerupSlotState('speed', `${player.speedPowerups}`, player.speedPowerups > 0);
    this.setPowerupSlotState('pierce', '', player.canPierceBlocks);
    this.setPowerupSlotState('shield', '', player.hasShield);
    this.setPowerupSlotState('detonator', '', player.hasDetonator);
  }

  /**
   * Set powerup slot state
   */
  setPowerupSlotState(key, value, isActive) {
    const slot = this.powerupSlots[key];
    if (!slot) return;

    slot.container.alpha = isActive ? 1 : 0.35;
    if (slot.text) slot.text.text = value;
  }

  // Icon creation methods
  createPlayerIcon() {
    const sprite = this.createItemIcon(19);
    if (sprite) return sprite;
    return this.drawFaceIcon(11, 13);
  }

  createClockIcon() {
    const sprite = this.createItemIcon(20);
    if (sprite) return sprite;
    return this.drawClockIcon(10, 13, 0xff7a22);
  }

  createPowerupIcon(key, fallbackDraw) {
    const texture = this.getPowerupTexture(key);
    if (texture) {
      const sprite = new PIXI.Sprite(texture);
      sprite.x = 1;
      sprite.y = 1;
      sprite.roundPixels = true;
      return sprite;
    }
    return fallbackDraw();
  }

  createItemIcon(frameIndex) {
    const texture = this.itemFrames?.[frameIndex];
    if (!texture) return null;

    const sprite = new PIXI.Sprite(texture);
    sprite.width = 24;
    sprite.height = 24;
    sprite.x = 0;
    sprite.y = 0;
    sprite.roundPixels = true;
    return sprite;
  }

  getPowerupTexture(key) {
    if (!this.itemFrames || !this.itemMapping) return null;
    const frameIndex = this.itemMapping[key];
    if (typeof frameIndex !== 'number') return null;
    return this.itemFrames[frameIndex] || null;
  }

  // Drawing methods for fallback icons
  drawClockIcon(cx, cy, bezelColor = 0xdddddd) {
    const g = new PIXI.Graphics();
    g.circle(cx, cy, 7);
    g.fill(bezelColor);
    g.circle(cx, cy, 7);
    g.stroke({ color: 0x703000, width: 1.5 });
    g.moveTo(cx, cy);
    g.lineTo(cx, cy - 4);
    g.stroke({ color: 0x222222, width: 1.5 });
    g.moveTo(cx, cy);
    g.lineTo(cx + 3, cy + 1);
    g.stroke({ color: 0x222222, width: 1.5 });
    g.circle(cx, cy, 1.5);
    g.fill(0x222222);
    return g;
  }

  drawFaceIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.circle(cx, cy, 6);
    g.fill(0xf6c15c);
    g.rect(cx - 6, cy - 7, 12, 4);
    g.fill(0xd84b1a);
    g.rect(cx - 3, cy - 1, 1.5, 1.5);
    g.rect(cx + 1.5, cy - 1, 1.5, 1.5);
    g.fill(0x1d1d1d);
    g.rect(cx - 2, cy + 2, 4, 1.5);
    g.fill(0xffffff);
    return g;
  }

  drawBombIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.circle(cx, cy, 6);
    g.fill(0x111111);
    g.circle(cx - 2, cy - 2, 2);
    g.fill(0x555555);
    g.moveTo(cx + 3, cy - 4);
    g.lineTo(cx + 6, cy - 7);
    g.stroke({ color: 0x886600, width: 2 });
    g.circle(cx + 6, cy - 7, 1.5);
    g.fill(0xffaa00);
    return g;
  }

  drawRangeIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.rect(cx - 5, cy - 5, 10, 10);
    g.fill(0xffc233);
    g.rect(cx - 3, cy - 3, 6, 6);
    g.fill(0xff6b1a);
    g.rect(cx - 1, cy - 8, 2, 3);
    g.rect(cx - 1, cy + 5, 2, 3);
    g.rect(cx - 8, cy - 1, 3, 2);
    g.rect(cx + 5, cy - 1, 3, 2);
    g.fill(0xfff2a0);
    return g;
  }

  drawPierceIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.moveTo(cx - 7, cy + 4);
    g.lineTo(cx + 2, cy - 5);
    g.stroke({ color: 0xc8c8c8, width: 2 });
    g.moveTo(cx + 2, cy - 5);
    g.lineTo(cx + 6, cy - 5);
    g.lineTo(cx + 6, cy - 1);
    g.stroke({ color: 0xffaa33, width: 2 });
    g.rect(cx - 8, cy + 3, 4, 4);
    g.fill(0x6d4a2a);
    return g;
  }

  drawShieldIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.moveTo(cx, cy - 7);
    g.lineTo(cx + 6, cy - 4);
    g.lineTo(cx + 5, cy + 3);
    g.lineTo(cx, cy + 7);
    g.lineTo(cx - 5, cy + 3);
    g.lineTo(cx - 6, cy - 4);
    g.lineTo(cx, cy - 7);
    g.fill(0x4fc3f7);
    g.moveTo(cx, cy - 4);
    g.lineTo(cx + 3, cy - 2);
    g.lineTo(cx + 2, cy + 2);
    g.lineTo(cx, cy + 4);
    g.lineTo(cx - 2, cy + 2);
    g.lineTo(cx - 3, cy - 2);
    g.lineTo(cx, cy - 4);
    g.fill(0xe8f7ff);
    return g;
  }

  drawSpeedIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.moveTo(cx - 2, cy - 8);
    g.lineTo(cx + 4, cy - 1);
    g.lineTo(cx + 1, cy - 1);
    g.lineTo(cx + 5, cy + 8);
    g.lineTo(cx - 3, cy + 1);
    g.lineTo(cx, cy + 1);
    g.lineTo(cx - 2, cy - 8);
    g.fill(0xffd84d);
    return g;
  }

  drawDetonatorIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.rect(cx - 6, cy - 4, 12, 8);
    g.fill(0xc7d0d8);
    g.rect(cx - 2, cy - 8, 4, 4);
    g.fill(0xe65a3a);
    g.moveTo(cx + 2, cy - 8);
    g.lineTo(cx + 6, cy - 12);
    g.stroke({ color: 0xf0c54e, width: 1.5 });
    return g;
  }

  /**
   * Called when manager is destroyed
   */
  destroy() {
    if (this.topContainer && this.topContainer.parent) {
      this.topContainer.parent.removeChild(this.topContainer);
    }
    if (this.sidebarContainer && this.sidebarContainer.parent) {
      this.sidebarContainer.parent.removeChild(this.sidebarContainer);
    }
    
    this.eventBus.off(GameEvents.UI_UPDATE_LIVES);
    this.eventBus.off(GameEvents.UI_UPDATE_TIMER);
    this.eventBus.off(GameEvents.UI_UPDATE_POWERUPS);
    
    this.topContainer = null;
    this.sidebarContainer = null;
  }
}
