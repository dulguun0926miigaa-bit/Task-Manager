import { prisma } from '../lib/prisma.js';
import { canManageProjectMembers, createProjectNotification, getWorkspaceMembership as getWorkspaceMembershipService, userHasProjectAccess as userHasProjectAccessService, buildProjectMemberPayload } from '../services/projectService.js';

const getWorkspaceMembership = async (workspaceId, userId) => getWorkspaceMembershipService(workspaceId, userId);

const userHasProjectAccess = async (projectId, userId) => userHasProjectAccessService(projectId, userId);

const addActivity = async ({ userId, projectId, entity, action, details }) => {
  if (!projectId) return;
  await prisma.activityLog.create({
    data: {
      userId,
      projectId,
      entity,
      action,
      details,
    },
  });
};

const safeParseSettings = (settings) => {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }
  return settings;
};

export const listProjects = async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'workspaceId is required' });
    }

    const membership = await getWorkspaceMembership(workspaceId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const projects = await prisma.project.findMany({
      where: { workspaceId },
      include: {
        memberships: { include: { user: { select: { id: true, username: true, email: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ projects });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req, res, next) => {
  try {
    const { workspaceId, name, key, icon, description, color, visibility, favorite, settings } = req.body;
    if (!workspaceId || !name || !key) {
      return res.status(400).json({ message: 'workspaceId, name, and key are required' });
    }

    const membership = await getWorkspaceMembership(workspaceId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const project = await prisma.project.create({
      data: {
        name,
        key,
        icon,
        description,
        color,
        visibility: visibility || 'PUBLIC',
        favorite: Boolean(favorite),
        settings: JSON.stringify(settings || { general: {}, permissions: {}, notifications: {}, automation: {}, workflows: {} }),
        workspaceId,
      },
      include: {
        memberships: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    const defaultIssueTypes = [
      { name: 'Bug', key: 'bug' },
      { name: 'Task', key: 'task' },
      { name: 'Story', key: 'story' },
      { name: 'Epic', key: 'epic' },
    ];

    await prisma.issueType.createMany({
      data: defaultIssueTypes.map((issueType) => ({ ...issueType, projectId: project.id })),
      skipDuplicates: true,
    });

    await prisma.projectMembership.create({
      data: {
        projectId: project.id,
        userId: req.user.id,
        role: 'OWNER',
      },
    });

    await prisma.chatRoom.create({
      data: {
        projectId: project.id,
        name: `${name} Chat`,
      },
    });

    await addActivity({ userId: req.user.id, projectId: project.id, entity: 'project', action: 'created', details: `Project ${name} was created` });
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
};

export const getProjectById = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: { select: { id: true, name: true, description: true, image: true, privacy: true, isArchived: true } },
        memberships: { include: { user: { select: { id: true, username: true, email: true } } } },
        components: true,
        versions: true,
        issueTypes: true,
        customFields: true,
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { id: true, username: true, email: true } } } },
      },
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ project: { ...project, settings: safeParseSettings(project.settings) } });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const payload = { ...req.body };
    if (typeof payload.settings === 'object') {
      payload.settings = JSON.stringify(payload.settings);
    }
    if (typeof payload.favorite !== 'undefined') {
      payload.favorite = Boolean(payload.favorite);
    }

    const project = await prisma.project.update({ where: { id: projectId }, data: payload });
    await addActivity({ userId: req.user.id, projectId: project.id, entity: 'project', action: 'updated', details: `Project ${project.name} settings were updated` });
    res.json({ project: { ...project, settings: safeParseSettings(project.settings) } });
  } catch (error) {
    next(error);
  }
};

export const archiveProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const project = await prisma.project.update({ where: { id: projectId }, data: { isArchived: true } });
    await addActivity({ userId: req.user.id, projectId: project.id, entity: 'project', action: 'archived', details: 'Project was archived' });
    res.json({ project });
  } catch (error) {
    next(error);
  }
};

export const restoreProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const project = await prisma.project.update({ where: { id: projectId }, data: { isArchived: false } });
    await addActivity({ userId: req.user.id, projectId: project.id, entity: 'project', action: 'restored', details: 'Project was restored' });
    res.json({ project });
  } catch (error) {
    next(error);
  }
};

export const toggleFavoriteProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { favorite: true } });
    const updated = await prisma.project.update({ where: { id: projectId }, data: { favorite: !project.favorite } });
    res.json({ project: updated });
  } catch (error) {
    next(error);
  }
};

