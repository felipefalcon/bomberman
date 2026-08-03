export class HudTimerSync {
  constructor(components) {
    this.components = components;
  }

  refresh() {
    this.components.managers.hud?.setTimer(this.components.managers.gameState.getTimeRemaining());
  }
}
