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
        this.io.to(safeRoomId).emit('room-state', {
          roomId: safeRoomId,
          players: Array.from(room.players.values()),
          status: room.status,
        });
      });

      socket.on('join-room', ({ roomId, playerId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const safePlayerId = String(playerId || `player-${socket.id.slice(0, 4)}`).trim();
        const room = this.getOrCreateRoom(safeRoomId);

        if (room.players.size >= 4) {
          socket.emit('room-error', { message: 'Room is full' });
          return;
        }

        room.players.set(socket.id, { id: socket.id, playerId: safePlayerId });
        socket.join(safeRoomId);

        this.io.to(safeRoomId).emit('room-state', {
          roomId: safeRoomId,
          players: Array.from(room.players.values()),
          status: room.status,
        });
      });

      socket.on('leave-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.rooms.get(safeRoomId);
        if (!room) return;

        room.players.delete(socket.id);
        socket.leave(safeRoomId);

        this.io.to(safeRoomId).emit('room-state', {
          roomId: safeRoomId,
          players: Array.from(room.players.values()),
          status: room.status,
        });
      });

      socket.on('disconnect', () => {
        for (const [roomId, room] of this.rooms.entries()) {
          if (room.players.delete(socket.id)) {
            this.io.to(roomId).emit('room-state', {
              roomId,
              players: Array.from(room.players.values()),
              status: room.status,
            });
          }
        }
      });
    });
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { id: roomId, players: new Map(), status: 'waiting' });
    }

    return this.rooms.get(roomId);
  }
}
