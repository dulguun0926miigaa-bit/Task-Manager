import { prisma } from '../lib/prisma.js';
import { emitToRoom, emitToUser, getOnlineUserIds } from '../services/socketService.js';

const normalizePayload = (message) => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
  updatedAt: message.updatedAt.toISOString(),
  editedAt: message.editedAt ? message.editedAt.toISOString() : null,
  deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
  pinnedAt: message.pinnedAt ? message.pinnedAt.toISOString() : null,
});

const ensureChatRoom = async ({ workspaceId, projectId, name, type }) => {
  let room = await prisma.chatRoom.findFirst({
    where: type === 'WORKSPACE' ? { workspaceId } : { projectId },
  });

  if (!room) {
    room = await prisma.chatRoom.create({
      data: {
        type,
        workspaceId: type === 'WORKSPACE' ? workspaceId : null,
        projectId: type === 'PROJECT' ? projectId : null,
        name,
      },
    });
  }

  return room;
};

const ensureChatMember = async (chatRoomId, userId) => {
  await prisma.chatMember.upsert({
    where: { chatRoomId_userId: { chatRoomId, userId } },
    update: {},
    create: { chatRoomId, userId, role: 'MEMBER' },
  });
};

const userCanAccessRoom = async (chatRoomId, userId) => {
  const member = await prisma.chatMember.findFirst({ where: { chatRoomId, userId } });
  if (member) return true;

  const room = await prisma.chatRoom.findUnique({ where: { id: chatRoomId }, select: { workspaceId: true, projectId: true } });
  if (!room) return false;

  if (room.workspaceId) {
    return Boolean(await prisma.membership.findFirst({ where: { groupId: room.workspaceId, userId } }));
  }

  if (room.projectId) {
    return Boolean(await prisma.projectMembership.findFirst({ where: { projectId: room.projectId, userId } }));
  }

  return false;
};

export const joinChatRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) return res.status(404).json({ message: 'Chat room not found' });
    if (!(await userCanAccessRoom(roomId, req.user.id))) return res.status(403).json({ message: 'Unauthorized' });

    await ensureChatMember(roomId, req.user.id);
    await prisma.chatMember.updateMany({ where: { chatRoomId: roomId, userId: req.user.id }, data: { lastSeenAt: new Date() } });

    res.json({ room });
  } catch (error) {
    next(error);
  }
};

export const leaveChatRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    await prisma.chatMember.deleteMany({ where: { chatRoomId: roomId, userId: req.user.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const createChatMessage = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { content, replyToId, imageUrl, fileUrl, fileName, fileType, fileSize } = req.body;
    if (!(await userCanAccessRoom(roomId, req.user.id))) return res.status(403).json({ message: 'Unauthorized' });
    if (!content && !imageUrl && !fileUrl) return res.status(400).json({ message: 'Message content is required' });

    const message = await prisma.message.create({
      data: {
        chatRoomId: roomId,
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

    const mentionMatches = (content || '').match(/@([a-zA-Z0-9_]+)/g) || [];
    for (const mention of mentionMatches) {
      const username = mention.slice(1);
      const user = await prisma.user.findUnique({ where: { username } });
      if (user) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'mention',
            title: 'You were mentioned',
            message: `${req.user.username} mentioned you in chat`,
            metadata: JSON.stringify({ roomId }),
          },
        });
        emitToUser(user.id, 'notification:new', { title: 'You were mentioned', message: `${req.user.username} mentioned you in chat` });
      }
    }

    emitToRoom(roomId, 'chat:message', normalizePayload(message));
    res.status(201).json({ message: normalizePayload(message) });
  } catch (error) {
    next(error);
  }
};

export const updateChatMessage = async (req, res, next) => {
  try {
    const { roomId, messageId } = req.params;
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.senderId !== req.user.id) return res.status(403).json({ message: 'Unauthorized' });

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

    emitToRoom(roomId, 'chat:update', normalizePayload(updated));
    res.json({ message: normalizePayload(updated) });
  } catch (error) {
    next(error);
  }
};

