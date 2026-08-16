import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.js';

const rawFrontendOrigin = (process.env.FRONTEND_ORIGIN || '*').trim();
const frontendOrigin = rawFrontendOrigin === '*'
  ? '*'
  : rawFrontendOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: frontendOrigin,
    credentials: true,
  },
  pingTimeout: 120000, // 120 seconds - very tolerant
  pingInterval: 60000, // 60 seconds - less frequent heartbeat
  maxHttpBufferSize: 1e6, // 1MB - allow larger messages
});

const roomManager = new RoomManager(io);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT);
