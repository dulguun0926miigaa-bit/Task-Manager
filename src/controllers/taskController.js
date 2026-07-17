import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../services/socketService.js';

const getUserWorkspaceIds = async (userId) => {
  const memberships = await prisma.membership.findMany({ where: { userId }, select: { groupId: true } });
  return memberships.map((membership) => membership.groupId);
};

const userHasTaskAccess = async (taskId, userId) => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { groupId: true, projectId: true, createdById: true },
  });
  if (!task) return false;
  if (task.createdById === userId) return true;
  if (task.groupId) {
    const membership = await prisma.membership.findFirst({ where: { groupId: task.groupId, userId } });
    if (membership) return true;
  }
  if (task.projectId) {
    const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { workspaceId: true } });
    if (project) {
      const membership = await prisma.membership.findFirst({ where: { groupId: project.workspaceId, userId } });
      if (membership) return true;
    }
  }
  return false;
};

const buildTaskFilters = async (req) => {
  const workspaceIds = await getUserWorkspaceIds(req.user.id);
  const { workspaceId, projectId, groupId, status, priority, assignedTo, issueTypeId, query, archived, label } = req.query;
  const filters = [];

  if (workspaceId) {
    filters.push({
      OR: [
        { groupId: workspaceId },
        { project: { workspaceId } },
      ],
    });
  }
  if (projectId) filters.push({ projectId });
  if (groupId) filters.push({ groupId });
  if (status) filters.push({ status });
  if (priority) filters.push({ priority });
  if (issueTypeId) filters.push({ issueTypeId });
  if (archived === 'true' || archived === 'false') filters.push({ isArchived: archived === 'true' });
  if (query) {
    filters.push({
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    });
  }
  if (label) {
    filters.push({ labels: { some: { name: { contains: label, mode: 'insensitive' } } } });
  }
  if (assignedTo) {
    filters.push({ assignments: { some: { userId: assignedTo } } });
  }

  const accessFilters = [
    { groupId: { in: workspaceIds } },
    { project: { workspaceId: { in: workspaceIds } } },
    { createdById: req.user.id },
  ];

  return { AND: [...filters, { OR: accessFilters }] };
};

const parseNumeric = (value) => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null;
};

const createCustomFieldValues = async (taskId, customFieldValues, projectId) => {
  if (!Array.isArray(customFieldValues) || customFieldValues.length === 0) return;

  for (const fieldValue of customFieldValues) {
    const { customFieldId, value } = fieldValue || {};
    if (!customFieldId || value == null) continue;

    const customField = await prisma.customField.findUnique({ where: { id: customFieldId }, select: { projectId: true } });
    if (!customField) continue;
    if (projectId && customField.projectId !== projectId) continue;

    await prisma.customFieldValue.upsert({
      where: { customFieldId_taskId: { customFieldId, taskId } },
      create: { customFieldId, taskId, value: String(value) },
      update: { value: String(value) },
    });
  }
};

