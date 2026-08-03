export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.initialize();
  }

  initialize() {
    this.io.on('connection', (socket) => {
      socket.on('create-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.getOrCreateRoom(safeRoomId);
        socket.join(safeRoomId);
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('join-room', ({ roomId, playerId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const safePlayerId = String(playerId || `player-${socket.id.slice(0, 4)}`).trim();
        const room = this.getOrCreateRoom(safeRoomId);

        if (room.players.size >= 4) {
          socket.emit('room-error', { message: 'Room is full' });
          return;
        }

        room.players.set(socket.id, { id: socket.id, playerId: safePlayerId, x: 48, y: 48 });
        socket.join(safeRoomId);
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('leave-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.rooms.get(safeRoomId);
        if (!room) return;

        room.players.delete(socket.id);
        socket.leave(safeRoomId);
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('player-input', ({ roomId, input }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.rooms.get(safeRoomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        const moveX = Number(input?.x || 0);
        const moveY = Number(input?.y || 0);

        if (moveX !== 0) {
          player.x = Math.max(48, Math.min(480, player.x + moveX * 2.6));
        }
        if (moveY !== 0) {
          player.y = Math.max(48, Math.min(320, player.y + moveY * 2.6));
        }

        this.io.to(safeRoomId).emit('snapshot', {
          roomId: safeRoomId,
          players: Array.from(room.players.values()),
        });
      });

      socket.on('disconnect', () => {
        for (const [roomId, room] of this.rooms.entries()) {
          if (room.players.delete(socket.id)) {
            this.broadcastRoomState(roomId);
          }
        }
      });
    });
  }

  broadcastRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.io.to(roomId).emit('room-state', {
      roomId,
      players: Array.from(room.players.values()),
      status: room.status,
    });
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { id: roomId, players: new Map(), status: 'waiting' });
    }

    return this.rooms.get(roomId);
  }
}
