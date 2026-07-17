import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';

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
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => socket.join(roomId));
    socket.on('leave-room', (roomId) => socket.leave(roomId));
    socket.on('authenticate', async ({ userId }) => {
      if (!userId) return;
      onlineUsers.set(userId, socket.id);
      socket.join(`user:${userId}`);
      socket.emit('presence:update', Array.from(onlineUsers.keys()));
      io.emit('user:online', { userId });
      syncOnlineUsers(io.engine?.app);
      broadcastPresence();
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
  });
};

export const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

export const emitToRoom = (roomId, event, payload) => {
  if (io) io.to(roomId).emit(event, payload);
};

export const getOnlineUserIds = () => Array.from(onlineUsers.keys());