export const createTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      priority,
      status,
      dueDate,
      groupId,
      projectId,
      issueTypeId,
      parentId,
      privacy,
      type,
      assignedUserIds,
      labels,
      customFieldValues,
      estimateMinutes,
      timeSpentMinutes,
      storyPoints,
      resolution,
    } = req.body;

    const normalizedGroupId = groupId && String(groupId).trim() ? groupId : null;
    let normalizedProjectId = projectId && String(projectId).trim() ? projectId : null;
    const normalizedIssueTypeId = issueTypeId && String(issueTypeId).trim() ? issueTypeId : null;
    const normalizedParentId = parentId && String(parentId).trim() ? parentId : null;
    const normalizedType = type && String(type).trim() ? type : null;
    const normalizedDescription = description && String(description).trim() ? description : null;

    const existingUser = await prisma.user.findUnique({ where: { id: req.user?.id } });
    if (!existingUser) {
      return res.status(401).json({ message: 'Authenticated user not found' });
    }

    if (normalizedIssueTypeId) {
      const issueType = await prisma.issueType.findUnique({ where: { id: normalizedIssueTypeId } });
      if (!issueType) {
        return res.status(400).json({ message: 'Invalid issueTypeId' });
      }
      if (normalizedProjectId && issueType.projectId !== normalizedProjectId) {
        return res.status(400).json({ message: 'Issue type does not belong to the selected project' });
      }
      normalizedProjectId = normalizedProjectId || issueType.projectId;
    }

    if (normalizedParentId) {
      const parentTask = await prisma.task.findUnique({ where: { id: normalizedParentId } });
      if (!parentTask) {
        return res.status(400).json({ message: 'Invalid parentId' });
      }
      if (normalizedProjectId && parentTask.projectId !== normalizedProjectId) {
        return res.status(400).json({ message: 'Parent task must belong to the same project' });
      }
    }

    const validAssignedUserIds = Array.isArray(assignedUserIds)
      ? assignedUserIds.filter((userId) => typeof userId === 'string' && userId.trim())
      : [];

    const taskData = {
      title,
      description: normalizedDescription,
      priority: priority || 'MEDIUM',
      status: status || 'TODO',
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: existingUser.id,
      groupId: normalizedGroupId,
      projectId: normalizedProjectId,
      issueTypeId: normalizedIssueTypeId,
      parentId: normalizedParentId,
      privacy: privacy || 'PUBLIC',
      type: normalizedType,
      estimateMinutes: typeof estimateMinutes === 'number' ? estimateMinutes : null,
      timeSpentMinutes: typeof timeSpentMinutes === 'number' ? timeSpentMinutes : null,
      storyPoints: typeof storyPoints === 'number' ? storyPoints : null,
      resolution: resolution && String(resolution).trim() ? resolution : null,
    };

    const task = await prisma.task.create({
      data: taskData,
      include: {
        assignments: { include: { user: { select: { id: true, username: true } } } },
        createdBy: { select: { id: true, username: true } },
        issueType: { select: { id: true, name: true, key: true } },
        parent: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
      },
    });

    if (Array.isArray(labels) && labels.length) {
      const formattedLabels = labels
        .filter((item) => item && typeof item.name === 'string' && item.name.trim())
        .map((item) => ({
          name: String(item.name).trim(),
          color: item.color ? String(item.color).trim() : null,
          taskId: task.id,
          createdById: existingUser.id,
        }));
      if (formattedLabels.length) {
        await prisma.taskLabel.createMany({ data: formattedLabels });
      }
    }

    if (validAssignedUserIds.length) {
      await prisma.taskAssignment.createMany({
        data: validAssignedUserIds.map((userId) => ({ taskId: task.id, userId })),
        skipDuplicates: true,
      });

      for (const userId of validAssignedUserIds) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'TASK_ASSIGNED',
            title: 'New task assigned',
            message: `You were assigned to ${task.title}`,
          },
        });
        emitToUser(userId, 'task-assigned', { task });
        emitToUser(userId, 'notification', { title: 'New task assigned', message: `You were assigned to ${task.title}` });
      }
    }

    await createCustomFieldValues(task.id, customFieldValues, normalizedProjectId);

    if (Array.isArray(req.body.timeEntries) && req.body.timeEntries.length) {
      for (const entry of req.body.timeEntries) {
        if (!entry || typeof entry.minutes !== 'number' || entry.minutes <= 0) continue;
        await prisma.timeEntry.create({
          data: {
            taskId: task.id,
            userId: existingUser.id,
            minutes: entry.minutes,
            description: entry.description ? String(entry.description).trim() : null,
            startedAt: entry.startedAt ? new Date(entry.startedAt) : new Date(),
          },
        });
        await prisma.task.update({ where: { id: task.id }, data: { timeSpentMinutes: { increment: entry.minutes } } });
      }
    }

    const fullTask = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        assignments: { include: { user: { select: { id: true, username: true } } } },
        createdBy: { select: { id: true, username: true } },
        issueType: { select: { id: true, name: true, key: true } },
        parent: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
        labels: true,
        timeEntries: true,
        customFieldValues: { include: { customField: true } },
      },
    });

    emitToUser(req.user.id, 'task-created', { task: fullTask });
    res.status(201).json({ task: fullTask });
  } catch (error) {
    next(error);
  }
};

