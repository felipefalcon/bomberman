import { io } from 'socket.io-client';

export class OnlineStateBridge {
  constructor(gameState, player, onSnapshot = null) {
    this.gameState = gameState;
    this.player = player;
    this.onSnapshot = onSnapshot;
    this.connected = false;
    this.lastSnapshot = null;
    this.enabled = false;
    this.socket = null;
    this.roomId = null;
    this.playerId = null;
    this.roomState = null;
    this.hasRemoteSnapshot = false;
  }

  connect(roomId = 'room', playerId = null) {
    if (this.socket?.connected) return;

    this.enabled = true;
    this.roomId = String(roomId || 'room').trim();
    this.playerId = String(playerId || `player-${Math.random().toString(36).slice(2, 6)}`).trim();

    this.socket = io('http://127.0.0.1:3001', {
      transports: ['websocket'],
      reconnection: false,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.socket.emit('join-room', { roomId: this.roomId, playerId: this.playerId });
    });

    this.socket.on('room-state', (roomState) => {
      this.roomState = roomState;
    });

    this.socket.on('snapshot', (snapshot) => {
      this.lastSnapshot = snapshot;
      this.hasRemoteSnapshot = true;
      this.onSnapshot?.(snapshot);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
    });

    this.socket.on('connect_error', () => {
      this.connected = false;
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.enabled = false;
  }

  applySnapshot(snapshot) {
    if (!snapshot) return;
    if (!snapshot.roomId && !snapshot.players?.some?.((player) => player.playerId !== this.playerId)) {
      return;
    }

    this.lastSnapshot = snapshot;
    this.hasRemoteSnapshot = true;
    if (this.onSnapshot) {
      this.onSnapshot(snapshot);
    }
  }

  enable(roomId = 'room', playerId = null) {
    this.enabled = true;
    this.connect(roomId, playerId);
  }

  sendInput(input = {}) {
    if (!this.socket?.connected || !this.roomId) return;
    this.socket.emit('player-input', {
      roomId: this.roomId,
      input,
    });
  }

  getSnapshot() {
    return this.enabled && this.connected && this.hasRemoteSnapshot ? this.lastSnapshot : null;
  }
}
