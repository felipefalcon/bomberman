import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.js';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const roomManager = new RoomManager(io);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT);
