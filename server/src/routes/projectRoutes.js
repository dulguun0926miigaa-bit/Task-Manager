import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  addProjectComponent,
  addProjectCustomField,
  addProjectMember,
  addProjectIssueType,
  addProjectVersion,
  archiveProject,
  removeProjectMember,
  createProject,
  deleteProject,
  getProjectById,
  listProjectComponents,
  listProjectCustomFields,
  listProjectIssueTypes,
  listProjectMembers,
  listProjectVersions,
  listProjects,
  restoreProject,
  toggleFavoriteProject,
  updateProject,
  updateProjectMember,
  respondToProjectInvitation,
} from '../controllers/projectController.js';

const router = Router();

router.get('/', authenticate, listProjects);
router.post('/', authenticate, createProject);
router.get('/:id', authenticate, getProjectById);
router.put('/:id', authenticate, updateProject);
router.post('/:id/archive', authenticate, archiveProject);
router.post('/:id/restore', authenticate, restoreProject);
router.post('/:id/favorite', authenticate, toggleFavoriteProject);
router.post('/:id/members', authenticate, addProjectMember);
router.post('/:id/invitations/respond', authenticate, respondToProjectInvitation);
router.get('/:id/members', authenticate, listProjectMembers);
router.put('/:id/members/:memberId', authenticate, updateProjectMember);
router.delete('/:id/members/:memberId', authenticate, removeProjectMember);
router.get('/:id/components', authenticate, listProjectComponents);
router.post('/:id/components', authenticate, addProjectComponent);
router.get('/:id/versions', authenticate, listProjectVersions);
router.post('/:id/versions', authenticate, addProjectVersion);
router.get('/:id/issue-types', authenticate, listProjectIssueTypes);
router.post('/:id/issue-types', authenticate, addProjectIssueType);
router.get('/:id/custom-fields', authenticate, listProjectCustomFields);
router.post('/:id/custom-fields', authenticate, addProjectCustomField);
router.delete('/:id', authenticate, deleteProject);

export default router;