export const deleteChatMessage = async (req, res, next) => {
  try {
    const { roomId, messageId } = req.params;
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || (message.senderId !== req.user.id && !(await userCanAccessRoom(roomId, req.user.id)))) return res.status(403).json({ message: 'Unauthorized' });

    await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    emitToRoom(roomId, 'chat:delete', { id: messageId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const getChatMessages = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!(await userCanAccessRoom(roomId, req.user.id))) return res.status(403).json({ message: 'Unauthorized' });

    const messages = await prisma.message.findMany({
      where: { chatRoomId: roomId, deletedAt: null },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { select: { id: true, content: true, sender: { select: { id: true, username: true } } } },
        reactions: { include: { user: { select: { id: true, username: true } } } },
        reads: { include: { user: { select: { id: true, username: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ messages: messages.map(normalizePayload) });
  } catch (error) {
    next(error);
  }
};

export const markChatRead = async (req, res, next) => {
  try {
    const { roomId, messageId } = req.params;
    if (!(await userCanAccessRoom(roomId, req.user.id))) return res.status(403).json({ message: 'Unauthorized' });

    await prisma.messageRead.upsert({
      where: { messageId_userId: { messageId, userId: req.user.id } },
      update: { readAt: new Date() },
      create: { messageId, userId: req.user.id },
    });

    emitToRoom(roomId, 'chat:read', { messageId, userId: req.user.id });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const reactToChatMessage = async (req, res, next) => {
  try {
    const { roomId, messageId } = req.params;
    const { emoji } = req.body;
    if (!(await userCanAccessRoom(roomId, req.user.id))) return res.status(403).json({ message: 'Unauthorized' });

    const reaction = await prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId: req.user.id, emoji } },
      update: {},
      create: { messageId, userId: req.user.id, emoji },
    });

    emitToRoom(roomId, 'chat:reaction', { messageId, reaction });
    res.json({ reaction });
  } catch (error) {
    next(error);
  }
};

export const typingChatMessage = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!(await userCanAccessRoom(roomId, req.user.id))) return res.status(403).json({ message: 'Unauthorized' });
    emitToRoom(roomId, 'chat:typing:start', { userId: req.user.id, username: req.user.username });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const stopTypingChatMessage = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!(await userCanAccessRoom(roomId, req.user.id))) return res.status(403).json({ message: 'Unauthorized' });
    emitToRoom(roomId, 'chat:typing:stop', { userId: req.user.id });
    res.json({ ok: true });
  } catch (error) { next(error); }
};

export const getChatRooms = async (req, res, next) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        OR: [
          { workspaceId: { not: null } },
          { projectId: { not: null } },
          { type: 'PRIVATE' },
        ],
        members: { some: { userId: req.user.id } },
      },
      include: { members: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ rooms });
  } catch (error) {
    next(error);
  }
};

export const createPrivateChatRoom = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ message: 'Invalid target user' });

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const existing = await prisma.chatRoom.findFirst({
      where: {
        type: 'PRIVATE',
        members: {
          some: { userId: req.user.id },
        },
        AND: [{ members: { some: { userId: targetUserId } } }],
      },
    });

    if (existing) {
      return res.json({ room: existing });
    }

    const room = await prisma.chatRoom.create({
      data: {
        type: 'PRIVATE',
        name: `${req.user.username} / ${targetUser.username}`,
      },
    });

    await Promise.all([
      ensureChatMember(room.id, req.user.id),
      ensureChatMember(room.id, targetUserId),
    ]);

    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
};

export const createWorkspaceChatRoom = async (req, res, next) => {
  try {
    const { workspaceId, name } = req.body;
    const membership = await prisma.membership.findFirst({ where: { groupId: workspaceId, userId: req.user.id } });
    if (!membership) return res.status(403).json({ message: 'Unauthorized' });

    const room = await ensureChatRoom({ workspaceId, name: name || 'Workspace Chat', type: 'WORKSPACE' });
    const members = await prisma.membership.findMany({ where: { groupId: workspaceId } });
    for (const member of members) {
      await ensureChatMember(room.id, member.userId);
    }

    emitToRoom(room.id, 'workspace:joined', { workspaceId });
    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
};

export const createProjectChatRoom = async (req, res, next) => {
  try {
    const { projectId, name } = req.body;
    const membership = await prisma.projectMembership.findFirst({ where: { projectId, userId: req.user.id } });
    if (!membership) return res.status(403).json({ message: 'Unauthorized' });

    const room = await ensureChatRoom({ projectId, name: name || 'Project Chat', type: 'PROJECT' });
    const members = await prisma.projectMembership.findMany({ where: { projectId } });
    for (const member of members) {
      await ensureChatMember(room.id, member.userId);
    }

    emitToRoom(room.id, 'workspace:joined', { projectId });
    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
};

export const getChatPresence = async (_req, res) => {
  res.json({ onlineUsers: getOnlineUserIds() });
};
