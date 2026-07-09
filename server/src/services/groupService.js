import { prisma } from '../lib/prisma.js';

export const groupService = {
  async createGroup(input, ownerId) {
    return prisma.group.create({
      data: {
        name: input.name,
        description: input.description,
        privacy: input.privacy || 'PUBLIC',
        ownerId,
        memberships: { create: [{ userId: ownerId, role: 'SUPER_ADMIN' }] },
      },
      include: { memberships: true, owner: { select: { id: true, username: true } } },
    });
  },

  async listGroups(userId) {
    return prisma.group.findMany({ where: { memberships: { some: { userId } } }, include: { owner: { select: { id: true, username: true } } } });
  },
};
