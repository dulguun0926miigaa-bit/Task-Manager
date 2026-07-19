import { prisma } from '../lib/prisma.js';
import { emitToUser } from './socketService.js';

const getMutualContext = async (userId, currentUserId) => {
  const [workspaceMemberships, projectMemberships, currentWorkspaceMemberships, currentProjectMemberships] = await Promise.all([
    prisma.membership.findMany({ where: { userId }, select: { groupId: true } }),
    prisma.projectMembership.findMany({ where: { userId }, select: { projectId: true } }),
    prisma.membership.findMany({ where: { userId: currentUserId }, select: { groupId: true } }),
    prisma.projectMembership.findMany({ where: { userId: currentUserId }, select: { projectId: true } }),
  ]);

  const mutualWorkspaces = await prisma.group.findMany({
    where: {
      id: { in: workspaceMemberships.map((item) => item.groupId).filter((groupId) => currentWorkspaceMemberships.some((item) => item.groupId === groupId)) },
    },
    select: { id: true, name: true },
  });

  const mutualProjects = await prisma.project.findMany({
    where: {
      id: { in: projectMemberships.map((item) => item.projectId).filter((projectId) => currentProjectMemberships.some((item) => item.projectId === projectId)) },
    },
    select: { id: true, name: true, workspaceId: true },
  });

  return { mutualWorkspaces, mutualProjects };
};

export const buildDiscoverPeopleSuggestions = async (userId) => {
  const [friends, pendingRequests, allUsers] = await Promise.all([
    prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    }),
    prisma.friendRequest.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { senderId: true, receiverId: true, status: true },
    }),
    prisma.user.findMany({
      where: { id: { not: userId } },
      select: { id: true, username: true, email: true, avatar: true, bio: true, createdAt: true },
    }),
  ]);

  const connectedIds = new Set(friends.flatMap((entry) => [entry.userAId, entry.userBId]).filter((id) => id !== userId));
  const pendingIds = new Set(
    pendingRequests
      .filter((entry) => entry.status === 'PENDING')
      .flatMap((entry) => [entry.senderId, entry.receiverId])
      .filter((id) => id !== userId)
  );

  const candidates = await Promise.all(
    allUsers
      .filter((user) => !connectedIds.has(user.id) && !pendingIds.has(user.id))
      .map(async (user) => {
        const context = await getMutualContext(user.id, userId);
        return {
          ...user,
          fullName: user.bio || user.username,
          status: 'Offline',
          mutualWorkspaces: context.mutualWorkspaces,
          mutualProjects: context.mutualProjects,
        };
      })
  );

  return candidates.slice(0, 20);
};

export const persistDiscoverPeopleSuggestions = async (userId) => {
  const suggestions = await buildDiscoverPeopleSuggestions(userId);

  await prisma.connectionSuggestion.deleteMany({ where: { userId } });

  await prisma.connectionSuggestion.createMany({
    data: suggestions.map((item) => ({
      userId,
      suggestedUserId: item.id,
      reason: item.mutualWorkspaces.length || item.mutualProjects.length ? 'Mutual workspace/project overlap' : 'New connection',
      mutualWorkspaceCount: item.mutualWorkspaces.length,
      mutualProjectCount: item.mutualProjects.length,
    })),
  });

  return suggestions;
};

export const sendConnectionRequest = async ({ senderId, receiverId }) => {
  const existingFriendship = await prisma.friendship.findFirst({ where: { OR: [{ userAId: senderId, userBId: receiverId }, { userAId: receiverId, userBId: senderId }] } });
  if (existingFriendship) {
    throw new Error('Users are already friends');
  }

  const existingRequest = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    },
  });

  if (existingRequest) {
    throw new Error('A pending or previous request already exists');
  }

  const request = await prisma.friendRequest.create({
    data: { senderId, receiverId, status: 'PENDING' },
    include: { sender: { select: { id: true, username: true, avatar: true } } },
  });

  await prisma.notification.create({
    data: {
      userId: receiverId,
      type: 'FRIEND_REQUEST',
      title: 'New friend request',
      message: `${request.sender.username} sent you a friend request`,
      actorId: senderId,
    },
  });

  emitToUser(receiverId, 'friend-request', { request });
  emitToUser(receiverId, 'notification:new', { title: 'New friend request', message: `${request.sender.username} sent you a friend request` });

  return request;
};

export const respondToConnectionRequest = async ({ requestId, responderId, action }) => {
  const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
  if (!request || request.receiverId !== responderId) {
    throw new Error('Request not found');
  }

  if (action === 'accept') {
    await prisma.$transaction([
      prisma.friendRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } }),
      prisma.friendship.create({ data: { userAId: responderId, userBId: request.senderId } }),
    ]);

    await prisma.notification.create({
      data: {
        userId: request.senderId,
        type: 'FRIEND_ACCEPTED',
        title: 'Friend request accepted',
        message: `${request.receiverId} accepted your friend request`,
        actorId: responderId,
      },
    });

    emitToUser(request.senderId, 'friend-accepted', { message: 'accepted' });
    emitToUser(request.senderId, 'notification:new', { title: 'Friend request accepted', message: `${request.receiverId} accepted your friend request` });
    return { message: 'Request accepted' };
  }

  await prisma.friendRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
  return { message: 'Request rejected' };
};
