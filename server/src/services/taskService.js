import { prisma } from '../lib/prisma.js';

export const taskService = {
  async createTask(input, userId) {
    return prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority || 'MEDIUM',
        status: input.status || 'TODO',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdById: userId,
        groupId: input.groupId,
        privacy: input.privacy || 'PUBLIC',
        type: input.type,
        assignments: input.assignedUserIds?.length ? { create: input.assignedUserIds.map((userId) => ({ userId })) } : undefined,
      },
      include: {
        assignments: { include: { user: { select: { id: true, username: true, avatar: true } } } },
        createdBy: { select: { id: true, username: true, avatar: true } },
      },
    });
  },

  async listTasks() {
    return prisma.task.findMany({
      include: {
        assignments: { include: { user: { select: { id: true, username: true, avatar: true } } } },
        createdBy: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