export const getTasks = async (req, res, next) => {
  try {
    const where = await buildTaskFilters(req);
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignments: { include: { user: { select: { id: true, username: true } } } },
        createdBy: { select: { id: true, username: true } },
        issueType: { select: { id: true, name: true, key: true } },
        parent: { select: { id: true, title: true } },
        project: { select: { id: true, name: true, workspaceId: true } },
        labels: true,
        timeEntries: true,
        customFieldValues: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
};

export const getTaskById = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignments: { include: { user: { select: { id: true, username: true } } } },
        createdBy: { select: { id: true, username: true } },
        issueType: { select: { id: true, name: true, key: true } },
        parent: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
        labels: true,
        timeEntries: true,
        customFieldValues: { include: { customField: true } },
      },
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json({ task });
  } catch (error) {
    next(error);
  }
};

export const archiveTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const task = await prisma.task.update({ where: { id: taskId }, data: { isArchived: true, deletedAt: new Date() } });
    res.json({ task });
  } catch (error) {
    next(error);
  }
};

export const restoreTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const task = await prisma.task.update({ where: { id: taskId }, data: { isArchived: false, deletedAt: null } });
    res.json({ task });
  } catch (error) {
    next(error);
  }
};

export const listTaskLabels = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const labels = await prisma.taskLabel.findMany({ where: { taskId } });
    res.json({ labels });
  } catch (error) {
    next(error);
  }
};

export const createTaskLabel = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Label name is required' });
    }
    const label = await prisma.taskLabel.create({ data: { name, color, taskId, createdById: req.user.id } });
    res.status(201).json({ label });
  } catch (error) {
    next(error);
  }
};

export const deleteTaskLabel = async (req, res, next) => {
  try {
    const { id: taskId, labelId } = req.params;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    await prisma.taskLabel.deleteMany({ where: { id: labelId, taskId } });
    res.json({ message: 'Label removed' });
  } catch (error) {
    next(error);
  }
};

export const listTimeEntries = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const entries = await prisma.timeEntry.findMany({ where: { taskId }, include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' } });
    res.json({ timeEntries: entries });
  } catch (error) {
    next(error);
  }
};

