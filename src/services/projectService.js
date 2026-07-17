import { prisma } from '../lib/prisma.js';
import { emitToUser } from './socketService.js';

export const getWorkspaceMembership = async (workspaceId, userId) =>
  prisma.membership.findFirst({ where: { groupId: workspaceId, userId } });

export const getProjectMembership = async (projectId, userId) =>
  prisma.projectMembership.findFirst({ where: { projectId, userId } });

export const userHasProjectAccess = async (projectId, userId) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) return false;
  const membership = await getWorkspaceMembership(project.workspaceId, userId);
  return Boolean(membership);
};

export const canManageProjectMembers = async (projectId, userId) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) return false;

  const workspaceMembership = await getWorkspaceMembership(project.workspaceId, userId);
  if (workspaceMembership?.role === 'SUPER_ADMIN') return true;

  const projectMembership = await getProjectMembership(projectId, userId);
  return Boolean(projectMembership && ['OWNER', 'ADMIN'].includes(projectMembership.role));
};

export const createProjectNotification = async ({
  userId,
  type,
  title,
  message,
  projectId,
  chatRoomId,
  messageId,
  actorId,
  metadata,
}) => {
  if (!userId) return null;

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      projectId,
      chatRoomId,
      messageId,
      actorId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  emitToUser(userId, 'notification:new', {
    ...notification,
    metadata: metadata ? metadata : undefined,
  });

  return notification;
};

export const buildProjectMemberPayload = (membership, onlineUserIds = []) => ({
  id: membership.id,
  role: membership.role,
  joinedAt: membership.joinedAt,
  user: membership.user,
  isOnline: onlineUserIds.includes(membership.user.id),
});
