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
    this.onRoomState = null;
    this.clientInputTick = 0;
    this.clientInputSeq = 0;
    this.lastSnapshotTick = null;
    this.lastAckedTick = 0;
    this.unackedInputs = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000; // 30s max
    this.rtt = 0;
    this.clockOffset = 0;
    this.lastPingTime = 0;
    this.pingInterval = 1000; // Ping a cada 1s
    this.pingTimer = null;
  }

  connect(roomId = 'room', playerId = null) {
    if (this.socket) return;

    this.enabled = true;
    this.roomId = String(roomId || 'room').trim();
    this.playerId = String(playerId || `player-${Math.random().toString(36).slice(2, 6)}`).trim();
    let isLocalServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    isLocalServer = true;

    const socketUrl = isLocalServer
      ? 'http://localhost:3001'
      : (import.meta.env.VITE_SOCKET_URL || 'https://bomberman-k61t.onrender.com').trim();

    this.socket = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: (attemptNumber) => {
        this.reconnectAttempts = attemptNumber;
        const delay = Math.min(1000 * Math.pow(2, attemptNumber), this.maxReconnectDelay);
        return delay + Math.random() * 500; // Add jitter
      },
      reconnectionDelayMax: this.maxReconnectDelay,
      timeout: 2000,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.socket.emit('join-room', { roomId: this.roomId, playerId: this.playerId });
    });

    this.socket.on('connect_error', () => {
      this.connected = false;
    });

    this.socket.on('room-state', (roomState) => {
      this.roomState = roomState;
      this.onRoomState?.(roomState);
    });

    this.socket.on('input-ack', (ack) => {
      if (ack.tick === this.clientInputTick) {
        this.lastAckedTick = ack.tick;
      }
    });

    this.socket.on('pong', (data) => {
      const now = Date.now();
      const roundTripTime = now - this.lastPingTime;
      this.rtt = roundTripTime;
      
      // Calcular offset do relógio
      const serverTime = data.serverTime;
      const oneWayDelay = roundTripTime / 2;
      this.clockOffset = serverTime + oneWayDelay - now;
    });

    this.socket.on('snapshot', (snapshot) => {
      this.lastSnapshot = snapshot;
      this.hasRemoteSnapshot = true;
      this.onSnapshot?.(snapshot);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
    });

    // Iniciar ping loop
    this._startPingLoop();
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
    this.clientInputTick += 1;
    this.clientInputSeq += 1;
    this.socket.emit('player-input', {
      roomId: this.roomId,
      input: {
        ...(input || {}),
        tick: this.clientInputTick,
        seq: this.clientInputSeq,
        sentAt: Date.now(),
        priority: 'high', // Marcar como alta prioridade
      },
    });
  }

  getSnapshot() {
    return this.enabled && this.connected && this.hasRemoteSnapshot ? this.lastSnapshot : null;
  }

  _startPingLoop() {
    this.pingTimer = setInterval(() => {
      if (!this.socket?.connected) return;
      
      const clientTime = Date.now();
      this.lastPingTime = clientTime;
      this.socket.emit('ping', { clientTime });
    }, this.pingInterval);
  }

  getServerTime() {
    return Date.now() + this.clockOffset;
  }
}