export const createTimeEntry = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!(await userHasTaskAccess(taskId, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    const { minutes, description, startedAt } = req.body;
    if (typeof minutes !== 'number' || minutes <= 0) {
      return res.status(400).json({ message: 'Time entry minutes must be greater than 0' });
    }
    const entry = await prisma.timeEntry.create({ data: {
      taskId,
      userId: req.user.id,
      minutes,
      description: description ? String(description).trim() : null,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
    } });
    await prisma.task.update({ where: { id: taskId }, data: { timeSpentMinutes: { increment: minutes } } });
    res.status(201).json({ timeEntry: entry });
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const existingTask = await prisma.task.findUnique({ where: { id: taskId } });

    if (!existingTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const payload = {};
    const allowedFields = ['title', 'description', 'priority', 'status', 'dueDate', 'groupId', 'projectId', 'issueTypeId', 'parentId', 'privacy', 'type', 'estimateMinutes', 'storyPoints', 'resolution'];

    const normalizedGroupId = req.body.groupId && String(req.body.groupId).trim() ? req.body.groupId : null;
    const normalizedProjectId = req.body.projectId && String(req.body.projectId).trim() ? req.body.projectId : null;
    const normalizedIssueTypeId = req.body.issueTypeId && String(req.body.issueTypeId).trim() ? req.body.issueTypeId : null;
    const normalizedParentId = req.body.parentId && String(req.body.parentId).trim() ? req.body.parentId : null;

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === 'description') {
          payload.description = req.body.description && String(req.body.description).trim() ? req.body.description : null;
        } else if (field === 'groupId') {
          payload.groupId = normalizedGroupId;
        } else if (field === 'projectId') {
          payload.projectId = normalizedProjectId;
        } else if (field === 'issueTypeId') {
          payload.issueTypeId = normalizedIssueTypeId;
        } else if (field === 'parentId') {
          payload.parentId = normalizedParentId;
        } else if (field === 'type') {
          payload.type = req.body.type && String(req.body.type).trim() ? req.body.type : null;
        } else if (field === 'dueDate') {
          payload.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
        } else if (field === 'estimateMinutes' || field === 'storyPoints') {
          payload[field] = typeof req.body[field] === 'number' ? req.body[field] : null;
        } else {
          payload[field] = req.body[field];
        }
      }
    }

    if (payload.issueTypeId) {
      const issueType = await prisma.issueType.findUnique({ where: { id: payload.issueTypeId } });
      if (!issueType) {
        return res.status(400).json({ message: 'Invalid issueTypeId' });
      }
      if (payload.projectId && issueType.projectId !== payload.projectId) {
        return res.status(400).json({ message: 'Issue type does not belong to the selected project' });
      }
      if (!payload.projectId) {
        payload.projectId = issueType.projectId;
      }
    }

    if (payload.parentId) {
      if (payload.parentId === taskId) {
        return res.status(400).json({ message: 'Task cannot be parent of itself' });
      }
      const parentTask = await prisma.task.findUnique({ where: { id: payload.parentId } });
      if (!parentTask) {
        return res.status(400).json({ message: 'Invalid parentId' });
      }
      if (payload.projectId && parentTask.projectId !== payload.projectId) {
        return res.status(400).json({ message: 'Parent task must belong to the same project' });
      }
      if (!payload.projectId) {
        payload.projectId = parentTask.projectId;
      }
    }

    await prisma.task.update({ where: { id: taskId }, data: payload });

    if (Array.isArray(req.body.assignedUserIds)) {
      const validAssignedUserIds = req.body.assignedUserIds.filter((userId) => typeof userId === 'string' && userId.trim());
      await prisma.taskAssignment.deleteMany({ where: { taskId } });
      if (validAssignedUserIds.length) {
        await prisma.taskAssignment.createMany({
          data: validAssignedUserIds.map((userId) => ({ taskId, userId })),
          skipDuplicates: true,
        });
      }
    }

    if (Array.isArray(req.body.labels)) {
      await prisma.taskLabel.deleteMany({ where: { taskId } });
      const formattedLabels = req.body.labels
        .filter((item) => item && typeof item.name === 'string' && item.name.trim())
        .map((item) => ({ name: String(item.name).trim(), color: item.color ? String(item.color).trim() : null, taskId, createdById: req.user.id }));
      if (formattedLabels.length) {
        await prisma.taskLabel.createMany({ data: formattedLabels });
      }
    }

    if (Array.isArray(req.body.customFieldValues)) {
      await createCustomFieldValues(taskId, req.body.customFieldValues, payload.projectId || existingTask.projectId);
    }

    if (Array.isArray(req.body.timeEntries)) {
      for (const entry of req.body.timeEntries) {
        if (!entry || typeof entry.minutes !== 'number' || entry.minutes <= 0) continue;
        await prisma.timeEntry.create({
          data: {
            taskId,
            userId: req.user.id,
            minutes: entry.minutes,
            description: entry.description ? String(entry.description).trim() : null,
            startedAt: entry.startedAt ? new Date(entry.startedAt) : new Date(),
          },
        });
        await prisma.task.update({ where: { id: taskId }, data: { timeSpentMinutes: { increment: entry.minutes } } });
      }
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignments: { include: { user: { select: { id: true, username: true } } } },
        createdBy: { select: { id: true, username: true } },
        issueType: { select: { id: true, name: true, key: true } },
        parent: { select: { id: true, title: true } },
        labels: true,
        timeEntries: true,
        customFieldValues: { include: { customField: true } },
      },
    });

    emitToUser(req.user.id, 'task-updated', { task });
    res.json({ task });
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    if (!(await userHasTaskAccess(req.params.id, req.user.id))) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
};
