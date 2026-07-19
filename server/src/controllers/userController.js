import { prisma } from '../lib/prisma.js';

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

export const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, email: true, avatar: true, bio: true, createdAt: true, isAdmin: true },
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const term = req.query.q?.toString() || '';
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } },
          {
            OR: [
              { username: { contains: term } },
              { email: { contains: term } },
            ],
          },
        ],
      },
      select: { id: true, username: true, email: true, avatar: true, bio: true },
      take: 20,
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
};

export const discoverPeople = async (req, res, next) => {
  try {
    const [friends, pendingRequests, allUsers] = await Promise.all([
      prisma.friendship.findMany({
        where: { OR: [{ userAId: req.user.id }, { userBId: req.user.id }] },
        select: { userAId: true, userBId: true },
      }),
      prisma.friendRequest.findMany({
        where: { OR: [{ senderId: req.user.id }, { receiverId: req.user.id }] },
        select: { senderId: true, receiverId: true, status: true },
      }),
      prisma.user.findMany({
        where: { id: { not: req.user.id } },
        select: { id: true, username: true, email: true, avatar: true, bio: true, createdAt: true },
      }),
    ]);

    const connectedIds = new Set(
      friends.flatMap((entry) => [entry.userAId, entry.userBId]).filter((id) => id !== req.user.id)
    );

    const pendingIds = new Set(
      pendingRequests
        .filter((entry) => entry.status === 'PENDING')
        .flatMap((entry) => [entry.senderId, entry.receiverId])
        .filter((id) => id !== req.user.id)
    );

    const candidates = await Promise.all(
      allUsers
        .filter((user) => !connectedIds.has(user.id) && !pendingIds.has(user.id))
        .map(async (user) => {
          const context = await getMutualContext(user.id, req.user.id);
          return {
            ...user,
            fullName: user.bio || user.username,
            status: 'Offline',
            mutualWorkspaces: context.mutualWorkspaces,
            mutualProjects: context.mutualProjects,
          };
        })
    );

    res.json({ users: candidates.slice(0, 20) });
  } catch (error) {
    next(error);
  }
};
