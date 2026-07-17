import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  addProjectChatReaction,
  createProjectChatMessage,
  deleteProjectChatMessage,
  getProjectChatMessages,
  markProjectChatMessageRead,
  updateProjectChatMessage,
} from '../controllers/chatController.js';

const router = Router();

router.get('/projects/:projectId/messages', authenticate, getProjectChatMessages);
router.post('/projects/:projectId/messages', authenticate, createProjectChatMessage);
router.put('/projects/:projectId/messages/:messageId', authenticate, updateProjectChatMessage);
router.delete('/projects/:projectId/messages/:messageId', authenticate, deleteProjectChatMessage);
router.post('/projects/:projectId/messages/:messageId/read', authenticate, markProjectChatMessageRead);
router.post('/projects/:projectId/messages/:messageId/reactions', authenticate, addProjectChatReaction);

export default router;
