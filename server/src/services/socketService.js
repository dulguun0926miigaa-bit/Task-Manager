import { Server } from 'socket.io';
import { prisma } from '../lib/prisma.js';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => socket.join(roomId));
    socket.on('leave-room', (roomId) => socket.leave(roomId));
    socket.on('send-notification', async ({ userId, type, title, message, metadata }) => {
      await prisma.notification.create({ data: { userId, type, title, message, metadata } });
      io.to(`user:${userId}`).emit('notification', { type, title, message, metadata });
    });
    socket.on('task-created', ({ roomId, task }) => io.to(roomId).emit('task-created', task));
    socket.on('task-updated', ({ roomId, task }) => io.to(roomId).emit('task-updated', task));
    socket.on('task-assigned', ({ roomId, task }) => io.to(roomId).emit('task-assigned', task));
    socket.on('message-sent', ({ roomId, message }) => io.to(roomId).emit('message-sent', message));
    socket.on('friend-request', ({ userId, payload }) => io.to(`user:${userId}`).emit('friend-request', payload));
    socket.on('friend-accepted', ({ userId, payload }) => io.to(`user:${userId}`).emit('friend-accepted', payload));
    socket.on('typing', ({ roomId, user }) => io.to(roomId).emit('typing', user));
  });
};

export const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};