export const addProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await canManageProjectMembers(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Only workspace owners and project admins can manage members' });
    }

    const { userId, role = 'MEMBER' } = req.body;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const workspaceMembership = await getWorkspaceMembership(project.workspaceId, userId);
    if (!workspaceMembership) {
      return res.status(400).json({ message: 'User must be a workspace member first' });
    }

    const existing = await prisma.projectMembership.findFirst({ where: { projectId, userId } });
    if (existing) {
      return res.status(409).json({ message: 'User already a member' });
    }

    const membership = await prisma.projectMembership.create({ data: { projectId, userId, role } });
    await addActivity({ userId: req.user.id, projectId, entity: 'project', action: 'member_added', details: `Member ${userId} was added` });
    await createProjectNotification({
      userId,
      type: 'project:added',
      title: 'Added to project',
      message: 'You were added to a project',
      projectId,
      actorId: req.user.id,
      metadata: { projectId },
    });
    res.status(201).json({ membership });
  } catch (error) {
    next(error);
  }
};

export const updateProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const membershipId = req.params.memberId;
    if (!(await canManageProjectMembers(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Only workspace owners and project admins can manage members' });
    }

    const { role } = req.body;
    const membership = await prisma.projectMembership.update({ where: { id: membershipId }, data: { role } });
    await addActivity({ userId: req.user.id, projectId, entity: 'project', action: 'member_updated', details: `Member role updated to ${role}` });
    res.json({ membership });
  } catch (error) {
    next(error);
  }
};

export const removeProjectMember = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const membershipId = req.params.memberId;
    if (!(await canManageProjectMembers(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Only workspace owners and project admins can manage members' });
    }

    const membership = await prisma.projectMembership.findUnique({ where: { id: membershipId } });
    if (!membership) return res.status(404).json({ message: 'Member not found' });

    await prisma.projectMembership.delete({ where: { id: membershipId } });
    await addActivity({ userId: req.user.id, projectId, entity: 'project', action: 'member_removed', details: `Member ${membership.userId} was removed` });
    await createProjectNotification({
      userId: membership.userId,
      type: 'project:removed',
      title: 'Removed from project',
      message: 'You were removed from a project',
      projectId,
      actorId: req.user.id,
      metadata: { projectId },
    });
    res.json({ message: 'Member removed' });
  } catch (error) {
    next(error);
  }
};

export const listProjectMembers = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const query = req.query.q?.toString() || '';
    const onlineUserIds = req.app.locals?.onlineUsers || [];
    const memberships = await prisma.projectMembership.findMany({
      where: {
        projectId,
        OR: query
          ? [
              { user: { username: { contains: query } } },
              { user: { email: { contains: query } } },
            ]
          : undefined,
      },
      include: { user: { select: { id: true, username: true, email: true, avatar: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    res.json({ memberships: memberships.map((membership) => buildProjectMemberPayload(membership, onlineUserIds)) });
  } catch (error) {
    next(error);
  }
};

export const listProjectComponents = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const components = await prisma.component.findMany({ where: { projectId } });
    res.json({ components });
  } catch (error) {
    next(error);
  }
};

export const addProjectComponent = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    const component = await prisma.component.create({ data: { name, projectId } });
    res.status(201).json({ component });
  } catch (error) {
    next(error);
  }
};

export const listProjectVersions = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const versions = await prisma.version.findMany({ where: { projectId } });
    res.json({ versions });
  } catch (error) {
    next(error);
  }
};

export const addProjectVersion = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    const version = await prisma.version.create({ data: { name, projectId } });
    res.status(201).json({ version });
  } catch (error) {
    next(error);
  }
};

export const listProjectIssueTypes = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const issueTypes = await prisma.issueType.findMany({ where: { projectId } });
    res.json({ issueTypes });
  } catch (error) {
    next(error);
  }
};

export const addProjectIssueType = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const { name, key } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const issueType = await prisma.issueType.create({
      data: {
        name,
        key: key && String(key).trim() ? String(key).trim().toLowerCase().replace(/\s+/g, '-') : String(name).trim().toLowerCase().replace(/\s+/g, '-'),
        projectId,
      },
    });
    res.status(201).json({ issueType });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ message: 'Issue type key must be unique within the project' });
    }
    next(error);
  }
};

export const listProjectCustomFields = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const customFields = await prisma.customField.findMany({ where: { projectId } });
    res.json({ customFields });
  } catch (error) {
    next(error);
  }
};

export const addProjectCustomField = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const { name, type } = req.body;
    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }
    const customField = await prisma.customField.create({ data: { name, type, projectId } });
    res.status(201).json({ customField });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!(await userHasProjectAccess(projectId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    await prisma.project.delete({ where: { id: projectId } });
    res.json({ message: 'Project deleted' });
  } catch (error) {
    next(error);
  }
};
