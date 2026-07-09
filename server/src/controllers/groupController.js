import { prisma } from '../lib/prisma.js';

const getGroupMembership = async (groupId, userId) => prisma.membership.findFirst({ where: { groupId, userId } });

const addActivity = async ({ userId, groupId, entity, action, details }) => {
  if (!groupId) return;
  await prisma.activityLog.create({
    data: {
      userId,
      groupId,
      entity,
      action,
      details,
    },
  });
};

export const createGroup = async (req, res, next) => {
  try {
    const { name, description, privacy, image } = req.body;
    const group = await prisma.group.create({
      data: {
        name,
        description,
        image,
        privacy: privacy || 'PUBLIC',
        ownerId: req.user.id,
        settings: JSON.stringify({ theme: 'default' }),
        memberships: { create: [{ userId: req.user.id, role: 'SUPER_ADMIN' }] },
      },
      include: { memberships: true, owner: { select: { id: true, username: true } } },
    });

    await addActivity({ userId: req.user.id, groupId: group.id, entity: 'workspace', action: 'created', details: `Workspace ${name} was created` });
    res.status(201).json({ group });
  } catch (error) {
    next(error);
  }
};

export const getGroups = async (req, res, next) => {
  try {
    const groups = await prisma.group.findMany({
      where: { memberships: { some: { userId: req.user.id } } },
      include: {
        memberships: true,
        owner: { select: { id: true, username: true } },
        tasks: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ groups });
  } catch (error) {
    next(error);
  }
};

export const getGroupById = async (req, res, next) => {
  try {
    const group = await prisma.group.findFirst({
      where: { id: req.params.id, memberships: { some: { userId: req.user.id } } },
      include: {
        memberships: { include: { user: { select: { id: true, username: true, email: true, avatar: true } } } },
        owner: { select: { id: true, username: true, email: true, avatar: true } },
        tasks: true,
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { id: true, username: true, avatar: true } } } },
      },
    });
    if (!group) return res.status(404).json({ message: 'Workspace not found' });
    res.json({ group });
  } catch (error) {
    next(error);
  }
};

export const updateGroup = async (req, res, next) => {
  try {
    const membership = await getGroupMembership(req.params.id, req.user.id);
    if (!membership || !['SUPER_ADMIN', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const payload = { ...req.body };
    if (typeof payload.settings === 'object') {
      payload.settings = JSON.stringify(payload.settings);
    }

    const group = await prisma.group.update({ where: { id: req.params.id }, data: payload });
    await addActivity({ userId: req.user.id, groupId: group.id, entity: 'workspace', action: 'updated', details: 'Workspace settings were updated' });
    res.json({ group });
  } catch (error) {
    next(error);
  }
};

export const archiveGroup = async (req, res, next) => {
  try {
    const membership = await getGroupMembership(req.params.id, req.user.id);
    if (!membership || !['SUPER_ADMIN', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const group = await prisma.group.update({ where: { id: req.params.id }, data: { isArchived: true } });
    await addActivity({ userId: req.user.id, groupId: group.id, entity: 'workspace', action: 'archived', details: 'Workspace was archived' });
    res.json({ group, message: 'Workspace archived' });
  } catch (error) {
    next(error);
  }
};

export const restoreGroup = async (req, res, next) => {
  try {
    const membership = await getGroupMembership(req.params.id, req.user.id);
    if (!membership || !['SUPER_ADMIN', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const group = await prisma.group.update({ where: { id: req.params.id }, data: { isArchived: false } });
    await addActivity({ userId: req.user.id, groupId: group.id, entity: 'workspace', action: 'restored', details: 'Workspace was restored' });
    res.json({ group, message: 'Workspace restored' });
  } catch (error) {
    next(error);
  }
};

export const inviteToGroup = async (req, res, next) => {
  try {
    const membership = await getGroupMembership(req.params.id, req.user.id);
    if (!membership || !['SUPER_ADMIN', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingMembership = await prisma.membership.findFirst({ where: { groupId: req.params.id, userId: user.id } });
    if (existingMembership) {
      return res.status(409).json({ message: 'User already in workspace' });
    }

    const invitation = await prisma.invitation.create({
      data: { groupId: req.params.id, email, status: 'PENDING' },
    });

    await addActivity({ userId: req.user.id, groupId: req.params.id, entity: 'member', action: 'invited', details: `Invited ${user.username}` });
    res.status(201).json({ invitation });
  } catch (error) {
    next(error);
  }
};

export const addMemberToGroup = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const membership = await getGroupMembership(req.params.id, req.user.id);
    if (!membership || !['SUPER_ADMIN', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const existingMembership = await prisma.membership.findFirst({ where: { groupId: req.params.id, userId } });
    if (existingMembership) {
      return res.status(409).json({ message: 'User already in workspace' });
    }

    const newMembership = await prisma.membership.create({ data: { groupId: req.params.id, userId, role: 'MEMBER' } });
    await addActivity({ userId: req.user.id, groupId: req.params.id, entity: 'member', action: 'added', details: 'Added a new member' });
    res.status(201).json({ membership: newMembership });
  } catch (error) {
    next(error);
  }
};

export const deleteGroup = async (req, res, next) => {
  try {
    const membership = await getGroupMembership(req.params.id, req.user.id);
    if (!membership || membership.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only the owner can delete the workspace' });
    }

    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    await prisma.group.delete({ where: { id: req.params.id } });
    await addActivity({ userId: req.user.id, groupId: group?.id, entity: 'workspace', action: 'deleted', details: 'Workspace was deleted' });
    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    next(error);
  }
};
