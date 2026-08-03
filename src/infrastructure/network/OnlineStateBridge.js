export class OnlineStateBridge {
  constructor(gameState, player, onSnapshot = null) {
    this.gameState = gameState;
    this.player = player;
    this.onSnapshot = onSnapshot;
    this.connected = false;
    this.lastSnapshot = null;
    this.enabled = false;
  }

  connect() {
    this.connected = false;
    this.enabled = false;
  }

  disconnect() {
    this.connected = false;
    this.enabled = false;
  }

  applySnapshot(snapshot) {
    if (!snapshot) return;

    this.lastSnapshot = snapshot;
    if (this.onSnapshot) {
      this.onSnapshot(snapshot);
    }
  }

  enable() {
    this.enabled = true;
    this.connected = true;
  }

  getSnapshot() {
    return this.enabled && this.connected ? this.lastSnapshot : null;
  }
}
