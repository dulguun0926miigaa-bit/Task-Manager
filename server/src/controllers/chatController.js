import { prisma } from '../lib/prisma.js';
import { getProjectMembership, userHasProjectAccess, createProjectNotification } from '../services/projectService.js';
import { emitToRoom, emitToUser } from '../services/socketService.js';

const getProjectRoom = async (projectId) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, workspaceId: true, name: true } });
  if (!project) return null;

  let chatRoom = await prisma.chatRoom.findUnique({ where: { projectId } });
  if (!chatRoom) {
    chatRoom = await prisma.chatRoom.create({
      data: { projectId, name: `${project.name} Chat` },
    });
  }

  return { project, chatRoom };
};

const getMessagePayload = (message) => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
  updatedAt: message.updatedAt.toISOString(),
  editedAt: message.editedAt ? message.editedAt.toISOString() : null,
  deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
});

export const getProjectChatMessages = async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const { cursor, limit = 30 } = req.query;
    const room = await getProjectRoom(projectId);
    if (!room) return res.status(404).json({ message: 'Project not found' });

    const messages = await prisma.message.findMany({
      where: { chatRoomId: room.chatRoom.id, deletedAt: null },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, username: true } } } },
        reactions: { include: { user: { select: { id: true, username: true } } } },
        reads: { include: { user: { select: { id: true, username: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    res.json({ messages: messages.reverse().map(getMessagePayload) });
  } catch (error) {
    next(error);
  }
};

export const createProjectChatMessage = async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const { content, replyToId, imageUrl, fileUrl, fileName, fileType, fileSize } = req.body;
    const mentionMatches = (content || '').match(/@([a-zA-Z0-9_]+)/g) || [];
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    if (!content && !imageUrl && !fileUrl) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const room = await getProjectRoom(projectId);
    if (!room) return res.status(404).json({ message: 'Project not found' });

    const message = await prisma.message.create({
      data: {
        chatRoomId: room.chatRoom.id,
        senderId: req.user.id,
        content: content || null,
        imageUrl: imageUrl || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
        fileSize: fileSize ? Number(fileSize) : null,
        replyToId: replyToId || null,
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, username: true } } } },
        reactions: { include: { user: { select: { id: true, username: true } } } },
        reads: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    const memberIds = await prisma.projectMembership.findMany({ where: { projectId }, select: { userId: true } });
    for (const member of memberIds) {
      if (member.userId === req.user.id) continue;
      await createProjectNotification({
        userId: member.userId,
        type: 'message:new',
        title: 'New message',
        message: content || 'New file shared',
        projectId,
        chatRoomId: room.chatRoom.id,
        messageId: message.id,
        actorId: req.user.id,
        metadata: { username: req.user.username },
      });
    }

    for (const mention of mentionMatches) {
      const username = mention.slice(1);
      const user = await prisma.user.findUnique({ where: { username } });
      if (user) {
        await createProjectNotification({
          userId: user.id,
          type: 'mention',
          title: 'You were mentioned',
          message: `${req.user.username} mentioned you in ${room.project.name}`,
          projectId,
          chatRoomId: room.chatRoom.id,
          messageId: message.id,
          actorId: req.user.id,
          metadata: { username: req.user.username },
        });
      }
    }

    emitToRoom(`project:${projectId}`, 'message:send', getMessagePayload(message));
    emitToRoom(`project:${projectId}`, 'message:send', { type: 'message:new' });
    res.status(201).json({ message: getMessagePayload(message) });
  } catch (error) {
    next(error);
  }
};

export const updateProjectChatMessage = async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const messageId = req.params.messageId;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.senderId !== req.user.id) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: req.body.content, editedAt: new Date() },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, username: true } } } },
        reactions: { include: { user: { select: { id: true, username: true } } } },
        reads: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    emitToRoom(`project:${projectId}`, 'message:update', getMessagePayload(updated));
    res.json({ message: getMessagePayload(updated) });
  } catch (error) {
    next(error);
  }
};

export const deleteProjectChatMessage = async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const messageId = req.params.messageId;
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const membership = await getProjectMembership(projectId, req.user.id);
    if (!membership && message.senderId !== req.user.id) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    emitToRoom(`project:${projectId}`, 'message:delete', { id: messageId });
    res.json({ message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
};

export const markProjectChatMessageRead = async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const messageId = req.params.messageId;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    await prisma.messageRead.upsert({
      where: { messageId_userId: { messageId, userId: req.user.id } },
      update: { readAt: new Date() },
      create: { messageId, userId: req.user.id },
    });

    emitToRoom(`project:${projectId}`, 'message:read', { messageId, userId: req.user.id });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const addProjectChatReaction = async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const messageId = req.params.messageId;
    const { emoji } = req.body;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const reaction = await prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId: req.user.id, emoji } },
      update: {},
      create: { messageId, userId: req.user.id, emoji },
    });

    emitToRoom(`project:${projectId}`, 'message:reaction', { messageId, reaction });
    res.json({ reaction });
  } catch (error) {
    next(error);
  }
};
