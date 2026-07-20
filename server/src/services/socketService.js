import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../utils/jwt.js';

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://task-manager-self-six-61.vercel.app',
  'https://task-manager-git-main-duk-ochir.vercel.app',
  'https://task-manager-4ackvtpa2-duk-ochir.vercel.app',
  'https://task-manager-jcd2rv42b-duk-ochir.vercel.app',
];

const allowedOrigins = Array.from(new Set([...
  defaultOrigins,
  env.clientUrl,
  ...env.allowedOrigins,
]));

let io;
const onlineUsers = new Map();

const syncOnlineUsers = (app) => {
  if (app?.locals) app.locals.onlineUsers = Array.from(onlineUsers.keys());
};

const broadcastPresence = () => {
  if (!io) return;
  const payload = Array.from(onlineUsers.keys());
  io.emit('presence:update', payload);
};

export const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
  });

  io.use((socket, next) => {
    try {
      const rawToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      if (!rawToken) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(rawToken);
      socket.data.userId = payload.id;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const authenticatedUserId = socket.data.userId;
    onlineUsers.set(authenticatedUserId, socket.id);
    socket.join(`user:${authenticatedUserId}`);
    io.emit('user:online', { userId: authenticatedUserId });
    syncOnlineUsers(io.engine?.app);
    broadcastPresence();

    socket.on('join-room', (roomId) => socket.join(roomId));
    socket.on('leave-room', (roomId) => socket.leave(roomId));
    socket.on('authenticate', async () => {
      const userId = socket.data.userId;
      socket.emit('presence:update', Array.from(onlineUsers.keys()));
    });
    socket.on('disconnect', () => {
      const userId = Array.from(onlineUsers.entries()).find(([, id]) => id === socket.id)?.[0];
      if (userId) {
        onlineUsers.delete(userId);
        io.emit('user:offline', { userId });
        syncOnlineUsers(io.engine?.app);
        broadcastPresence();
      }
    });
    socket.on('send-notification', async ({ userId, type, title, message, metadata }) => {
      await prisma.notification.create({ data: { userId, type, title, message, metadata: metadata ? JSON.stringify(metadata) : null } });
      io.to(`user:${userId}`).emit('notification', { type, title, message, metadata });
    });
    socket.on('task-created', ({ roomId, task }) => io.to(roomId).emit('task-created', task));
    socket.on('task-updated', ({ roomId, task }) => io.to(roomId).emit('task-updated', task));
    socket.on('task-assigned', ({ roomId, task }) => io.to(roomId).emit('task-assigned', task));
    socket.on('message-sent', ({ roomId, message }) => io.to(roomId).emit('message-sent', message));
    socket.on('friend-request', ({ userId, payload }) => io.to(`user:${userId}`).emit('friend-request', payload));
    socket.on('friend-accepted', ({ userId, payload }) => io.to(`user:${userId}`).emit('friend-accepted', payload));
    socket.on('typing', ({ roomId, user }) => io.to(roomId).emit('typing', user));
    socket.on('project:message', ({ roomId, message }) => io.to(roomId).emit('project:message', message));
    socket.on('project:typing', ({ roomId, payload }) => io.to(roomId).emit('project:typing', payload));
    socket.on('project:read', ({ roomId, payload }) => io.to(roomId).emit('project:read', payload));
    socket.on('chat:join', ({ roomId }) => { if (roomId) socket.join(roomId); });
    socket.on('chat:leave', ({ roomId }) => { if (roomId) socket.leave(roomId); });
    socket.on('chat:message', ({ roomId, message }) => io.to(roomId).emit('chat:message', message));
    socket.on('chat:update', ({ roomId, message }) => io.to(roomId).emit('chat:update', message));
    socket.on('chat:delete', ({ roomId, id }) => io.to(roomId).emit('chat:delete', { id }));
    socket.on('chat:typing:start', ({ roomId, payload }) => io.to(roomId).emit('chat:typing:start', payload));
    socket.on('chat:typing:stop', ({ roomId, payload }) => io.to(roomId).emit('chat:typing:stop', payload));
    socket.on('chat:reaction', ({ roomId, payload }) => io.to(roomId).emit('chat:reaction', payload));
    socket.on('chat:read', ({ roomId, payload }) => io.to(roomId).emit('chat:read', payload));
    socket.on('workspace:joined', ({ roomId, payload }) => io.to(roomId).emit('workspace:joined', payload));
    socket.on('workspace:left', ({ roomId, payload }) => io.to(roomId).emit('workspace:left', payload));
  });
};

export const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

export const emitToRoom = (roomId, event, payload) => {
  if (io) io.to(roomId).emit(event, payload);
};

export const getOnlineUserIds = () => Array.from(onlineUsers.keys());
